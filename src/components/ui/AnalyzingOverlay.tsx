import { useEffect, useState } from 'react'

const STAGE_MESSAGES = [
  '📄 매물 정보를 확인하고 있어요...',
  '🔍 전세사기 위험 패턴과 대조하고 있어요...',
  '🏠 HUG 상습 채무불이행자 명단을 조회하고 있어요...',
  '🧮 위험도 점수를 계산하고 있어요...',
  '📝 결과를 정리하고 있어요...',
]

const STAGE_INTERVAL_MS = 4000

/** 계약서 분석은 문서 크기/AI 응답 속도에 따라 수십 초가 걸릴 수 있어, 화면이 멈춘 것처럼
 * 보이지 않도록 진행 단계를 순환 표시하는 전체 화면 오버레이. 실제 진행률을 아는 건 아니라서
 * 퍼센트 진행바 대신 "지금 뭘 하고 있는지"를 보여주는 방식을 쓴다. */
export default function AnalyzingOverlay() {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGE_MESSAGES.length - 1))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-card bg-card p-8 text-center shadow-card">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-bg border-t-primary" />
        <div>
          <p className="text-sm font-bold text-text-dark">AI가 분석하고 있어요</p>
          <p className="mt-2 text-xs leading-relaxed text-text-gray">{STAGE_MESSAGES[stageIndex]}</p>
        </div>
        <p className="text-[10px] text-text-lightgray">최대 1분 정도 걸릴 수 있어요. 화면을 벗어나지 말고 잠시만 기다려주세요.</p>
      </div>
    </div>
  )
}
