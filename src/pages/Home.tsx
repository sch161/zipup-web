import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import Input from '../components/ui/Input'

interface NewsItem {
  id: string
  title: string
  date: string
  tone: 'danger' | 'warning'
  tag: string
}

const news: NewsItem[] = [
  {
    id: '1',
    title: '인천 미추홀구, 전세보증금 미반환 피해 200건 추가 접수',
    date: '2026.07.15',
    tone: 'danger',
    tag: '위험',
  },
  {
    id: '2',
    title: '수도권 빌라 전세가율 90% 육박…깡통전세 주의보',
    date: '2026.07.12',
    tone: 'warning',
    tag: '주의',
  },
  {
    id: '3',
    title: '정부, 전세사기 피해자 지원 특별법 시행 범위 확대',
    date: '2026.07.09',
    tone: 'warning',
    tag: '주의',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [deposit, setDeposit] = useState('')
  const [buildingType, setBuildingType] = useState('')

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setFileName(file ? file.name : null)
  }

  function handleAnalyze(e: FormEvent) {
    e.preventDefault()
    // TODO: POST to Express API (/api/analyze) which calls Supabase + AI scan
    navigate('/analysis')
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 lg:gap-8 lg:px-0 lg:pt-0">
      {/* 모바일 전용 헤더 — 데스크톱은 TopNav가 대신함 */}
      <header className="flex items-center justify-between lg:hidden">
        <h1 className="text-lg font-bold text-primary">ZIPUP 🏠</h1>
        <button
          type="button"
          aria-label="알림"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-gray shadow-card"
        >
          🔔
        </button>
      </header>

      {/* 데스크톱 전용 히어로 배너 */}
      <section className="hidden items-center justify-between gap-10 rounded-card border border-border bg-white p-10 shadow-card lg:flex">
        <div className="max-w-[420px]">
          <h2 className="text-2xl font-bold leading-snug text-text-dark">
            계약 전, <span className="text-primary">AI로 위험을</span> 먼저 확인하세요
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-gray">
            등기부등본이나 계약서를 업로드하면 AI가 위험 조항을 자동으로 찾아드려요.
          </p>
          <label htmlFor="scan-upload-desktop" className="mt-6 inline-flex cursor-pointer">
            <span className="inline-flex h-12 items-center rounded-btn bg-primary px-6 text-sm font-bold text-white shadow-btn">
              {fileName ?? '파일 선택하고 스캔하기'}
            </span>
            <input
              id="scan-upload-desktop"
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
        <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-card bg-primary-bg text-6xl">
          🔎
        </div>
      </section>

      {/* AI 스캔 배너 카드 (모바일 전용, 데스크톱은 위 히어로가 대신함) */}
      <Card className="border-primary/40 bg-white lg:hidden">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-lg">
            🔎
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-dark">AI 등기부등본 스캔</h2>
            <p className="mt-1 text-xs leading-relaxed text-text-gray">
              등기부등본이나 계약서를 업로드하면 AI가 위험 조항을 자동으로 찾아드려요.
            </p>
          </div>
        </div>

        <label
          htmlFor="scan-upload"
          className="mt-4 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-input border-[1.5px] border-dashed border-primary/50 bg-primary-bg/40 text-center"
        >
          <span className="text-xl">📄</span>
          <span className="text-xs font-medium text-primary-dark">
            {fileName ?? '파일을 선택하거나 드래그하세요'}
          </span>
          <input id="scan-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
        </label>
      </Card>

      {/* 매물 기본 정보 + 최근 뉴스: 모바일은 세로 스택, 데스크톱(lg)은 2단 그리드 */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {/* 매물 기본 정보 입력 카드 */}
        <Card>
          <h2 className="text-sm font-bold text-text-dark">매물 기본 정보</h2>
          <form onSubmit={handleAnalyze} className="mt-3 flex flex-col gap-3">
            <Input
              id="address"
              label="매물 주소"
              placeholder="예) 서울시 관악구 신림동"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
            <Input
              id="deposit"
              label="전세보증금 (만원)"
              placeholder="예) 25000"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              required
            />
            <Input
              id="buildingType"
              label="건물 유형"
              placeholder="예) 다세대주택, 오피스텔"
              value={buildingType}
              onChange={(e) => setBuildingType(e.target.value)}
            />
            <Button type="submit" className="mt-1">
              위험도 분석하기
            </Button>
          </form>
        </Card>

        {/* 최근 전세사기 뉴스 카드 */}
        <Card className="mb-4 lg:mb-0">
          <h2 className="text-sm font-bold text-text-dark">최근 전세사기 뉴스</h2>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {news.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-xs font-medium leading-snug text-text-dark">{item.title}</p>
                  <p className="mt-1 text-[10px] text-text-gray">{item.date}</p>
                </div>
                <Chip tone={item.tone} className="shrink-0">
                  {item.tag}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
