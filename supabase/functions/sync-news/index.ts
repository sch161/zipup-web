// Supabase Edge Function: sync-news
// Fetches "전세사기" news from the Naver News Search API and upserts them into
// the `news` table (title/url/media/published_at). Meant to be triggered by a
// cron schedule or invoked manually — not called from the frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NAVER_CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID')
const NAVER_CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SEARCH_QUERY = '전세사기'

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

// Naver titles/descriptions contain <b> highlight tags and HTML entities.
function stripHtml(text: string): string {
  return text
    .replace(/<\/?b>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim()
}

function mediaFromLink(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

interface NaverNewsItem {
  title: string
  link: string
  originallink?: string
  description: string
  pubDate: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set in Supabase Secrets')
    return jsonResponse({ error: 'Naver API 설정이 되어있지 않습니다.' }, 500)
  }

  try {
    // Quote the phrase for an exact match and sort by relevance (`sim`) — plain
    // keyword + date-sort pulled in loosely related real-estate news that only
    // shared a character or two with "전세사기".
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(`"${SEARCH_QUERY}"`)}&display=20&sort=sim`
    const naverRes = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    })

    if (!naverRes.ok) {
      const errText = await naverRes.text()
      console.error('Naver API error', naverRes.status, errText)
      return jsonResponse({ error: 'Naver 뉴스 검색에 실패했습니다.' }, 502)
    }

    const naverJson: { items?: NaverNewsItem[] } = await naverRes.json()
    const items = naverJson.items ?? []

    const rows = items.map((item) => {
      const link = item.originallink || item.link
      return {
        title: stripHtml(item.title),
        url: link,
        media: mediaFromLink(link),
        published_at: new Date(item.pubDate).toISOString(),
      }
    })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error } = await supabase.from('news').upsert(rows, { onConflict: 'url' })

    if (error) {
      console.error('news upsert error', error)
      return jsonResponse({ error: '뉴스 저장에 실패했습니다.' }, 500)
    }

    return jsonResponse({ synced: rows.length })
  } catch (err) {
    console.error('sync-news error', err)
    return jsonResponse({ error: '뉴스 동기화 중 오류가 발생했습니다.' }, 500)
  }
})
