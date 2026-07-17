import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: (active: boolean) => ReactNode
}

const iconProps = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: active ? '#FF6B35' : '#C9BEB6',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

const items: NavItem[] = [
  {
    to: '/home',
    label: '홈',
    icon: (active) => (
      <svg {...iconProps(active)}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    to: '/psych-guard',
    label: '심리가드',
    icon: (active) => (
      <svg {...iconProps(active)}>
        <path d="M12 3 4 6v6c0 4.5 3.4 7.7 8 9 4.6-1.3 8-4.5 8-9V6l-8-3Z" />
      </svg>
    ),
  },
  {
    to: '/map',
    label: '지도',
    icon: (active) => (
      <svg {...iconProps(active)}>
        <path d="M9 20 3 17V5l6 3m0 12 6-3m-6 3V8m6 9 6 3V8l-6-3m0 12V5m0 3-6-3" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: '프로필',
    icon: (active) => (
      <svg {...iconProps(active)}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-10 flex h-[66px] w-full items-stretch border-t border-border bg-white lg:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/home'}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          {({ isActive }) => (
            <>
              {item.icon(isActive)}
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-text-lightgray'}`}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
