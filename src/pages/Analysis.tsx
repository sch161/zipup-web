import { useNavigate } from 'react-router-dom'

export default function Analysis() {
  const navigate = useNavigate()

  return (
    <div className="app-shell px-6 pt-6 text-center">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-6 self-start text-sm font-medium text-text-gray"
      >
        ← 뒤로가기
      </button>
      <div className="mt-16 text-4xl">📊</div>
      <h1 className="mt-4 text-lg font-bold text-primary">위험도 분석 결과</h1>
      <p className="mt-2 text-sm text-text-gray">
        분석 결과 화면은 준비 중이에요. 곧 종합 위험도 점수와 항목별 분석을 확인할 수 있어요.
      </p>
    </div>
  )
}
