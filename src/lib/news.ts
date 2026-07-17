import { supabase } from './supabase'

export interface NewsItem {
  id: string
  title: string
  url: string
  media: string | null
  published_at: string
}

export async function fetchLatestNews(limit = 5): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select('id, title, url, media, published_at')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data ?? []
}
