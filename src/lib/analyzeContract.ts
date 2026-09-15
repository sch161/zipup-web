import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RiskLevel = 'danger' | 'warning' | 'success'

/** 2026-08-21 이후 분석: 점수는 SignalMap(안심 시그널 맵)과 동일하게 "높을수록 위험"이다.
 * legacy_low_is_risky는 그 이전에 저장된 기존 이력 — 낮을수록 위험이었다. AnalysisResult의
 * scoreDirection을 보고 화면에서 다르게 안내해야 한다(src/pages/Analysis.tsx 참고). */
export type ScoreDirection = 'high_is_risky' | 'legacy_low_is_risky'

export interface AnalysisCategory {
  name: string
  /** null이면 "데이터 없음"(예: 매물 주소로 지역 시세를 찾지 못한 경우) — 종합 점수 계산에서도 제외됨. */
  score: number | null
  level: RiskLevel | null
  comment: string
}

/** 종합 점수 계산에 각 카테고리가 얼마의 가중치로 반영됐는지. score가 null인 카테고리는
 * included:false, weight:0으로 오고 나머지 카테고리끼리 가중치가 재정규화된다. */
export interface ScoreBreakdownItem {
  name: string
  score: number | null
  weight: number
  included: boolean
}

/** 위험 조항의 근거가 되는 실제 법 조문(legal_provisions 테이블). analyze-contract가
 * pattern_legal_provisions로 매칭된 위험 패턴에 연결된 조문만 Gemini에 후보로 주고,
 * Gemini가 그 후보 중에서 골랐을 때만(또는 없으면 null) 여기 채워서 내려준다. */
export interface LegalProvision {
  lawName: string
  article: string
  title: string
  plainExplanation: string
  sourceUrl: string
}

export interface DetectedClause {
  summary: string
  level: RiskLevel
  explanation: string
  legalProvision?: LegalProvision | null
}

export interface HugDefaulterMatch {
  name: string
  address: string
  similarity: number
}

export interface HugDefaulterMatchResult {
  matched: boolean
  matches: HugDefaulterMatch[]
}

/** contract_risk_patterns 피해 사례와 계약서 내용을 AI가 대조한 "추정" 결과.
 * hug_defaulters 실명단을 대조하는 HugDefaulterMatchResult보다 신뢰도가 낮다. */
export interface HugLandlordCheck {
  isBlacklisted: boolean
  reason: string
}

export interface AnalysisResult {
  overallScore: number
  riskLevel: RiskLevel
  /** 새 분석에만 있음(과거 이력엔 없어 undefined) — 어떤 카테고리가 몇 %로 반영됐는지.
   * 결과 화면에는 표시하지 않는다(일반적인 산정 기준 설명은 /scoring 페이지로 분리) —
   * 응답을 그 자체로 검증 가능하게 남겨두기 위해 계속 반환한다. */
  scoreBreakdown?: ScoreBreakdownItem[]
  /** 과거 이력(scoreDirection 컬럼 추가 이전 마이그레이션)에는 없을 수 있다 — 그 경우
   * 'legacy_low_is_risky'로 취급해야 안전하다(값이 없다고 새 기준으로 잘못 해석하면 안 됨). */
  scoreDirection?: ScoreDirection
  categories: AnalysisCategory[]
  detectedClauses: DetectedClause[]
  recommendedActions: string[]
  aiComment: string
  landlordName?: string
  hugDefaulterMatch?: HugDefaulterMatchResult
  hugLandlordCheck?: HugLandlordCheck
}

export interface AnalyzeContractInput {
  address?: string
  deposit?: string
  buildingType?: string
  file?: File
}

// 서버(supabase/functions/_shared/imageMask.ts)의 MAX_DIMENSION_PX와 반드시 같은 값으로 맞춰둔다.
// PDF는 이미 lib/pdfToImage.ts에서 이 한도에 맞춰 렌더링되지만, 카메라로 찍은 사진은 원본
// 해상도(요즘 폰 12MP 이상) 그대로 들어온다 — 이걸 리사이즈 없이 서버로 보내면 magick-wasm이
// 리사이즈 "전에" 원본 해상도로 먼저 디코드해야 해서, 서버 쪽 MAX_DIMENSION_PX를 아무리 낮춰도
// 디코드 비용 자체가 CPU 시간 제한(2초)을 넘겨버린다(실측: cpu_time_used 3872ms, 546 에러).
// 브라우저는 이 제한이 없으므로 다운스케일을 여기서 먼저 끝내 서버가 항상 작은 이미지만 받게 한다.
const MAX_UPLOAD_DIMENSION_PX = 1200

async function resizeImageForUpload(file: File): Promise<{ blob: Blob; mimeType: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const longestSide = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION_PX / longestSide)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context를 생성할 수 없습니다.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    // PNG(계약서 스캔/PDF 변환본, 무손실)는 PNG로 그대로 두고, 카메라 JPG 사진만 JPG로 재인코딩한다 —
    // 문서 스캔까지 매번 JPEG로 바꾸면 압축 손실로 작은 글씨 OCR 인식률이 떨어질 수 있어서다.
    const outputMimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다.'))),
        outputMimeType,
        outputMimeType === 'image/jpeg' ? 0.9 : undefined,
      )
    })
    return { blob, mimeType: outputMimeType }
  } finally {
    bitmap.close()
  }
}

// base64.ts(supabase/functions/_shared)와 동일한 이유로 청크 단위로 인코딩한다 — 바이트 1개씩
// String.fromCharCode + concat을 하면 이미지 크기에 비례해 브라우저 메인 스레드가 오래 묶인다.
const BASE64_CHUNK_SIZE = 8192

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE)))
  }
  return btoa(chunks.join(''))
}

async function unwrapFunctionsError(error: NonNullable<Awaited<ReturnType<typeof supabase.functions.invoke>>['error']>): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const parsed = await error.context.json().catch(() => null)
    return new Error(parsed?.error ?? error.message)
  }
  return new Error(error.message)
}

/** Calls the `analyze-contract` Supabase Edge Function, which holds the Gemini API key server-side. */
export async function analyzeContract(input: AnalyzeContractInput): Promise<AnalysisResult> {
  const body: Record<string, unknown> = {
    address: input.address,
    deposit: input.deposit,
    buildingType: input.buildingType,
  }

  if (input.file) {
    const { blob, mimeType } = await resizeImageForUpload(input.file)
    body.fileBase64 = await blobToBase64(blob)
    body.fileMimeType = mimeType
  }

  const { data, error } = await supabase.functions.invoke<AnalysisResult>('analyze-contract', { body })

  if (error) throw await unwrapFunctionsError(error)

  if (!data) {
    throw new Error('AI 분석 결과를 받지 못했습니다.')
  }

  return data
}
