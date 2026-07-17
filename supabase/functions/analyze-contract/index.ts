// Supabase Edge Function: analyze-contract
// Calls Gemini to assess 전세사기 (lease-fraud) risk for a property / uploaded document.
// The Gemini API key is read from Supabase Secrets (Deno.env) — it never reaches the client.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Pinned model versions keep getting retired/restricted (2.0-flash, then 2.5-flash for new
// accounts) — "-latest" is a Google-managed alias that stays current automatically.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest'

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
  },
  required: ['overallScore', 'riskLevel', 'categories', 'recommendedActions', 'aiComment'],
}

function buildPrompt(input: AnalyzeRequest): string {
  return `당신은 한국 전세 계약의 "전세사기" 위험을 분석하는 전문 AI입니다.
아래 매물 정보와 (첨부되었다면) 등기부등본/계약서 이미지를 바탕으로 위험도를 분석하세요.

매물 주소: ${input.address ?? '정보 없음'}
전세보증금: ${input.deposit ? `${input.deposit}만원` : '정보 없음'}
건물 유형: ${input.buildingType ?? '정보 없음'}

지침:
1. 권리관계, 특약사항, 전세가율, 건물상태 4개 항목을 각각 0~100점(높을수록 안전)으로 평가하세요.
2. 종합 위험도 점수(overallScore, 0~100, 높을수록 안전)와 등급(riskLevel)을 산출하세요.
   등급 기준: 70점 이상 success(안전), 40~69점 warning(주의), 40점 미만 danger(위험).
3. 첨부된 문서가 있다면 위험하거나 주의가 필요한 조항을 detectedClauses에 구체적으로 추출하세요.
   첨부 문서가 없다면 빈 배열([])로 두세요. 근거 없이 추측하지 마세요.
4. recommendedActions에는 사용자가 바로 실행할 수 있는 조치를 문장으로 나열하세요.
5. aiComment에는 전체 상황을 친절한 한국어로 3~5문장 요약하세요.
6. 반드시 지정된 JSON 스키마 형식으로만 응답하세요.`
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

  const parts: Record<string, unknown>[] = [{ text: buildPrompt(input) }]
  if (input.fileBase64 && input.fileMimeType) {
    parts.push({ inline_data: { mime_type: input.fileMimeType, data: input.fileBase64 } })
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ANALYSIS_RESPONSE_SCHEMA,
          },
        }),
      },
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error', geminiRes.status, errText)
      return jsonResponse({ error: 'AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502)
    }

    const geminiJson = await geminiRes.json()
    const text: string | undefined = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      console.error('Empty Gemini response', JSON.stringify(geminiJson))
      return jsonResponse({ error: 'AI로부터 응답을 받지 못했습니다.' }, 502)
    }

    const result = JSON.parse(text)
    return jsonResponse(result)
  } catch (err) {
    console.error('analyze-contract error', err)
    return jsonResponse({ error: '분석 중 오류가 발생했습니다.' }, 500)
  }
})
