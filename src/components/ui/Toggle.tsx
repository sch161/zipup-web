interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

export default function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-dark">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-gray">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'justify-end bg-primary' : 'justify-start bg-[#DAD7D0]'
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-card" />
      </button>
    </div>
  )
}
