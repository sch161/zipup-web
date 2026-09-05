import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrokenText from '../components/ui/BrokenText'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import TopNav from '../components/TopNav'
import { fetchLegalTerms, type LegalTerm } from '../lib/legalTerms'

const CATEGORIES = ['법률 용어', '계약서 용어', '시사 용어'] as const
type Category = (typeof CATEGORIES)[number]
type CategoryFilter = '전체' | Category

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

function TermCard({ item }: { item: LegalTerm }) {
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-text-dark">{item.term}</h2>
        {item.category && (
          <Chip tone="warning" className="shrink-0">
            {item.category}
          </Chip>
        )}
      </div>

      <div className="rounded-2xl bg-subtle p-3">
        <p className="text-[11px] font-bold text-text-gray">📖 법제처/법령 공식 정의</p>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-text-dark">
          <BrokenText text={item.officialDefinition} />
        </p>
      </div>

      {item.plainExplanation && (
        <div className="rounded-2xl bg-primary-bg/40 p-3">
          <p className="text-[11px] font-bold text-primary">💡 쉽게 풀면</p>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-text-dark">
            <BrokenText text={item.plainExplanation} />
          </p>
        </div>
      )}

      {item.source && (
        <p className="text-pretty text-[10px] leading-relaxed text-text-lightgray">근거: {item.source}</p>
      )}
    </Card>
  )
}

export default function Glossary() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [terms, setTerms] = useState<LegalTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState<CategoryFilter>('전체')

  useEffect(() => {
    fetchLegalTerms()
      .then(setTerms)
      .catch(() => setTerms([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim()
    return terms.filter((t) => {
      if (category !== '전체' && t.category !== category) return false
      if (!q) return true
      return (
        t.term.includes(q) ||
        t.officialDefinition.includes(q) ||
        (t.plainExplanation?.includes(q) ?? false)
      )
    })
  }, [terms, query, category])

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-6 lg:max-w-[720px] lg:px-6 lg:py-10">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-2xl">용어 사전</h1>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-text-lightgray">
          <BrokenText text="계약서·안내 화면에 나오는 전세 관련 용어를 법령 원문과 쉬운 설명으로 함께 보여줘요. 아직 공식 정의를 확인하지 못한 용어는 확인되는 대로 추가돼요." />
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="용어 검색 (예: 대항력)"
          className="mt-4 h-11 w-full rounded-input border-[1.2px] border-border bg-white px-4 text-sm text-text-dark outline-none placeholder:text-text-lightgray focus:border-primary"
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['전체', ...CATEGORIES] as CategoryFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-chip px-3 py-1.5 text-xs font-bold transition-colors ${
                category === c ? 'bg-primary text-white' : 'bg-subtle text-text-gray'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {loading ? (
            <p className="py-8 text-center text-xs text-text-lightgray">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed text-center">
              <p className="text-pretty text-xs leading-relaxed text-text-gray">
                {terms.length === 0
                  ? '아직 공식 정의가 확인된 용어가 없어요.'
                  : '검색·필터 조건에 맞는 용어가 없어요.'}
              </p>
            </Card>
          ) : (
            filtered.map((item) => <TermCard key={item.term} item={item} />)
          )}
        </div>
      </div>
    </div>
  )
}
