// 규칙 기반 심리 가드(가스라이팅 탐지) 매칭 로직.
// psychGuardPatterns.ts의 카테고리별 키워드가 대화 텍스트에 등장하는지 순수 문자열
// 포함(includes) 검사로만 판단한다 — 정규식이나 형태소 분석 없이, riskPatternFilter.ts와
// 같은 방식으로 새 네트워크/DB 호출 없이 가볍게 동작하도록 만들었다.

import { PSYCH_GUARD_CATEGORIES } from './psychGuardPatterns.ts'

export type PsychGuardGrade = 'safe' | 'caution' | 'danger'

export interface PsychGuardCategoryBreakdown {
  category: string
  matchedKeywords: string[]
  score: number
}

export interface PsychGuardResult {
  totalScore: number
  grade: PsychGuardGrade
  categoryBreakdown: PsychGuardCategoryBreakdown[]
  /** 서로 다른 카테고리가 2개 이상 매칭돼 복합 보너스가 적용됐는지 여부. */
  hasComplexPattern: boolean
}

// 서로 다른 카테고리 2개 이상이 동시에 매칭되면, 단일 설득 기법이 아니라 여러 기법을
// 조합한 정황이므로 가산점을 준다.
const COMPLEX_PATTERN_MIN_CATEGORIES = 2
const COMPLEX_PATTERN_BONUS = 5

const GRADE_THRESHOLDS = { caution: 21, danger: 51 } as const

function gradeFromScore(totalScore: number): PsychGuardGrade {
  if (totalScore >= GRADE_THRESHOLDS.danger) return 'danger'
  if (totalScore >= GRADE_THRESHOLDS.caution) return 'caution'
  return 'safe'
}

export function analyzePsychGuard(conversationText: string): PsychGuardResult {
  const text = conversationText ?? ''

  const categoryBreakdown: PsychGuardCategoryBreakdown[] = PSYCH_GUARD_CATEGORIES.map(({ category, weight, keywords }) => {
    const matchedKeywords = keywords.filter((keyword) => text.includes(keyword))
    return {
      category,
      matchedKeywords,
      score: matchedKeywords.length * weight,
    }
  })

  const matchedCategoryCount = categoryBreakdown.filter((c) => c.matchedKeywords.length > 0).length
  const hasComplexPattern = matchedCategoryCount >= COMPLEX_PATTERN_MIN_CATEGORIES

  const categoryScoreSum = categoryBreakdown.reduce((sum, c) => sum + c.score, 0)
  const totalScore = categoryScoreSum + (hasComplexPattern ? COMPLEX_PATTERN_BONUS : 0)

  return {
    totalScore,
    grade: gradeFromScore(totalScore),
    categoryBreakdown,
    hasComplexPattern,
  }
}
