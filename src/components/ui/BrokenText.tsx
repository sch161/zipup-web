import { Fragment } from 'react'

interface BrokenTextProps {
  text: string
}

const NBSP = ' '

/**
 * 쉼표(,)·마침표(.) 뒤에서만 줄이 "바뀔 수 있도록" 절 내부의 공백을 줄바꿈 없는
 * 공백(NBSP)으로 바꾼다. 구절이 한 줄에 들어가면 그대로 붙어 있고, 구두점 뒤의
 * 일반 공백에서만 우선적으로 줄이 넘어간다. 다만 컨테이너보다 긴 구절을 만나면
 * (예: 좁은 사이드바) break-words가 안전장치로 그 구절 내부에서도 줄바꿈해
 * 레이아웃이 깨지는 것을 막는다. 소수점(82.5%)처럼 공백 없이 붙는 마침표는
 * 구절 구분자로 취급하지 않는다.
 */
export default function BrokenText({ text }: BrokenTextProps) {
  const parts = text.split(/(?<=[,.])\s+/).filter(Boolean)
  return (
    <span className="break-words">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.split(' ').join(NBSP)}
          {i < parts.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </span>
  )
}
