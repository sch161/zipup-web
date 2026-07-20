import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RiskLevel = 'danger' | 'warning' | 'success'

export interface AnalysisCategory {
  name: string
  score: number
  level: RiskLevel
  comment: string
}

export interface DetectedClause {
  summary: string
  level: RiskLevel
  explanation: string
}

export interface HugDefaulterMatch {
  name: string
  address: string
  similarity: number
}

export interface HugDefaulterMatchResult {
  matched: boolean
  matches: HugDefaulterMatch[]
}

export interface AnalysisResult {
  overallScore: number
  riskLevel: RiskLevel
  categories: AnalysisCategory[]
  detectedClauses: DetectedClause[]
  recommendedActions: string[]
  aiComment: string
  landlordName?: string
  hugDefaulterMatch?: HugDefaulterMatchResult
}

export interface AnalyzeContractInput {
  address?: string
  deposit?: string
  buildingType?: string
  file?: File
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Calls the `analyze-contract` Supabase Edge Function, which holds the Gemini API key server-side. */
export async function analyzeContract(input: AnalyzeContractInput): Promise<AnalysisResult> {
  const body: Record<string, unknown> = {
    address: input.address,
    deposit: input.deposit,
    buildingType: input.buildingType,
  }

  if (input.file) {
    body.fileBase64 = await fileToBase64(input.file)
    body.fileMimeType = input.file.type
  }

  const { data, error } = await supabase.functions.invoke<AnalysisResult>('analyze-contract', { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await error.context.json().catch(() => null)
      throw new Error(parsed?.error ?? error.message)
    }
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('AI 분석 결과를 받지 못했습니다.')
  }

  return data
}
