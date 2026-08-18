// 각 배치 Edge Function이 실행을 마칠 때(성공/실패 모두) `batch_job_status`에 자신의
// 상태를 기록하기 위한 공통 헬퍼. 프론트(마이페이지)가 이 테이블을 읽어 "마지막 갱신: N시간 전"을
// 보여준다 — see docs/PROJECT_OVERVIEW.md의 sync-news 401 무응답 사고 기록.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type JobOutcome = { success: true; result?: unknown } | { success: false; error: string }

/** 실패해도(예: batch_job_status 자체에 문제가 생겨도) 배치 작업 본연의 결과 응답은 막지 않도록
 *  호출부에서 이 함수의 실패를 별도로 처리하지 않는다 — 에러는 로그만 남긴다. */
export async function recordJobRun(supabase: SupabaseClient, jobName: string, outcome: JobOutcome): Promise<void> {
  const now = new Date().toISOString()
  const patch = outcome.success
    ? {
        job_name: jobName,
        last_run_at: now,
        last_success_at: now,
        last_error: null,
        last_result: outcome.result ?? null,
        updated_at: now,
      }
    : {
        job_name: jobName,
        last_run_at: now,
        // 사용자 대면 에러 메시지 수준으로만 저장 — 스택 트레이스나 시크릿이 섞여 들어가지
        // 않도록 호출부에서 이미 정리된 메시지를 넘긴다는 전제. 길이도 방어적으로 제한.
        last_error: outcome.error.slice(0, 500),
        updated_at: now,
      }

  const { error } = await supabase.from('batch_job_status').upsert(patch, { onConflict: 'job_name' })
  if (error) {
    console.error(`recordJobRun(${jobName}): failed to update batch_job_status`, error)
  }
}
