import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrokenText from '../components/ui/BrokenText'
import Card from '../components/ui/Card'
import Chip from '../components/ui/Chip'
import RiskGauge from '../components/ui/RiskGauge'
import TopNav from '../components/TopNav'
import type { AnalysisResult, RiskLevel } from '../lib/analyzeContract'

const LAST_ANALYSIS_KEY = 'zipup:lastAnalysis'

function readLastAnalysis(): AnalysisResult | undefined {
  try {
    const raw = sessionStorage.getItem(LAST_ANALYSIS_KEY)
    return raw ? (JSON.parse(raw) as AnalysisResult) : undefined
  } catch {
    return undefined
  }
}

const levelLabel: Record<RiskLevel, string> = {
  danger: '위험',
  warning: '주의',
  success: '안전',
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

const levelBadgeBg: Record<RiskLevel, string> = {
  danger: 'bg-danger-bg',
  warning: 'bg-warning-bg',
  success: 'bg-success-bg',
}

const levelRowStyle: Record<RiskLevel, string> = {
  danger: 'border border-danger/25 bg-danger-bg',
  warning: 'border border-warning/25 bg-warning-bg',
  success: 'border border-success/25 bg-success-bg',
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
  const navState = (location.state as { result?: AnalysisResult } | null)?.result
  const result = navState ?? readLastAnalysis()

  useEffect(() => {
    if (!navState) return
    try {
      sessionStorage.setItem(LAST_ANALYSIS_KEY, JSON.stringify(navState))
    } catch {
      // storage full or unavailable — the page still works, it just won't survive navigation
    }
  }, [navState])

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <TopNav variant="app" />
        <div className="app-shell justify-center px-6 text-center">
          <div className="text-4xl">📊</div>
          <h1 className="mt-4 text-lg font-bold text-primary">위험도 분석 결과</h1>
          <p className="mt-2 text-sm text-text-gray">
            <BrokenText text="분석 결과가 없어요. 홈에서 매물 정보를 입력하고 다시 시도해주세요." />
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
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-5 lg:max-w-[1040px] lg:px-6 lg:py-4">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-xl lg:text-text-dark">위험도 분석 결과</h1>
        </div>

        {result.hugDefaulterMatch?.matched && (
          <div className="mt-3 rounded-card border-2 border-danger bg-danger-bg p-3 lg:mt-3">
            <p className="text-balance text-sm font-bold text-danger">
              ⚠️ HUG 상습 채무불이행자 명단에서 발견된 이름과 유사합니다
            </p>
            <p className="mt-1 text-xs leading-snug text-text-dark">
              <BrokenText
                text={`계약서에서 확인된 임대인 "${result.landlordName}"과(와) 이름이 유사한 인물이 HUG(주택도시보증공사) 상습채무불이행자 명단에 있어요. 동명이인일 수 있으니, 계약 전 반드시 신분증과 등기부등본상 소유자 정보를 직접 대조해 확인하세요.`}
              />
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {result.hugDefaulterMatch.matches.map((m, i) => (
                <li key={i} className="text-[11px] text-text-gray">
                  · {m.name} ({Math.round(m.similarity * 100)}% 유사) — {m.address}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.hugLandlordCheck?.isBlacklisted && (
          <div className="mt-3 flex items-start gap-2 rounded-card border border-warning bg-warning-bg p-2.5 lg:mt-3">
            <Chip tone="warning" className="shrink-0">
              AI 위험 패턴 감지
            </Chip>
            <p className="text-pretty text-[11px] leading-relaxed text-text-dark">
              {result.hugLandlordCheck.reason}
              <br />
              <span className="text-text-gray">
                * 실제 명단 대조가 아니라 AI가 알려진 사기 피해 패턴과 계약서 내용을 비교해 추정한 결과예요.
                {result.hugDefaulterMatch?.matched
                  ? ''
                  : ' 위 HUG 공식 명단 일치와는 별개의 참고 정보이니 함께 확인하세요.'}
              </span>
            </p>
          </div>
        )}

        <div className="mt-3 grid gap-2.5 lg:mt-3 lg:grid-cols-2 lg:items-start lg:gap-3">
          {/* 왼쪽: 종합 위험도 + 항목별 위험도 */}
          <div className="flex flex-col gap-2.5">
            <Card className="flex flex-col items-center gap-1.5 py-4 text-center lg:py-4">
              <h2 className="text-[13px] font-bold text-text-lightgray">종합 위험도</h2>
              <RiskGauge score={result.overallScore} level={result.riskLevel} size={92} strokeWidth={8} />
              <div
                className={`inline-flex items-center gap-2 rounded-chip px-4 py-1 text-[13px] font-extrabold ${levelBadgeBg[result.riskLevel]} ${levelTextColor[result.riskLevel]}`}
              >
                <span className={`h-2 w-2 rounded-full ${levelBarColor[result.riskLevel]}`} />
                {levelLabel[result.riskLevel]} 등급
              </div>
              <p className="max-w-[380px] text-pretty text-[12.5px] leading-snug text-text-gray">{result.aiComment}</p>
            </Card>

            <Card className="lg:py-3">
              <h2 className="text-sm font-bold text-text-dark">항목별 위험도 분석</h2>
              <div className="mt-2 flex flex-col gap-2">
                {result.categories.map((category) => (
                  <div key={category.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-text-dark">{category.name}</span>
                      <span className={`font-bold ${levelTextColor[category.level]}`}>{category.score}점</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border-input/40">
                      <div
                        className={`h-full rounded-full ${levelBarColor[category.level]}`}
                        style={{ width: `${category.score}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-pretty text-[11px] leading-snug text-text-lightgray">{category.comment}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 오른쪽: 발견된 조항 + AI 추천 조치 */}
          <div className="flex flex-col gap-2.5">
            {result.detectedClauses.length > 0 ? (
              <Card className="lg:py-3">
                <h2 className="text-sm font-bold text-text-dark">발견된 유의 조항</h2>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {result.detectedClauses.map((clause, i) => (
                    <li key={i} className={`rounded-2xl p-2 ${levelRowStyle[clause.level]}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-balance text-xs font-bold text-text-dark">{clause.summary}</p>
                        <Chip tone={clause.level} className="shrink-0">
                          {levelLabel[clause.level]}
                        </Chip>
                      </div>
                      <p className="mt-0.5 text-pretty text-[11px] leading-snug text-text-gray">{clause.explanation}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card className="border-dashed text-center lg:py-3">
                <p className="text-pretty text-xs leading-relaxed text-text-gray">
                  첨부한 문서가 없어 조항별 분석은 생략됐어요.
                  <br />
                  등기부등본이나 계약서를 첨부하면 위험 조항을 구체적으로 짚어드려요.
                </p>
                <Link to="/home" className="mt-2 inline-block text-xs font-bold text-primary">
                  문서 첨부하러 가기
                </Link>
              </Card>
            )}

            {result.recommendedActions.length > 0 && (
              <div className="rounded-card bg-primary p-4 text-white lg:p-3.5">
                <h2 className="text-[15px] font-extrabold">AI 추천 조치</h2>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {result.recommendedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-snug">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-pretty opacity-95">{action}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/psych-guard"
                  className="mt-2.5 flex w-full items-center justify-center rounded-btn bg-white py-2 text-[13px] font-extrabold text-primary-dark"
                >
                  불안한 점, 상담으로 이어가기 →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
