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

// contract_risk_patterns의 실제 컬럼(2026-07-20 기준. 스키마 확정본은
// supabase/migrations/20260721000005_confirm_contract_risk_patterns_schema.sql 참고).
interface RiskPattern {
  pattern_name: string
  description: string
  severity: string
  recommended_action: string
}

interface HugDefaulterMatch {
  name: string
  address: string
  similarity: number
}

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallScore: { type: 'INTEGER', description: '0(매우 위험)~100(매우 안전) 종합 위험도 점수' },
    riskLevel: { type: 'STRING', enum: RISK_LEVELS },
    // RAG 고도화: contract_risk_patterns의 실제 피해 사례 20건과 계약서를 대조한 AI 추정.
    // 실제 HUG 명단 대조가 아니라 패턴 텍스트 기반 "추정"이라는 점을 프론트에서도 명확히 구분해서
    // 보여줘야 한다 — 진짜 명단 대조 결과는 hugDefaulterMatch(아래)를 따로 둔다.
    hugLandlordCheck: {
      type: 'OBJECT',
      properties: {
        isBlacklisted: { type: 'BOOLEAN', description: 'contract_risk_patterns의 실제 피해 패턴과 계약서 내용이 일치하는지 여부 (true/false)' },
        reason: { type: 'STRING', description: '패턴 DB의 어떤 사례와 계약서 내용을 1:1로 대조했는지에 대한 근거 설명' },
      },
      required: ['isBlacklisted', 'reason'],
    },
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
          explanation: { type: 'STRING', description: '어려운 용어 해설 및 왜 위험/주의/안전한지에 대한 AI 설명' },
        },
        required: ['summary', 'level', 'explanation'],
      },
    },
    recommendedActions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '세입자가 임대인/중개사에게 요구해야 할 필수 방어 특약 및 실행 조치 목록',
    },
    aiComment: { type: 'STRING', description: '전체 상황에 대한 한국어 종합 코멘트 및 행동 요령' },
    landlordName: {
      type: 'STRING',
      description: '첨부된 문서(등기부등본/계약서)에서 확인되는 임대인(소유자) 성명. 확인할 수 없으면 빈 문자열.',
    },
  },
  required: [
    'overallScore',
    'riskLevel',
    'hugLandlordCheck',
    'categories',
    'detectedClauses',
    'recommendedActions',
    'aiComment',
  ],
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
  if (patterns.length === 0) return '(연동된 피해 패턴 데이터가 없습니다)'
  return patterns
    .map(
      (p, i) =>
        `[피해 사례 ${i + 1}] ${p.pattern_name} | 위험도: ${p.severity}\n- 실제 피해 내용: ${p.description}\n- 권장 대처 및 방어 특약: ${p.recommended_action}`,
    )
    .join('\n\n')
}

function buildPrompt(input: AnalyzeRequest, referenceData: string): string {
  return `당신은 대한민국 최고 수준의 부동산 임대차 계약서 분석 및 전세사기 예방 AI 전문가입니다.
아래 매물 정보, 첨부 문서, 그리고 [전세사기 및 독소조항 피해 패턴 DB]를 바탕으로 위험도를 정밀 진단하세요.

[RAG 시스템 연동 - 전세사기 및 독소조항 피해 패턴 DB]
${referenceData}

[분석 대상 매물 정보]
- 매물 주소: ${input.address ?? '정보 없음'}
- 전세보증금: ${input.deposit ? `${input.deposit}만원` : '정보 없음'}
- 건물 유형: ${input.buildingType ?? '정보 없음'}

[엄격한 AI 분석 지침]
1. 제공된 [전세사기 및 독소조항 피해 패턴 DB]의 실제 피해 조건들과 사용자가 제출한 계약서/등기부등본 텍스트를 1:1로 정밀 대조하세요.
2. 만약 DB에 등록된 대항력 악용, 신탁 부동산, 바지사장 넘기기, 과도한 원상복구 등 위험 패턴이 발견된다면, hugLandlordCheck.isBlacklisted를 true로 설정하고, overallScore(종합점수)는 무조건 40점 미만(danger)으로 낮추세요. hugLandlordCheck는 어디까지나 패턴 DB 기반 "추정"이며 실제 임대인 신원을 확인한 결과가 아니라는 점을 reason에서도 분명히 하세요.
3. 세입자가 이해하기 어려운 법률 용어(대항력, 신탁, 당해세 등)는 쉽게 풀어서 설명하고, DB에 제시된 '권장 대처 및 방어 특약' 내용을 recommendedActions에 적극 반영하세요.
4. 데이터베이스에 명시된 사실과 규칙에 철저히 기반하여 답변하고, 근거 없는 거짓말(환각 현상)을 엄격히 차단하세요.
5. 권리관계, 특약사항, 전세가율, 건물상태 4개 항목을 각각 0~100점(높을수록 안전)으로 평가하세요.
6. 첨부된 문서가 있다면 위험하거나 주의가 필요한 조항을 detectedClauses에 구체적으로 추출하세요. 첨부 문서가 없다면 빈 배열([])로 두세요.
7. 첨부된 문서에서 임대인(소유자) 성명이 확인되면 landlordName에 그대로 적으세요. 확인할 수 없으면 빈 문자열로 두세요.
8. 반드시 지정된 JSON 스키마 형식으로만 응답을 반환하세요.`
}

/** contract_risk_patterns 전체를 가져온다. 20건 내외의 작은 지식베이스라 키워드 검색 없이
 *  전부 프롬프트에 포함시킨다(테이블이 크게 늘어나면 다시 검색 기반으로 바꿀 것). */
async function fetchAllRiskPatterns(supabaseAdmin: ReturnType<typeof createClient>): Promise<RiskPattern[]> {
  const { data, error } = await supabaseAdmin
    .from('contract_risk_patterns')
    .select('pattern_name, description, severity, recommended_action')

  if (error) {
    console.error('fetchAllRiskPatterns failed, continuing without reference cases', error)
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

  const riskPatterns = await fetchAllRiskPatterns(supabaseAdmin)
  const referenceKnowledge = formatRiskPatterns(riskPatterns)

  const parts: Record<string, unknown>[] = [{ text: buildPrompt(input, referenceKnowledge) }]
  if (input.fileBase64 && input.fileMimeType) {
    parts.push({ inline_data: { mime_type: input.fileMimeType, data: input.fileBase64 } })
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

    if (!ok) {
      console.error(`Gemini API error ${status} after retries (${Date.now() - startedAt}ms)`, bodyText.slice(0, 500))
      return jsonResponse({ error: 'AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502)
    }

    const geminiJson = JSON.parse(bodyText)
    const text: string | undefined = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      console.error('Empty Gemini response', JSON.stringify(geminiJson).slice(0, 500))
      return jsonResponse({ error: 'AI로부터 응답을 받지 못했습니다.' }, 502)
    }

    const result = JSON.parse(text)

    // 임대인 이름이 확인됐다면 HUG 상습채무불이행자 명단과 trigram 유사도로 "사실 대조"한다.
    // 위의 hugLandlordCheck(AI 패턴 추정)와는 별개로, 이쪽이 실제 명단 기반이라 신뢰도가 더 높다.
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
    console.error(`analyze-contract error after ${Date.now() - startedAt}ms`, err)
    if (err instanceof Error && err.name === 'AbortError') {
      return jsonResponse({ error: 'AI 분석 요청이 시간 초과됐습니다. 잠시 후 다시 시도해주세요.' }, 502)
    }
    return jsonResponse({ error: '분석 중 오류가 발생했습니다.' }, 500)
  }
})
