import { Link } from 'react-router-dom'
import BrokenText from './BrokenText'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** text 안에 terms(용어 사전에 있는 용어)가 등장하면 밑줄 처리해 /glossary로 링크하고,
 * 나머지 부분은 기존처럼 BrokenText로 줄바꿈 처리한다. 긴 용어부터 매칭해야 "임차인"이
 * "계약갱신요구권" 같은 다른 용어의 부분 문자열을 깨뜨리지 않는다(현재 데이터엔 없지만
 * 용어가 늘어날 걸 대비). */
export default function GlossaryHighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0 || !text) return <BrokenText text={text} />

  const sorted = [...terms].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'g')
  const parts = text.split(pattern)

  return (
    <>
      {parts.map((part, i) =>
        terms.includes(part) ? (
          <Link
            key={i}
            to={`/glossary?q=${encodeURIComponent(part)}`}
            className="font-bold text-primary underline underline-offset-2"
          >
            {part}
          </Link>
        ) : (
          <BrokenText key={i} text={part} />
        ),
      )}
    </>
  )
}
