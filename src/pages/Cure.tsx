import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import RiskGauge from '../components/ui/RiskGauge'
import { analyzeChat, type ChatAnalysisResult, type ChatRiskLevel } from '../lib/analyzeChat'

type GaugeLevel = 'danger' | 'warning' | 'success'

const levelMap: Record<ChatRiskLevel, GaugeLevel> = {
  위험: 'danger',
  주의: 'warning',
  안전: 'success',
}

function patternTone(score: number): GaugeLevel {
  if (score >= 70) return 'danger'
  if (score >= 40) return 'warning'
  return 'success'
}

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  imageUrl?: string
  analysis?: ChatAnalysisResult
}

function SuggestedResponseCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable — nothing else we can do here
    }
  }

  return (
    <Card className="border-primary/30 bg-primary-bg/30">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-text-dark">
          💬 AI 추천 대응 멘트
        </h3>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-chip bg-primary px-3 py-1 text-[11px] font-bold text-white shadow-btn active:opacity-80"
        >
          {copied ? '복사됨!' : '복사하기'}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-text-dark">{text}</p>
    </Card>
  )
}

function AnalysisPanel({ analysis }: { analysis: ChatAnalysisResult }) {
  const level = levelMap[analysis.riskLevel]

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-3 self-start">
      {analysis.isWarning && (
        <div className="flex items-center gap-1.5 rounded-input bg-danger-bg px-3 py-2 text-[11px] font-bold text-danger">
          ⚠️ 조작 정황이 의심되는 메시지예요. 아래 내용을 꼭 확인하세요.
        </div>
      )}

      <Card className="flex items-center gap-4 py-4">
        <RiskGauge score={analysis.confidence} level={level} size={92} strokeWidth={9} />
        <div>
          <Chip tone={level}>{analysis.riskLevel}</Chip>
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-gray">AI 확신도 {analysis.confidence}%</p>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {analysis.patterns.map((pattern) => (
          <Chip key={pattern.label} tone={patternTone(pattern.score)}>
            {pattern.label} {pattern.score}%
          </Chip>
        ))}
      </div>

      <SuggestedResponseCard text={analysis.suggestedResponse} />
    </div>
  )
}

export default function Cure() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    setImage(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  async function handleSend(e: FormEvent | KeyboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const text = input.trim()
    if ((!text && !image) || loading) return

    setError(null)
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        imageUrl: image ? URL.createObjectURL(image) : undefined,
      },
    ])
    const fileToSend = image ?? undefined
    setInput('')
    setImage(null)
    setLoading(true)

    try {
      const result = await analyzeChat({ message: text || undefined, file: fileToSend })
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'ai', text: result.aiReply, analysis: result },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pt-6 lg:gap-6 lg:px-0 lg:pt-0">
      <header className="lg:hidden">
        <h1 className="text-lg font-bold text-primary">🛡️ 심리 가드</h1>
        <p className="mt-1 text-xs text-text-gray">
          중개인/집주인에게 받은 문자를 붙여넣거나 캡처 이미지를 첨부하면 AI가 조작 패턴을 분석해드려요.
        </p>
      </header>

      <div className="hidden lg:block">
        <h1 className="text-2xl font-bold text-text-dark">🛡️ 심리 가드</h1>
        <p className="mt-1 text-sm text-text-gray">
          중개인/집주인에게 받은 문자를 붙여넣거나 카카오톡 캡처 이미지를 첨부하면 AI가 가스라이팅(조작) 패턴을 분석해드려요.
        </p>
      </div>

      <Card className="flex flex-col p-0">
        <div ref={scrollRef} className="flex h-[58vh] flex-col gap-3 overflow-y-auto p-4 lg:h-[520px]">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl">🛡️</span>
              <p className="text-xs leading-relaxed text-text-gray">
                아직 분석한 메시지가 없어요.
                <br />
                받은 문자 내용을 붙여넣거나 캡처 이미지를 첨부해서 전송해보세요.
              </p>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex max-w-[80%] flex-col items-end gap-1.5 self-end">
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="첨부한 캡처 이미지"
                    className="max-h-56 rounded-2xl border border-border object-contain"
                  />
                )}
                {msg.text && (
                  <div className="whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-xs leading-relaxed text-white">
                    {msg.text}
                  </div>
                )}
              </div>
            ) : (
              <div key={msg.id} className="flex w-full flex-col gap-2">
                <div className="flex items-start gap-2 self-start">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm">
                    🤖
                  </span>
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-border bg-white px-4 py-2.5 text-xs leading-relaxed text-text-dark">
                    {msg.text}
                  </div>
                </div>
                {msg.analysis && <AnalysisPanel analysis={msg.analysis} />}
              </div>
            ),
          )}

          {loading && (
            <div className="flex items-center gap-2 self-start">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm">
                🤖
              </span>
              <div className="rounded-2xl border border-border bg-white px-4 py-2.5 text-xs text-text-gray">
                AI가 메시지를 분석하고 있어요...
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-2 border-t border-border p-3">
          {image && (
            <div className="flex items-center gap-2 self-start rounded-input bg-bg px-3 py-1.5">
              <span className="text-xs font-medium text-primary-dark">📷 {image.name}</span>
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="첨부 이미지 삭제"
                className="text-xs font-bold text-text-gray"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label
              htmlFor="chat-image-upload"
              aria-label="캡처 이미지 첨부"
              className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-input border-[1.2px] border-border bg-white text-lg active:opacity-80"
            >
              📷
              <input
                id="chat-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="받은 문자 내용을 입력하거나 캡처 이미지를 첨부하세요"
              rows={2}
              className="h-[46px] flex-1 resize-none rounded-input border-[1.2px] border-border bg-white px-4 py-2.5 text-sm text-text-dark outline-none placeholder:text-text-lightgray focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading || (!input.trim() && !image)}
              className="flex h-[46px] shrink-0 items-center justify-center rounded-btn bg-primary px-5 text-sm font-bold text-white shadow-btn transition-opacity active:opacity-80 disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </form>
      </Card>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
