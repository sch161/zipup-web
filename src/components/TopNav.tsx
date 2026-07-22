import { Link, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface TopNavProps {
  variant?: 'app' | 'auth'
}

const menuItems = [
  { to: '/home', label: '홈' },
  { to: '/psych-guard', label: '심리가드' },
  { to: '/map', label: '안심맵' },
]

export default function TopNav({ variant = 'app' }: TopNavProps) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <header className="hidden h-[72px] w-full shrink-0 items-center border-b border-border bg-white lg:flex">
      <div className="mx-auto flex w-full max-w-[960px] items-center justify-between px-8">
        <Link to={variant === 'app' ? '/home' : '/'} className="flex items-center">
          <img src="/illustrations/logo.svg" alt="ZIPUP" className="h-[22px]" />
        </Link>

        {variant === 'app' ? (
          <nav className="flex items-center gap-7">
            {menuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'text-base font-semibold text-primary' : 'text-sm font-medium text-text-lightgray'
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={handleLogout} className="text-sm font-medium text-text-lightgray">
              로그아웃
            </button>
            <Link
              to="/profile"
              aria-label="프로필"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-dark bg-white"
            >
              <img src="/illustrations/person.svg" alt="" className="h-[18px] w-[18px]" />
            </Link>
          </nav>
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
