import { Link, NavLink } from 'react-router-dom'

interface TopNavProps {
  variant?: 'app' | 'auth'
}

const menuItems = [
  { to: '/home', label: '홈' },
  { to: '/psych-guard', label: '심리가드' },
  { to: '/map', label: '안심맵' },
]

export default function TopNav({ variant = 'app' }: TopNavProps) {
  return (
    <header className="hidden h-[76px] w-full shrink-0 items-center border-b border-border bg-white lg:flex">
      <div className="mx-auto flex w-full max-w-[960px] items-center justify-between px-6">
        <Link to={variant === 'app' ? '/home' : '/'} className="text-[22px] font-bold text-primary">
          ZIPUP
        </Link>

        {variant === 'app' && (
          <nav className="flex items-center gap-8">
            {menuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'font-bold text-primary' : 'font-medium text-text-gray'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {variant === 'app' ? (
          <Link
            to="/profile"
            aria-label="프로필"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-bg text-lg"
          >
            👤
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-bold text-primary">
              로그인
            </Link>
            <Link to="/signup" className="rounded-btn bg-primary px-4 py-2 text-sm font-bold text-white shadow-btn">
              회원가입
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
