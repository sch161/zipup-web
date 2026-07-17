import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export default function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-border bg-card p-4 shadow-card ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
