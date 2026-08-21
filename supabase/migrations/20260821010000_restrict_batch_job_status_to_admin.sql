-- batch_job_status는 개발/운영용 상태판이라 일반 사용자에게 노출하면 안 된다(이전엔 로그인한
-- 누구나 읽을 수 있었음). 관리자 이메일을 정책 SQL에 직접 넣는 방식을 쓴다 — 이 프로젝트
-- 규모(팀 4명)에서는 profiles 테이블+role 컬럼을 새로 만드는 것보다 훨씬 단순하고, 그러면서도
-- RLS(DB 레벨)에서 실제로 강제된다는 요구사항을 만족한다. 관리자가 늘어나거나 자체적으로
-- 관리해야 할 필요가 생기면, 그때 profiles.is_admin 컬럼 + RLS로 옮기는 게 다음 단계다.
drop policy if exists "Authenticated users can read batch job status" on public.batch_job_status;

create policy "Only admins can read batch job status"
  on public.batch_job_status
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'email') in (
      's2534@e-mirim.hs.kr'
    )
  );
