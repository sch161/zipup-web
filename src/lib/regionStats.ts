import { supabase } from './supabase'

export type RiskLevel = '위험' | '주의' | '안전'

export interface RegionStat {
  region_code: string
  region_name: string
  avg_sale_price: number | null
  avg_jeonse_price: number | null
  jeonse_ratio: number | null
  villa_avg_sale_price: number | null
  villa_avg_jeonse_price: number | null
  villa_jeonse_ratio: number | null
  news_mentions: number | null
  risk_score: number | null
  risk_level: RiskLevel | null
  updated_at: string
}

export async function fetchRegionStats(): Promise<RegionStat[]> {
  const { data, error } = await supabase
    .from('region_stats')
    .select(
      'region_code, region_name, avg_sale_price, avg_jeonse_price, jeonse_ratio, villa_avg_sale_price, villa_avg_jeonse_price, villa_jeonse_ratio, news_mentions, risk_score, risk_level, updated_at',
    )

  if (error) throw new Error(error.message)
  return data ?? []
}
