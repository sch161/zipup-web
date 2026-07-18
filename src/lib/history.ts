import { supabase } from './supabase'
import type { AnalysisCategory, AnalysisResult, DetectedClause, RiskLevel } from './analyzeContract'
import type { ChatPattern, ChatRiskLevel } from './analyzeChat'

export interface AnalysisHistoryItem {
  id: string
  address: string | null
  deposit: string | null
  building_type: string | null
  overall_score: number
  risk_level: RiskLevel
  categories: AnalysisCategory[]
  detected_clauses: DetectedClause[]
  recommended_actions: string[]
  ai_comment: string | null
  created_at: string
}

const ANALYSIS_COLUMNS =
  'id, address, deposit, building_type, overall_score, risk_level, categories, detected_clauses, recommended_actions, ai_comment, created_at'

export async function fetchAnalysisHistory(userId: string): Promise<AnalysisHistoryItem[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AnalysisHistoryItem[]
}

/** Reconstructs the `AnalysisResult` shape the `/analysis` detail screen expects. */
export function toAnalysisResult(item: AnalysisHistoryItem): AnalysisResult {
  return {
    overallScore: item.overall_score,
    riskLevel: item.risk_level,
    categories: item.categories,
    detectedClauses: item.detected_clauses,
    recommendedActions: item.recommended_actions,
    aiComment: item.ai_comment ?? '',
  }
}

export interface GaslightingHistoryItem {
  id: string
  input_text: string
  risk_level: ChatRiskLevel
  confidence: number
  patterns: ChatPattern[]
  suggested_response: string | null
  created_at: string
}

const GASLIGHTING_COLUMNS = 'id, input_text, risk_level, confidence, patterns, suggested_response, created_at'

export async function fetchGaslightingHistory(userId: string): Promise<GaslightingHistoryItem[]> {
  const { data, error } = await supabase
    .from('gaslighting_checks')
    .select(GASLIGHTING_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as GaslightingHistoryItem[]
}

export async function fetchGaslightingCheckById(id: string): Promise<GaslightingHistoryItem | null> {
  const { data, error } = await supabase
    .from('gaslighting_checks')
    .select(GASLIGHTING_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as unknown as GaslightingHistoryItem | null
}
