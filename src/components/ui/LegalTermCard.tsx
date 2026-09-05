import BrokenText from './BrokenText'
import Card from './Card'
import Chip from './Chip'
import type { LegalTerm } from '../../lib/legalTerms'

/** 검증된 legal_terms 카드 — /glossary와 /law-search(검증된 용어와 일치할 때)가 공유한다. */
export default function LegalTermCard({ item }: { item: LegalTerm }) {
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
