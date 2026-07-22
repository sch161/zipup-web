import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export default function Input({ label, id, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text-gray">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`h-[46px] w-full rounded-input border-[1.2px] border-border-input bg-white px-4 text-sm text-text-dark outline-none placeholder:text-text-lightgray focus:border-primary ${className}`}
        {...props}
      />
    </div>
  )
}
