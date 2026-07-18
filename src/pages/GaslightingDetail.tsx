import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import RiskGauge from '../components/ui/RiskGauge'
import TopNav from '../components/TopNav'
import type { ChatRiskLevel } from '../lib/analyzeChat'
import { fetchGaslightingCheckById, type GaslightingHistoryItem } from '../lib/history'

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

function formatDate(value: string): string {
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로가기"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-gray shadow-card"
    >
      ←
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
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
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-chip bg-primary px-3 py-1 text-[11px] font-bold text-white shadow-btn active:opacity-80"
    >
      {copied ? '복사됨!' : '복사하기'}
    </button>
  )
}

export default function GaslightingDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<GaslightingHistoryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchGaslightingCheckById(id)
      .then((data) => {
        if (!data) {
          setError('분석 기록을 찾을 수 없어요.')
          return
        }
        setItem(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : '분석 기록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-6 lg:max-w-[720px] lg:px-6 lg:py-10">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-2xl">심리 가드 분석 결과</h1>
        </div>

        {loading && <p className="mt-8 text-center text-sm text-text-gray">불러오는 중...</p>}

        {!loading && error && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm text-text-gray">{error}</p>
            <Link to="/profile" className="mt-2 text-sm font-bold text-primary">
              프로필로 돌아가기
            </Link>
          </div>
        )}

        {!loading && item && (
          <div className="mt-4 flex flex-col gap-4 lg:mt-6">
            <Card className="flex items-center gap-4 py-4">
              <RiskGauge score={item.confidence} level={levelMap[item.risk_level]} />
              <div>
                <Chip tone={levelMap[item.risk_level]}>{item.risk_level}</Chip>
                <p className="mt-1.5 text-[11px] leading-relaxed text-text-gray">AI 확신도 {item.confidence}%</p>
                <p className="mt-1 text-[11px] text-text-lightgray">{formatDate(item.created_at)}</p>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-bold text-text-dark">받은 메시지</h2>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-dark">{item.input_text}</p>
            </Card>

            <Card>
              <h2 className="text-sm font-bold text-text-dark">탐지된 조작 패턴</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.patterns.map((pattern) => (
                  <Chip key={pattern.label} tone={patternTone(pattern.score)}>
                    {pattern.label} {pattern.score}%
                  </Chip>
                ))}
              </div>
            </Card>

            {item.suggested_response && (
              <Card className="border-primary/30 bg-primary-bg/30">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-xs font-bold text-text-dark">💬 AI 추천 대응 멘트</h2>
                  <CopyButton text={item.suggested_response} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-dark">{item.suggested_response}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
