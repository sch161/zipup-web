import { supabase } from './supabase'

export interface LegalTerm {
  term: string
  officialDefinition: string
  plainExplanation: string | null
  category: string | null
  source: string | null
}

/** official_definition이 채워진 용어만 가져온다 — 아직 정의를 못 찾은 용어는 화면에 노출하지
 * 않고, 나중에 채워지면 자동으로 나타나게 한다(별도 코드 변경 불필요). */
export async function fetchLegalTerms(): Promise<LegalTerm[]> {
  const { data, error } = await supabase
    .from('legal_terms')
    .select('term, official_definition, plain_explanation, category, source')
    .not('official_definition', 'is', null)
    .order('term', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    term: row.term,
    officialDefinition: row.official_definition as string,
    plainExplanation: row.plain_explanation,
    category: row.category,
    source: row.source,
  }))
}
