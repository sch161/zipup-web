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

export interface DetectedClause {
  summary: string
  level: RiskLevel
  explanation: string
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

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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
    body.fileBase64 = await fileToBase64(input.file)
    body.fileMimeType = input.file.type
  }

  const { data, error } = await supabase.functions.invoke<AnalysisResult>('analyze-contract', { body })

  if (error) throw await unwrapFunctionsError(error)

  if (!data) {
    throw new Error('AI 분석 결과를 받지 못했습니다.')
  }

  return data
}
