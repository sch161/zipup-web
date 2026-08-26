import { supabase } from './supabase'

export interface PatternSource {
  organization: string
  title: string
  description: string
  url: string
}

export async function fetchPatternSources(): Promise<PatternSource[]> {
  const { data, error } = await supabase
    .from('pattern_sources')
    .select('organization, title, description, url')
    .order('id', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}
