import type { ReactNode } from 'react'

type ChipTone = 'primary' | 'danger' | 'warning' | 'success'

interface ChipProps {
  tone?: ChipTone
  children: ReactNode
  className?: string
}

const tones: Record<ChipTone, string> = {
  primary: 'bg-primary-bg text-primary-dark',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
}

export default function Chip({ tone = 'primary', children, className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-3 py-1 text-xs font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
