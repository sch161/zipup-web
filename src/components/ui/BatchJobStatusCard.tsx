import { useEffect, useState } from 'react'
import { fetchBatchJobStatus, type BatchJobStatus } from '../../lib/jobStatus'
import Card from './Card'
import Chip from './Chip'

type JobHealth = 'ok' | 'warning' | 'danger' | 'unknown'

interface JobMeta {
  jobName: string
  label: string
  /** 이 시간(분)을 넘도록 성공 기록이 없으면 '지연', dangerAfterMinutes를 넘으면 '중단 의심'. */
  warnAfterMinutes: number
  dangerAfterMinutes: number
}

// 각 배치의 예상 주기보다 넉넉히 잡은 임계값. fetch-market-data/fetch-region-buzz는
// 매일 KST 03:00~05:40에만 도는 배치라(하루 중 나머지 시간엔 항상 "몇 시간 전"으로 보임)
// 하루 한 번 성공 여부만 확인하면 되도록 30시간/72시간으로 넉넉히 잡았다.
const JOB_META: JobMeta[] = [
  { jobName: 'sync-news', label: '최신 전세사기 뉴스', warnAfterMinutes: 12 * 60, dangerAfterMinutes: 24 * 60 },
  {
    jobName: 'fetch-market-data',
    label: '지역 시세(전세가율) 데이터',
    warnAfterMinutes: 30 * 60,
    dangerAfterMinutes: 72 * 60,
  },
  {
    jobName: 'fetch-region-buzz',
    label: '지역 뉴스 언급 데이터',
    warnAfterMinutes: 30 * 60,
    dangerAfterMinutes: 72 * 60,
  },
  {
    jobName: 'sync-hug-defaulters',
    label: 'HUG 명단 동기화',
    warnAfterMinutes: 9 * 24 * 60,
    dangerAfterMinutes: 14 * 24 * 60,
  },
]

const HEALTH_META: Record<JobHealth, { tone: 'success' | 'warning' | 'danger' | 'primary'; icon: string; text: string }> = {
  ok: { tone: 'success', icon: '✅', text: '정상' },
  warning: { tone: 'warning', icon: '⚠️', text: '지연' },
  danger: { tone: 'danger', icon: '🔴', text: '중단 의심' },
  unknown: { tone: 'primary', icon: '❔', text: '기록 없음' },
}

function computeHealth(lastSuccessAt: string | null, meta: JobMeta): JobHealth {
  if (!lastSuccessAt) return 'unknown'
  const minutesSince = (Date.now() - new Date(lastSuccessAt).getTime()) / 60000
  if (minutesSince >= meta.dangerAfterMinutes) return 'danger'
  if (minutesSince >= meta.warnAfterMinutes) return 'warning'
  return 'ok'
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '기록 없음'
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}일 전`
}

export default function BatchJobStatusCard() {
  const [statusByJob, setStatusByJob] = useState<Record<string, BatchJobStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBatchJobStatus()
      .then((rows) => {
        const byJob: Record<string, BatchJobStatus> = {}
        for (const row of rows) byJob[row.job_name] = row
        setStatusByJob(byJob)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : '배치 작업 상태를 불러오지 못했습니다.'),
      )
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <h2 className="text-sm font-bold text-text-dark">배치 작업 상태</h2>
      <p className="mt-1 text-[11px] text-text-gray">
        안심 시그널 맵·최신 뉴스가 실제로 갱신되고 있는지 확인하는 개발/운영용 상태판이에요.
      </p>

      {loading && <p className="py-4 text-center text-xs text-text-gray">불러오는 중...</p>}
      {!loading && error && <p className="py-4 text-center text-xs font-medium text-danger">{error}</p>}

      {!loading && !error && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {JOB_META.map((meta) => {
            const row = statusByJob[meta.jobName]
            const health = computeHealth(row?.last_success_at ?? null, meta)
            const healthMeta = HEALTH_META[health]

            return (
              <li key={meta.jobName} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-dark">{meta.label}</p>
                  <p className="mt-0.5 text-[11px] text-text-gray">
                    마지막 갱신: {formatRelativeTime(row?.last_success_at ?? null)}
                    {health !== 'unknown' && row?.last_error && health !== 'ok' && (
                      <span className="text-danger"> · 최근 시도 실패</span>
                    )}
                  </p>
                </div>
                <Chip tone={healthMeta.tone}>
                  {healthMeta.icon} {healthMeta.text}
                </Chip>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
