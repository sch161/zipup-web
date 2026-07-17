import { Link, useLocation, useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import RiskGauge from '../components/ui/RiskGauge'
import TopNav from '../components/TopNav'
import type { AnalysisResult, RiskLevel } from '../lib/analyzeContract'

const levelLabel: Record<RiskLevel, string> = {
  danger: '위험',
  warning: '주의',
  success: '안전',
}

const levelHeadline: Record<RiskLevel, string> = {
  danger: '이 매물은 위험 요소가 있어요',
  warning: '이 매물은 주의가 필요해요',
  success: '이 매물은 비교적 안전해요',
}

const levelBarColor: Record<RiskLevel, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
}

const levelTextColor: Record<RiskLevel, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
}

const categoryIcon: Record<string, string> = {
  권리관계: '📜',
  특약사항: '📝',
  전세가율: '📊',
  건물상태: '🏚️',
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로가기"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-gray shadow-card"
    >
      ←
    </button>
  )
}

export default function Analysis() {
  const navigate = useNavigate()
  const location = useLocation()
  const result = (location.state as { result?: AnalysisResult } | null)?.result

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <TopNav variant="app" />
        <div className="app-shell px-6 pt-6 text-center">
          <div className="self-start">
            <BackButton onClick={() => navigate(-1)} />
          </div>
          <div className="mt-16 text-4xl">📊</div>
          <h1 className="mt-4 text-lg font-bold text-primary">위험도 분석 결과</h1>
          <p className="mt-2 text-sm text-text-gray">
            분석 결과가 없어요. 홈에서 매물 정보를 입력하고 다시 시도해주세요.
          </p>
          <Link to="/home" className="mt-6 text-sm font-bold text-primary">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-6 lg:max-w-[1120px] lg:px-6 lg:py-10">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-2xl">위험도 분석 결과</h1>
        </div>

        {/* 모바일: 세로 스택(DOM 순서 그대로). 데스크톱(lg): 좌(넓게)/우(사이드바) 2단 그리드로 명시적 배치 */}
        <div className="mt-4 flex flex-col gap-4 lg:mt-6 lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
          {/* 종합 위험도 점수 */}
          <Card className="flex flex-col items-center gap-3 py-8 text-center lg:col-start-1 lg:row-start-1 lg:flex-row lg:justify-start lg:gap-8 lg:py-10 lg:text-left">
            <RiskGauge score={result.overallScore} level={result.riskLevel} />
            <div className="lg:flex-1">
              <Chip tone={result.riskLevel}>{levelLabel[result.riskLevel]}</Chip>
              <p className="mt-2 text-sm font-bold text-text-dark lg:mt-3 lg:text-lg">
                {levelHeadline[result.riskLevel]}
              </p>
            </div>
          </Card>

          {/* AI 핵심 요약 — 자세히 보기 전에 결론부터 (데스크톱: 오른쪽 사이드바) */}
          <Card className="border-primary/30 bg-primary-bg/30 lg:col-start-2 lg:row-start-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm">🤖</span>
              <h2 className="text-sm font-bold text-text-dark">AI 핵심 요약</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-dark">{result.aiComment}</p>
          </Card>

          {/* 항목별 위험도 분석 */}
          <Card className="lg:col-start-1 lg:row-start-2">
            <h2 className="text-sm font-bold text-text-dark">항목별 위험도 분석</h2>
            <div className="mt-3 flex flex-col gap-4">
              {result.categories.map((category) => (
                <div key={category.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-text-dark">
                      <span>{categoryIcon[category.name] ?? '🔍'}</span>
                      {category.name}
                    </span>
                    <span className={`font-bold ${levelTextColor[category.level]}`}>{category.score}점</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full rounded-full ${levelBarColor[category.level]}`}
                      style={{ width: `${category.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-gray">{category.comment}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* 탐지된 조항 상세 (데스크톱: 왼쪽 넓은 컬럼 맨 아래) */}
          {result.detectedClauses.length > 0 ? (
            <Card className="lg:col-start-1 lg:row-start-3">
              <h2 className="text-sm font-bold text-text-dark">탐지된 조항 상세</h2>
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {result.detectedClauses.map((clause, i) => (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-text-dark">{clause.summary}</p>
                      <Chip tone={clause.level} className="shrink-0">
                        {levelLabel[clause.level]}
                      </Chip>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-gray">{clause.explanation}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="border-dashed text-center lg:col-start-1 lg:row-start-3">
              <p className="text-xs leading-relaxed text-text-gray">
                첨부한 문서가 없어 조항별 분석은 생략됐어요.
                <br />
                등기부등본이나 계약서를 첨부하면 위험 조항을 구체적으로 짚어드려요.
              </p>
              <Link to="/home" className="mt-2 inline-block text-xs font-bold text-primary">
                문서 첨부하러 가기
              </Link>
            </Card>
          )}

          {/* AI 추천 조치 (데스크톱: 오른쪽 사이드바) */}
          {result.recommendedActions.length > 0 && (
            <Card className="mb-4 lg:col-start-2 lg:row-start-2 lg:mb-0">
              <h2 className="text-sm font-bold text-text-dark">AI 추천 조치</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {result.recommendedActions.map((action, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-input bg-bg px-3 py-2.5 text-xs text-text-dark"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                      ✓
                    </span>
                    <span className="leading-relaxed">{action}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
