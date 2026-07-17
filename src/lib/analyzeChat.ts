import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ChatRiskLevel = '위험' | '주의' | '안전'

export interface ChatPattern {
  label: string
  score: number
}

export interface ChatAnalysisResult {
  riskLevel: ChatRiskLevel
  confidence: number
  patterns: ChatPattern[]
  isWarning: boolean
  aiReply: string
  suggestedResponse: string
}

export interface AnalyzeChatInput {
  message?: string
  /** 카카오톡/문자 캡처 이미지 */
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

/** Calls the `analyze-chat` Supabase Edge Function, which holds the Gemini API key server-side. */
export async function analyzeChat(input: AnalyzeChatInput): Promise<ChatAnalysisResult> {
  const body: Record<string, unknown> = { message: input.message }

  if (input.file) {
    body.fileBase64 = await fileToBase64(input.file)
    body.fileMimeType = input.file.type
  }

  const { data, error } = await supabase.functions.invoke<ChatAnalysisResult>('analyze-chat', { body })

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
