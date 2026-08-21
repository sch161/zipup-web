// 계약서 분석 종합 위험도 계산. Gemini가 아니라 여기서 카테고리별 점수의 가중평균으로 직접
// 계산해야 재현 가능하고, 카테고리 점수와 종합 점수가 항상 수학적으로 맞는다.
// 점수는 SignalMap(안심 시그널 맵)과 동일하게 "높을수록 위험"이다.

export type CategoryName = '권리관계' | '특약사항' | '전세가율' | '건물상태'

export const CATEGORY_WEIGHTS: Record<CategoryName, number> = {
  권리관계: 0.35,
  특약사항: 0.3,
  전세가율: 0.25,
  건물상태: 0.1,
}

export interface ScoredCategory {
  name: CategoryName
  /** null이면 "데이터 없음" — 종합 점수 계산에서 제외하고 남은 카테고리끼리 가중치를 재정규화한다. */
  score: number | null
  comment: string
}

export type ScoreDirection = 'high_is_risky' | 'legacy_low_is_risky'
export type RiskLevel = 'danger' | 'warning' | 'success'

export interface ScoreBreakdownItem {
  name: string
  score: number | null
  /** 실제로 반영된 가중치(0~1). score가 null이면 0. 남은 카테고리끼리 정규화된 값이라
   *  CATEGORY_WEIGHTS의 원래 값과 다를 수 있다(예: 전세가율 제외 시 나머지 3개가 더 커짐). */
  weight: number
  included: boolean
}

export interface OverallScoreResult {
  overallScore: number
  riskLevel: RiskLevel
  breakdown: ScoreBreakdownItem[]
}

// 기존 "40점 미만 = danger(낮을수록 위험)" 기준을 100-score로 정확히 반전한 경계값이다
// (40 -> 60). 대칭적으로 유도됐으므로 절반 지점(30)이 success 상한이 된다.
const DANGER_THRESHOLD = 60
const SUCCESS_THRESHOLD = 30
// hasCriticalPattern일 때 강제로 끌어올리는 하한 — DANGER_THRESHOLD보다 커야 danger 등급이 된다.
const CRITICAL_PATTERN_FLOOR = 61

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score > DANGER_THRESHOLD) return 'danger'
  if (score > SUCCESS_THRESHOLD) return 'warning'
  return 'success'
}

/** 카테고리 점수들의 가중평균으로 종합 점수를 계산한다. hasCriticalPattern이 true면(치명적
 *  독소조항/HUG 명단 일치 등) 계산 결과가 낮게 나와도 최소 CRITICAL_PATTERN_FLOOR(danger 하한)로
 *  끌어올린다 — 계산상 안전해 보여도 실제로는 위험한 패턴이 확인됐다는 뜻이므로. */
export function calculateOverallScore(categories: ScoredCategory[], hasCriticalPattern: boolean): OverallScoreResult {
  const availableWeightSum = categories.reduce(
    (sum, c) => sum + (c.score != null ? CATEGORY_WEIGHTS[c.name] : 0),
    0,
  )

  const breakdown: ScoreBreakdownItem[] = categories.map((c) => ({
    name: c.name,
    score: c.score,
    weight: c.score != null && availableWeightSum > 0 ? CATEGORY_WEIGHTS[c.name] / availableWeightSum : 0,
    included: c.score != null,
  }))

  let overallScore =
    availableWeightSum > 0
      ? Math.round(
          categories.reduce(
            (sum, c) => sum + (c.score != null ? c.score * (CATEGORY_WEIGHTS[c.name] / availableWeightSum) : 0),
            0,
          ),
        )
      : 0

  if (hasCriticalPattern) {
    overallScore = Math.max(overallScore, CRITICAL_PATTERN_FLOOR)
  }
  overallScore = Math.min(100, Math.max(0, overallScore))

  return { overallScore, riskLevel: scoreToRiskLevel(overallScore), breakdown }
}
