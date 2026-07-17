// Shared risk-scoring logic used by both `fetch-market-data` and `fetch-region-buzz`.
// Each function only updates its own half of the picture (jeonse_ratio vs news_mentions),
// so after upserting its own metrics it calls `recalculateAllRiskScores` to recombine
// whatever is currently in `region_stats` into an up-to-date risk_score/risk_level.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * 전세가율 점수: 80% 이하 0~30점, 80~100% 30~60점, 100~130% 60~90점, 130%↑ 90~100점.
 * 구간 내 선형 보간. 130% 이상 구간은 150%에서 100점에 도달하도록 캡을 두고(그 이상은
 * 100점으로 saturate), 100%를 초과하는 "깡통전세" 위험이 지나치게 완만해지지 않게 한다.
 */
export function jeonseRatioScore(ratio: number): number {
  if (ratio <= 80) return clamp((ratio / 80) * 30, 0, 30)
  if (ratio <= 100) return 30 + (ratio - 80) * 1.5
  if (ratio <= 130) return 60 + (ratio - 100) * 1.0
  const capped = Math.min(ratio, 150)
  return 90 + ((capped - 130) / (150 - 130)) * 10
}

/**
 * 뉴스언급 점수: 0~5건 0~20점, 6~20건 20~50점, 21건↑ 50~100점.
 * 구간 내 선형 보간. 21건 이상 구간은 50건에서 100점에 도달하도록 캡을 둔다.
 */
export function newsMentionScore(count: number): number {
  if (count <= 5) return (count / 5) * 20
  if (count <= 20) return 20 + ((count - 5) / (20 - 5)) * 30
  const capped = Math.min(count, 50)
  return 50 + ((capped - 20) / (50 - 20)) * 50
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export type RiskLevel = '위험' | '주의' | '안전'

export interface RiskResult {
  riskScore: number
  riskLevel: RiskLevel
}

// 실제 전세사기 사건은 시세 파악이 어렵고 매매가 대비 전세가가 뒤틀리기 쉬운 연립다세대(빌라)
// 쪽에서 압도적으로 많이 발생한다. 아파트는 실거래가/시세 정보가 투명해 상대적으로 안전한
// 편이므로, 위험도 계산에서는 빌라 전세가율에 더 큰 가중치를 둔다.
const VILLA_JEONSE_RATIO_WEIGHT = 0.7
const APT_JEONSE_RATIO_WEIGHT = 1 - VILLA_JEONSE_RATIO_WEIGHT

/**
 * 아파트/빌라 전세가율을 하나의 "실효 전세가율"로 합친다. 둘 중 한쪽만 그 달 실거래가
 * 없으면(null) 있는 쪽 비율을 그대로 쓰고, 둘 다 없으면 아직 점수를 매길 근거가 없다.
 */
export function effectiveJeonseRatio(aptJeonseRatio: number | null, villaJeonseRatio: number | null): number | null {
  if (aptJeonseRatio == null && villaJeonseRatio == null) return null
  if (aptJeonseRatio == null) return villaJeonseRatio
  if (villaJeonseRatio == null) return aptJeonseRatio
  return aptJeonseRatio * APT_JEONSE_RATIO_WEIGHT + villaJeonseRatio * VILLA_JEONSE_RATIO_WEIGHT
}

/** jeonseRatio가 없으면(아파트/빌라 모두 그달 실거래 데이터 없음) 아직 점수를 매길 근거가 부족하므로 null을 반환한다. */
export function calculateRisk(jeonseRatio: number | null, newsMentions: number | null): RiskResult | null {
  if (jeonseRatio == null) return null

  const jScore = jeonseRatioScore(jeonseRatio)
  const nScore = newsMentionScore(newsMentions ?? 0)
  const riskScore = Math.round((jScore * 0.7 + nScore * 0.3) * 10) / 10
  const riskLevel: RiskLevel = riskScore >= 70 ? '위험' : riskScore >= 40 ? '주의' : '안전'

  return { riskScore, riskLevel }
}

/** region_stats의 모든 행을 순회하며 현재 저장된 아파트/빌라 전세가율+news_mentions로 risk_score를 다시 계산한다. */
export async function recalculateAllRiskScores(supabase: SupabaseClient): Promise<void> {
  const { data: rows, error } = await supabase
    .from('region_stats')
    .select('region_code, jeonse_ratio, villa_jeonse_ratio, news_mentions')

  if (error || !rows) {
    console.error('recalculateAllRiskScores: failed to load region_stats', error)
    return
  }

  for (const row of rows) {
    const jeonseRatio = effectiveJeonseRatio(row.jeonse_ratio, row.villa_jeonse_ratio)
    const result = calculateRisk(jeonseRatio, row.news_mentions)
    if (!result) continue

    const { error: updateError } = await supabase
      .from('region_stats')
      .update({ risk_score: result.riskScore, risk_level: result.riskLevel })
      .eq('region_code', row.region_code)

    if (updateError) {
      console.error(`recalculateAllRiskScores: failed to update ${row.region_code}`, updateError)
    }
  }
}
