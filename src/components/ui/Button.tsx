import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'filled' | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

const base =
  'h-12 rounded-btn font-bold text-sm w-full flex items-center justify-center gap-2 transition-opacity active:opacity-80 disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<ButtonVariant, string> = {
  filled: 'bg-primary text-white shadow-btn',
  outline: 'bg-white text-primary border-[1.5px] border-primary',
}

export default function Button({ variant = 'filled', className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
