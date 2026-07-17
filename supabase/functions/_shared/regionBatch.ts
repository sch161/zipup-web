// fetch-market-data / fetch-region-buzz가 ALL_REGIONS(전국 252개 지역)를 한 번의 호출로 전부
// 순회하면 Edge Function 실행 시간 제한(150초)을 넘길 수 있어, region_sync_cursor 테이블에
// 진행 위치를 저장해두고 호출될 때마다 다음 BATCH_SIZE개만 처리한다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Region } from './regions.ts'

// fetch-market-data가 아파트에 더해 연립다세대(빌라) 매매/전월세까지 조회하게 되면서 지역당
// 실측 처리 시간이 ~0.3초 → ~2.7초로 늘었다(빌라 API 응답이 아파트보다 느림). 50개 기준으로는
// 150초 실행 제한에 거의 다 채워 위험했던 것을 실측 후 30개로 낮춰 여유를 확보했다
// (30 × 2.7초 ≈ 81초, 배치 수는 6 → 9로 늘어남 — see *_batch_region_stats_cron.sql).
export const BATCH_SIZE = 30

export interface RegionBatch {
  regions: Region[]
  batchStartIndex: number
  totalRegions: number
}

/**
 * region_sync_cursor에서 syncName의 진행 위치를 읽어 다음 배치를 반환하고, 커서를 그만큼
 * 전진시킨다. cycle_date가 오늘(UTC)과 다르면 next_index를 0으로 리셋해 새로 처음부터
 * 순회를 시작한다. 이미 오늘 순회가 끝났다면(next_index >= 전체 지역 수) 빈 배치를 반환하므로
 * 남은 호출들은 그냥 아무 일도 하지 않고 끝난다.
 */
export async function takeNextBatch(
  supabase: SupabaseClient,
  syncName: string,
  allRegions: Region[],
): Promise<RegionBatch> {
  const today = new Date().toISOString().slice(0, 10) // pg_cron 스케줄과 동일한 UTC 기준 날짜

  const { data: cursor, error } = await supabase
    .from('region_sync_cursor')
    .select('next_index, cycle_date')
    .eq('sync_name', syncName)
    .maybeSingle()

  if (error) throw error

  const isNewCycle = !cursor || cursor.cycle_date !== today
  const startIndex = isNewCycle ? 0 : cursor.next_index
  const batch = allRegions.slice(startIndex, startIndex + BATCH_SIZE)
  const nextIndex = startIndex + batch.length

  const { error: upsertError } = await supabase
    .from('region_sync_cursor')
    .upsert({ sync_name: syncName, next_index: nextIndex, cycle_date: today }, { onConflict: 'sync_name' })

  if (upsertError) throw upsertError

  return { regions: batch, batchStartIndex: startIndex, totalRegions: allRegions.length }
}
