import type { ReactNode } from 'react'

type ChipTone = 'primary' | 'danger' | 'warning' | 'success'

interface ChipProps {
  tone?: ChipTone
  children: ReactNode
  className?: string
}

const tones: Record<ChipTone, string> = {
  primary: 'bg-primary text-white',
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-white',
  success: 'bg-success text-white',
}

export default function Chip({ tone = 'primary', children, className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2.5 py-1 text-[11px] font-bold leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
