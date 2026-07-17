import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import TopNav from '../components/TopNav'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [region, setRegion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, region: region || null },
      },
    })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    if (!data.session) {
      // Email confirmation is required before a session is issued
      setInfo('가입 확인 메일을 보냈어요. 메일함에서 인증 링크를 확인해주세요.')
      return
    }

    navigate('/home')
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="auth" />
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-app lg:max-w-[440px] lg:rounded-card lg:border lg:border-border lg:bg-card lg:p-10 lg:shadow-card">
          <h1 className="text-lg font-bold text-primary">회원가입</h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Input
              id="name"
              label="이름"
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              id="signup-email"
              type="email"
              label="이메일"
              placeholder="example@zipup.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="signup-password"
              type="password"
              label="비밀번호"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              id="signup-password-confirm"
              type="password"
              label="비밀번호 확인"
              placeholder="비밀번호를 다시 입력하세요"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
            />
            <Input
              id="region"
              label="거주 지역 (선택)"
              placeholder="예) 서울시 관악구"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />

            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            {info && <p className="text-xs font-medium text-primary-dark">{info}</p>}

            <Button type="submit" className="mt-2" disabled={loading}>
              {loading ? '가입 중...' : '가입 완료'}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-text-gray">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="font-bold text-primary">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
