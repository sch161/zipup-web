// Supabase Edge Function: fetch-region-buzz
// For a batch of regions from `_shared/regions.ts` (전국 252개 지역), searches the Naver News
// API for `"{지역명} 전세사기"` and stores the result's `total` count (total matching articles,
// not just the page returned) into `region_stats.news_mentions`.
//
// 252개 지역을 한 번에 순회하면 Edge Function 실행 시간 제한(150초)에 걸릴 수 있으므로, 매
// 호출마다 region_sync_cursor에 저장된 위치부터 BATCH_SIZE(50)개만 처리한다 — see
// _shared/regionBatch.ts. pg_cron이 20분 간격으로 하루 6번, fetch-market-data 10분 뒤에
// 호출해 전체를 순회한다 — see supabase/migrations/*_batch_region_stats_cron.sql.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { requireCronSecret } from '../_shared/cronAuth.ts'
import { ALL_REGIONS } from '../_shared/regions.ts'
import { takeNextBatch } from '../_shared/regionBatch.ts'
import { recalculateAllRiskScores } from '../_shared/riskScore.ts'

const NAVER_CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID')
const NAVER_CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function fetchMentionTotal(regionName: string): Promise<number> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(`"${regionName} 전세사기"`)}&display=1`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET!,
    },
  })

  if (!res.ok) {
    throw new Error(`Naver API HTTP ${res.status}`)
  }

  const json: { total?: number } = await res.json()
  return json.total ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = requireCronSecret(req)
  if (authError) return authError

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set in Supabase Secrets')
    return jsonResponse({ error: 'Naver API 설정이 되어있지 않습니다.' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { regions, batchStartIndex, totalRegions } = await takeNextBatch(supabase, 'fetch-region-buzz', ALL_REGIONS)

  let updated = 0
  let failed = 0

  for (const region of regions) {
    try {
      const newsMentions = await fetchMentionTotal(region.name)

      const { error } = await supabase.from('region_stats').upsert(
        {
          region_code: region.code,
          region_name: region.name,
          news_mentions: newsMentions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'region_code' },
      )

      if (error) throw error
      updated++
    } catch (err) {
      console.error(`fetch-region-buzz: failed for ${region.name} (${region.code})`, err)
      failed++
    }

    // Naver API 호출량 제한을 배려한 짧은 텀
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  await recalculateAllRiskScores(supabase)

  return jsonResponse({ batchStartIndex, batchSize: regions.length, totalRegions, updated, failed })
})
