import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import BrokenText from '../components/ui/BrokenText'
import Card from '../components/ui/Card'
import LegalTermCard from '../components/ui/LegalTermCard'
import TopNav from '../components/TopNav'
import { fetchLegalTerms, type LegalTerm } from '../lib/legalTerms'
import { searchLegalTermsLive, type RawLawSearchResult } from '../lib/lawSearch'

const UNAVAILABLE_MESSAGE = '지금은 이 기능을 이용할 수 없습니다. 잠시 후 다시 시도해주세요.'

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

function RawResultCard({ item }: { item: RawLawSearchResult }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-text-dark">{item.term}</h3>
        {item.dictionaryLabel && (
          <span className="shrink-0 rounded-chip bg-subtle px-2 py-0.5 text-[10px] font-bold text-text-gray">
            {item.dictionaryLabel}
          </span>
        )}
      </div>
      <p className="text-pretty text-xs leading-relaxed text-text-dark">
        {item.definition ? <BrokenText text={item.definition} /> : '이 항목에는 정의 텍스트가 없어요.'}
      </p>
      {item.source && <p className="text-[10px] leading-relaxed text-text-lightgray">출처: {item.source}</p>}
      <a
        href={item.detailUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-0.5 self-start text-[11px] font-bold text-primary underline underline-offset-2"
      >
        법제처 원문 보기 →
      </a>
    </Card>
  )
}

export default function LawSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [verifiedTerms, setVerifiedTerms] = useState<LegalTerm[]>([])
  const [searchedFor, setSearchedFor] = useState<string | null>(null)
  const [verifiedMatch, setVerifiedMatch] = useState<LegalTerm | null>(null)
  const [showLive, setShowLive] = useState(false)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveResults, setLiveResults] = useState<RawLawSearchResult[] | null>(null)
  const [liveTruncated, setLiveTruncated] = useState(false)

  useEffect(() => {
    fetchLegalTerms()
      .then(setVerifiedTerms)
      .catch(() => setVerifiedTerms([]))
  }, [])

  async function runLiveSearch(term: string) {
    setLiveLoading(true)
    setLiveError(null)
    setLiveResults(null)
    try {
      const res = await searchLegalTermsLive(term)
      setLiveResults(res.results)
      setLiveTruncated(res.truncated)
    } catch {
      setLiveError(UNAVAILABLE_MESSAGE)
    } finally {
      setLiveLoading(false)
      setShowLive(true)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const term = query.trim()
    if (!term) return

    setSearchedFor(term)
    setShowLive(false)
    setLiveResults(null)
    setLiveError(null)

    const match = verifiedTerms.find((t) => t.term === term)
    setVerifiedMatch(match ?? null)

    if (!match) {
      await runLiveSearch(term)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-6 lg:max-w-[720px] lg:px-6 lg:py-10">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-2xl">법령 원문 검색</h1>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-text-lightgray">
          <BrokenText text="용어 사전(9개)에 없는 단어도 법제처 원문에서 바로 찾아볼 수 있어요. 다만 이 검색은 사람이 검증하지 않은 결과라는 점을 꼭 기억해주세요." />
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어를 입력하세요 (예: 근저당)"
            className="h-11 flex-1 rounded-input border-[1.2px] border-border bg-white px-4 text-sm text-text-dark outline-none placeholder:text-text-lightgray focus:border-primary"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-btn bg-primary px-5 text-sm font-bold text-white shadow-btn active:opacity-80"
          >
            검색
          </button>
        </form>

        {searchedFor && (
          <div className="mt-4 flex flex-col gap-3">
            {verifiedMatch && (
              <>
                <p className="text-[11px] font-bold text-text-gray">✅ 검증된 용어 사전 결과</p>
                <LegalTermCard item={verifiedMatch} />

                {!showLive && (
                  <button
                    type="button"
                    onClick={() => runLiveSearch(searchedFor)}
                    className="self-start text-xs font-bold text-primary underline underline-offset-2"
                  >
                    검증 안 된 추가 검색 결과 보기 →
                  </button>
                )}
              </>
            )}

            {liveLoading && <p className="py-4 text-center text-xs text-text-lightgray">법제처 원문을 검색하는 중...</p>}

            {showLive && liveError && (
              <Card className="border-dashed text-center">
                <p className="text-pretty text-xs leading-relaxed text-text-gray">{liveError}</p>
              </Card>
            )}

            {showLive && !liveError && liveResults && (
              <div className="flex flex-col gap-2.5">
                <div className="rounded-card border-2 border-warning bg-warning-bg p-3">
                  <p className="text-pretty text-xs font-bold leading-relaxed text-text-dark">
                    ⚠️ 이 결과는 검증되지 않은 법제처 원문 검색 결과입니다. 무관한 법령이 섞여 있을 수 있으니 참고용으로만
                    확인하세요.
                  </p>
                </div>

                {liveResults.length === 0 ? (
                  <Card className="border-dashed text-center">
                    <p className="text-pretty text-xs leading-relaxed text-text-gray">검색 결과가 없어요.</p>
                  </Card>
                ) : (
                  <>
                    {liveResults.map((item, i) => (
                      <RawResultCard key={`${item.term}-${i}`} item={item} />
                    ))}
                    {liveTruncated && (
                      <p className="text-center text-[10px] text-text-lightgray">
                        결과가 많아 일부만 보여주고 있어요.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
