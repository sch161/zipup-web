// Supabase Edge Function: fetch-market-data
// Pulls last month's 아파트 AND 연립다세대(빌라) 매매(trade)/전월세(rent) real-transaction data
// from the MOLIT (국토교통부) API for a batch of regions from `_shared/regions.ts` (전국 252개
// 지역), computes 평균 매매가/전세가/전세가율 for each housing type, and upserts the results into
// `region_stats`. 빌라는 시세가 불투명해 실제 전세사기 위험이 훨씬 크므로, risk_score 계산에서는
// 아파트보다 빌라 전세가율에 더 큰 가중치를 준다 — see _shared/riskScore.ts.
//
// 252개 지역을 한 번에 순회하면 Edge Function 실행 시간 제한(150초)을 넘기므로, 매 호출마다
// region_sync_cursor에 저장된 위치부터 BATCH_SIZE(50)개만 처리한다 — see _shared/regionBatch.ts.
// pg_cron이 20분 간격으로 하루 6번 호출해 전체를 순회한다 — see
// supabase/migrations/*_batch_region_stats_cron.sql. Not called from the frontend.
//
// IMPORTANT: MOLIT_API_KEY must be the "일반 인증키 (디코딩)" value from data.go.kr, NOT the
// already-URL-encoded one — this code URL-encodes it itself via URLSearchParams.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { requireCronSecret } from '../_shared/cronAuth.ts'
import { ALL_REGIONS } from '../_shared/regions.ts'
import { takeNextBatch } from '../_shared/regionBatch.ts'
import { recalculateAllRiskScores } from '../_shared/riskScore.ts'

const MOLIT_API_KEY = Deno.env.get('MOLIT_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const APT_TRADE_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'
const APT_RENT_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'
// 연립다세대(빌라) 매매/전월세 — 아파트와 같은 API 패밀리라 요청/응답 형식이 동일하다.
const VILLA_TRADE_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade'
const VILLA_RENT_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent'

/** 이번 달은 아직 신고 건수가 적으므로, 데이터가 안정적인 "지난 달"을 기준으로 조회한다. */
function previousMonthYYYYMM(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const prevMonth = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1))
  const yyyy = prevMonth.getUTCFullYear()
  const mm = String(prevMonth.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}${mm}`
}

function parseAmount(raw: unknown): number | null {
  if (raw == null) return null
  const cleaned = String(raw).replace(/,/g, '').trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

interface MarketSummary {
  avgSalePrice: number | null
  avgJeonsePrice: number | null
  jeonseRatio: number | null
}

/** 매매/전월세 실거래 목록에서 평균 매매가, 평균 전세가(월세 없는 순수 전세만), 전세가율을 계산한다. */
function summarizeMarket(tradeItems: Record<string, unknown>[], rentItems: Record<string, unknown>[]): MarketSummary {
  const salePrices = tradeItems.map((i) => parseAmount(i.dealAmount)).filter((v): v is number => v != null)
  const jeonseDeposits = rentItems
    .filter((i) => (parseAmount(i.monthlyRent) ?? 0) === 0)
    .map((i) => parseAmount(i.deposit))
    .filter((v): v is number => v != null)

  const avgSalePrice = mean(salePrices)
  const avgJeonsePrice = mean(jeonseDeposits)
  const jeonseRatio = avgSalePrice && avgJeonsePrice ? (avgJeonsePrice / avgSalePrice) * 100 : null

  return { avgSalePrice, avgJeonsePrice, jeonseRatio }
}

/** data.go.kr's XML→JSON gateway wraps results as response.body.items.item, normalizing
 *  away the single-object-vs-array and empty-string-when-no-results quirks. */
async function fetchItems(endpoint: string, lawdCd: string, dealYmd: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    serviceKey: MOLIT_API_KEY!,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    numOfRows: '1000',
    pageNo: '1',
    _type: 'json',
  })

  const res = await fetch(`${endpoint}?${params.toString()}`)
  const rawText = await res.text()

  if (!res.ok) {
    throw new Error(`MOLIT API HTTP ${res.status}: ${rawText.slice(0, 200)}`)
  }

  let json: Record<string, any>
  try {
    json = JSON.parse(rawText)
  } catch {
    throw new Error(`MOLIT API non-JSON response: ${rawText.slice(0, 200)}`)
  }
  // 이 API는 성공 코드로 '00'이 아니라 '000'을 반환한다 (다른 data.go.kr API들과 다른 체계).
  const resultCode = json?.response?.header?.resultCode
  if (resultCode && !['00', '000'].includes(resultCode)) {
    throw new Error(`MOLIT API error ${resultCode}: ${json?.response?.header?.resultMsg}`)
  }

  const items = json?.response?.body?.items
  if (!items || typeof items === 'string') return []

  const item = items.item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = requireCronSecret(req)
  if (authError) return authError

  if (!MOLIT_API_KEY) {
    console.error('MOLIT_API_KEY is not set in Supabase Secrets')
    return jsonResponse({ error: '국토교통부 API 키가 설정되지 않았습니다.' }, 500)
  }

  const dealYmd = previousMonthYYYYMM()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { regions, batchStartIndex, totalRegions } = await takeNextBatch(supabase, 'fetch-market-data', ALL_REGIONS)

  const EMPTY_SUMMARY: MarketSummary = { avgSalePrice: null, avgJeonsePrice: null, jeonseRatio: null }

  let updated = 0
  let failed = 0
  let villaFailed = 0
  const sampleErrors: { region: string; message: string }[] = []
  const villaSampleErrors: { region: string; message: string }[] = []

  for (const region of regions) {
    // 아파트/빌라 호출을 allSettled로 동시에 날리되 결과는 따로 처리한다 — 두 그룹을 하나의
    // Promise.all/try-catch로 묶으면 (a) 한쪽이 실패할 때(예: 빌라 API가 아직 data.go.kr에서
    // 활용신청이 안 됐을 때) 이미 잘 동작하던 아파트 데이터 수집까지 막히고, (b) 순차로 나눠
    // 호출하면 지역당 처리 시간이 배로 늘어 배치 시간 예산을 넘길 수 있다.
    const [villaResult, aptResult] = await Promise.allSettled([
      Promise.all([fetchItems(VILLA_TRADE_ENDPOINT, region.code, dealYmd), fetchItems(VILLA_RENT_ENDPOINT, region.code, dealYmd)]),
      Promise.all([fetchItems(APT_TRADE_ENDPOINT, region.code, dealYmd), fetchItems(APT_RENT_ENDPOINT, region.code, dealYmd)]),
    ])

    let villa = EMPTY_SUMMARY
    if (villaResult.status === 'fulfilled') {
      villa = summarizeMarket(villaResult.value[0], villaResult.value[1])
    } else {
      console.error(`fetch-market-data: villa fetch failed for ${region.name} (${region.code})`, villaResult.reason)
      if (villaSampleErrors.length < 3) {
        villaSampleErrors.push({
          region: region.name,
          message: villaResult.reason instanceof Error ? villaResult.reason.message : String(villaResult.reason),
        })
      }
      villaFailed++
    }

    if (aptResult.status === 'fulfilled') {
      try {
        const apt = summarizeMarket(aptResult.value[0], aptResult.value[1])

        const { error } = await supabase
          .from('region_stats')
          .upsert(
            {
              region_code: region.code,
              region_name: region.name,
              avg_sale_price: apt.avgSalePrice,
              avg_jeonse_price: apt.avgJeonsePrice,
              jeonse_ratio: apt.jeonseRatio,
              villa_avg_sale_price: villa.avgSalePrice,
              villa_avg_jeonse_price: villa.avgJeonsePrice,
              villa_jeonse_ratio: villa.jeonseRatio,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'region_code' },
          )

        if (error) throw error
        updated++
      } catch (err) {
        console.error(`fetch-market-data: failed for ${region.name} (${region.code})`, err)
        if (sampleErrors.length < 3) {
          sampleErrors.push({ region: region.name, message: err instanceof Error ? err.message : String(err) })
        }
        failed++
      }
    } else {
      console.error(`fetch-market-data: apt fetch failed for ${region.name} (${region.code})`, aptResult.reason)
      if (sampleErrors.length < 3) {
        sampleErrors.push({
          region: region.name,
          message: aptResult.reason instanceof Error ? aptResult.reason.message : String(aptResult.reason),
        })
      }
      failed++
    }

    // 공공데이터포털 호출량 제한을 배려한 짧은 텀
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  await recalculateAllRiskScores(supabase)

  return jsonResponse({
    month: dealYmd,
    batchStartIndex,
    batchSize: regions.length,
    totalRegions,
    updated,
    failed,
    sampleErrors,
    villaFailed,
    villaSampleErrors,
  })
})
