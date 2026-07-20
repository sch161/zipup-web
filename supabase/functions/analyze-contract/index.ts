// Supabase Edge Function: analyze-contract
// Calls Gemini to assess 전세사기 (lease-fraud) risk for a property / uploaded document.
// The Gemini API key is read from Supabase Secrets (Deno.env) — it never reaches the client.
// Each analysis is also persisted to `analyses` via a service_role client (same pattern as analyze-chat).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Pinned model versions keep getting retired/restricted (2.0-flash, then 2.5-flash for new
// accounts) — "-latest" is a Google-managed alias that stays current automatically.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface AnalyzeRequest {
  address?: string
  deposit?: string
  buildingType?: string
  /** Base64-encoded scan of the 등기부등본/계약서, no data: prefix */
  fileBase64?: string
  fileMimeType?: string
}

const RISK_LEVELS = ['danger', 'warning', 'success'] as const

// 계약서 이미지/PDF에서 위험 판단에 쓸만한 핵심 키워드만 빠르게 뽑아내는 1차 호출용 스키마.
// RAG 검색(contract_risk_patterns)에 쓸 쿼리어를 만들기 위한 것으로, 최종 분석 스키마와는 별개다.
const KEYWORD_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keywords: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '전세사기 위험 판단에 중요한 핵심 키워드/조항 5~10개 (예: 근저당권, 신탁, 다가구, 확정일자, 위반건축물 등). 정보가 부족하면 빈 배열.',
    },
  },
  required: ['keywords'],
}

interface RiskPattern {
  category: string
  pattern_description: string
  risk_level: string
  example_clause: string | null
  source: string | null
}

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallScore: { type: 'INTEGER', description: '0(매우 위험)~100(매우 안전) 종합 위험도 점수' },
    riskLevel: { type: 'STRING', enum: RISK_LEVELS },
    categories: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '권리관계 | 특약사항 | 전세가율 | 건물상태 중 하나' },
          score: { type: 'INTEGER' },
          level: { type: 'STRING', enum: RISK_LEVELS },
          comment: { type: 'STRING' },
        },
        required: ['name', 'score', 'level', 'comment'],
      },
    },
    detectedClauses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING', description: '조항 원문 요약' },
          level: { type: 'STRING', enum: RISK_LEVELS },
          explanation: { type: 'STRING', description: '왜 위험/주의/안전한지에 대한 AI 설명' },
        },
        required: ['summary', 'level', 'explanation'],
      },
    },
    recommendedActions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '사용자가 취해야 할 실행 가능한 조치 목록',
    },
    aiComment: { type: 'STRING', description: '전체 상황에 대한 한국어 종합 코멘트' },
    landlordName: {
      type: 'STRING',
      description: '첨부된 문서(등기부등본/계약서)에서 확인되는 임대인(소유자) 성명. 확인할 수 없으면 빈 문자열.',
    },
  },
  required: ['overallScore', 'riskLevel', 'categories', 'recommendedActions', 'aiComment'],
}

interface HugDefaulterMatch {
  name: string
  address: string
  similarity: number
}

// 429(RESOURCE_EXHAUSTED)/503(UNAVAILABLE)는 대개 일시적인 과부하/쿼터 순간 스파이크라
// 잠깐 기다렸다 다시 보내면 성공하는 경우가 많다. 그 외 상태 코드(4xx 요청 오류 등)는
// 재시도해도 똑같이 실패할 뿐이므로 즉시 반환한다.
const GEMINI_RETRYABLE_STATUSES = new Set([429, 503])
const GEMINI_RETRY_DELAYS_MS = [1000, 3000]

interface GeminiCallResult {
  ok: boolean
  status: number
  bodyText: string
}

/** Gemini generateContent 호출. 429/503이면 지수 백오프(1초, 3초)로 최대 2회 더 재시도하고,
 *  그래도 실패하면 마지막 응답을 그대로 반환한다(호출자가 사용자 에러 처리). */
async function callGeminiWithRetry(url: string, requestBody: unknown, timeoutMs: number): Promise<GeminiCallResult> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const isLastAttempt = attempt >= GEMINI_RETRY_DELAYS_MS.length
    if (res.ok || !GEMINI_RETRYABLE_STATUSES.has(res.status) || isLastAttempt) {
      const bodyText = await res.text()
      return { ok: res.ok, status: res.status, bodyText }
    }

    const delayMs = GEMINI_RETRY_DELAYS_MS[attempt]
    console.error(`Gemini API ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 2}/${GEMINI_RETRY_DELAYS_MS.length + 1})`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

function formatRiskPatterns(patterns: RiskPattern[]): string {
  if (patterns.length === 0) return '(관련 참고 사례 없음)'
  return patterns
    .map(
      (p, i) =>
        `${i + 1}. [${p.category}/${p.risk_level}] ${p.pattern_description}${p.example_clause ? `\n   예시: ${p.example_clause}` : ''}`,
    )
    .join('\n')
}

function buildPrompt(input: AnalyzeRequest, riskPatterns: RiskPattern[]): string {
  return `당신은 한국 전세 계약의 "전세사기" 위험을 분석하는 전문 AI입니다.
아래 매물 정보와 (첨부되었다면) 등기부등본/계약서 이미지를 바탕으로 위험도를 분석하세요.

매물 주소: ${input.address ?? '정보 없음'}
전세보증금: ${input.deposit ? `${input.deposit}만원` : '정보 없음'}
건물 유형: ${input.buildingType ?? '정보 없음'}

참고 사례 (국토교통부 전세사기 예방 가이드라인 기반 위험 패턴 DB에서 검색됨. 실제 문서 내용이 아래 사례와
비슷한 패턴을 보이는지 판단 근거로만 활용하고, 해당하지 않으면 무리하게 끼워 맞추지 마세요):
${formatRiskPatterns(riskPatterns)}

지침:
1. 권리관계, 특약사항, 전세가율, 건물상태 4개 항목을 각각 0~100점(높을수록 안전)으로 평가하세요.
2. 종합 위험도 점수(overallScore, 0~100, 높을수록 안전)와 등급(riskLevel)을 산출하세요.
   등급 기준: 70점 이상 success(안전), 40~69점 warning(주의), 40점 미만 danger(위험).
3. 첨부된 문서가 있다면 위험하거나 주의가 필요한 조항을 detectedClauses에 구체적으로 추출하세요.
   첨부 문서가 없다면 빈 배열([])로 두세요. 근거 없이 추측하지 마세요.
4. recommendedActions에는 사용자가 바로 실행할 수 있는 조치를 문장으로 나열하세요.
5. aiComment에는 전체 상황을 친절한 한국어로 3~5문장 요약하세요.
6. 첨부된 문서에서 임대인(소유자) 성명이 확인되면 landlordName에 그대로 적으세요. 확인할 수 없으면 빈 문자열로 두세요.
7. 반드시 지정된 JSON 스키마 형식으로만 응답하세요.`
}

/** Gemini에 한 번 더 가벼운 호출을 보내 RAG 검색용 키워드만 뽑는다. 실패해도 빈 배열로 폴백. */
async function extractKeywords(input: AnalyzeRequest): Promise<string[]> {
  const parts: Record<string, unknown>[] = [
    {
      text: `아래 매물 정보와 (첨부되었다면) 문서 이미지에서 전세사기 위험 판단에 쓸 핵심 키워드 5~10개를 뽑으세요.
매물 주소: ${input.address ?? '정보 없음'}
전세보증금: ${input.deposit ? `${input.deposit}만원` : '정보 없음'}
건물 유형: ${input.buildingType ?? '정보 없음'}`,
    },
  ]
  if (input.fileBase64 && input.fileMimeType) {
    parts.push({ inline_data: { mime_type: input.fileMimeType, data: input.fileBase64 } })
  }

  try {
    const { ok, bodyText } = await callGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: KEYWORD_EXTRACTION_SCHEMA,
        },
      },
      10000,
    )
    if (!ok) return []
    const json = JSON.parse(bodyText)
    const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return []
    const parsed = JSON.parse(text)
    return Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()) : []
  } catch (err) {
    console.error('extractKeywords failed, falling back to empty list', err)
    return []
  }
}

/** keywords로 contract_risk_patterns.search_vector를 검색해 관련도 상위 패턴을 가져온다. */
async function fetchRiskPatterns(
  supabaseAdmin: ReturnType<typeof createClient>,
  keywords: string[],
): Promise<RiskPattern[]> {
  if (keywords.length === 0) return []

  // 각 키워드 내부 단어는 &(AND), 키워드끼리는 |(OR)로 묶어 to_tsquery 문법을 만든다.
  // tsquery 특수문자(& | ! ( ) : ')는 검색어에 포함될 일이 없는 일반 한국어 키워드라 별도 이스케이프 없이 제거만 한다.
  const tsQuery = keywords
    .map((k) => k.replace(/[&|!():']/g, ' ').trim().split(/\s+/).filter(Boolean).join(' & '))
    .filter(Boolean)
    .join(' | ')
  if (!tsQuery) return []

  const { data, error } = await supabaseAdmin
    .from('contract_risk_patterns')
    .select('category, pattern_description, risk_level, example_clause, source')
    .textSearch('search_vector', tsQuery, { config: 'simple' })
    .limit(5)

  if (error) {
    console.error('fetchRiskPatterns failed, continuing without reference cases', error)
    return []
  }
  return data ?? []
}

async function resolveUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length)
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token)
  return user?.id ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in Supabase Secrets')
    return jsonResponse({ error: 'AI 분석 기능이 설정되지 않았습니다. 관리자에게 문의하세요.' }, 500)
  }

  let input: AnalyzeRequest
  try {
    input = await req.json()
  } catch {
    return jsonResponse({ error: '요청 형식이 올바르지 않습니다.' }, 400)
  }

  if (!input.address && !input.fileBase64) {
    return jsonResponse({ error: '매물 주소 또는 분석할 문서가 필요합니다.' }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // RAG: Gemini 본 호출 전에 키워드를 뽑아 contract_risk_patterns에서 관련 사례를 찾아 프롬프트에 포함시킨다.
  const keywords = await extractKeywords(input)
  const riskPatterns = await fetchRiskPatterns(supabaseAdmin, keywords)

  const parts: Record<string, unknown>[] = [{ text: buildPrompt(input, riskPatterns) }]
  if (input.fileBase64 && input.fileMimeType) {
    parts.push({ inline_data: { mime_type: input.fileMimeType, data: input.fileBase64 } })
  }

  // TEMP DEBUG: short client-side timeout + extra diagnostics to find why this hangs — revert before shipping.
  const debugMeta = {
    model: GEMINI_MODEL,
    apiKeyLength: GEMINI_API_KEY?.length ?? 0,
    elapsedMs: 0,
  }
  const startedAt = Date.now()

  try {
    const { ok, status, bodyText } = await callGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        },
      },
      20000,
    )
    debugMeta.elapsedMs = Date.now() - startedAt

    if (!ok) {
      console.error('Gemini API error', status, bodyText)
      return jsonResponse(
        {
          error: 'AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
          debugStatus: status,
          debugText: bodyText.slice(0, 1000),
          debugMeta,
        },
        502,
      )
    }

    const geminiJson = JSON.parse(bodyText)
    const text: string | undefined = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      console.error('Empty Gemini response', JSON.stringify(geminiJson))
      return jsonResponse({ error: 'AI로부터 응답을 받지 못했습니다.', debugMeta, debugJson: geminiJson }, 502)
    }

    const result = JSON.parse(text)

    // 임대인 이름이 확인됐다면 HUG 상습채무불이행자 명단과 trigram 유사도로 대조한다.
    if (typeof result.landlordName === 'string' && result.landlordName.trim()) {
      const { data: nameMatches, error: nameMatchError } = await supabaseAdmin.rpc(
        'search_hug_defaulters_by_name',
        { query_name: result.landlordName.trim() },
      )
      if (nameMatchError) {
        console.error('search_hug_defaulters_by_name failed, continuing without match info', nameMatchError)
      } else {
        const matches = (nameMatches ?? []) as HugDefaulterMatch[]
        result.hugDefaulterMatch = { matched: matches.length > 0, matches }
      }
    }

    const userId = await resolveUserId(req)
    const { error: insertError } = await supabaseAdmin.from('analyses').insert({
      user_id: userId,
      address: input.address || null,
      deposit: input.deposit || null,
      building_type: input.buildingType || null,
      overall_score: result.overallScore,
      risk_level: result.riskLevel,
      categories: result.categories,
      detected_clauses: result.detectedClauses ?? [],
      recommended_actions: result.recommendedActions,
      ai_comment: result.aiComment,
    })

    if (insertError) {
      // Don't fail the user-facing analysis just because the history log failed to save.
      console.error('analyses insert error', insertError)
    }

    return jsonResponse(result)
  } catch (err) {
    debugMeta.elapsedMs = Date.now() - startedAt
    console.error('analyze-contract error', err)
    if (err instanceof Error && err.name === 'AbortError') {
      return jsonResponse({ error: 'Gemini 요청이 20초 안에 응답하지 않았습니다 (디버그).', debugMeta }, 502)
    }
    return jsonResponse({ error: '분석 중 오류가 발생했습니다.' }, 500)
  }
})
