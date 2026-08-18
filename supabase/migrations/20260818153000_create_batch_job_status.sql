-- 배치 작업(4개: fetch-market-data, fetch-region-buzz, sync-news, sync-hug-defaulters)이
-- 마지막으로 "언제 시도했는지"와 "언제 마지막으로 성공했는지"를 남겨 두는 테이블.
--
-- 계기: sync-news가 2026-07-20~08-18 사이 29일간 매 실행마다 401로 조용히 실패했는데,
-- cron.job_run_details는 net.http_post(비동기 큐잉) 자체는 계속 성공으로 기록해서 아무도
-- 눈치채지 못했다. 이 테이블은 각 Edge Function/스크립트가 스스로 "나 지금 성공/실패했다"를
-- service_role로 직접 기록하게 해서, 프론트(마이페이지)에서 "마지막 갱신: N시간 전"을 보여주고
-- 예상 주기보다 오래 멈춰 있으면 바로 드러나게 한다.
create table if not exists public.batch_job_status (
  job_name text primary key,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

alter table public.batch_job_status enable row level security;

-- 민감 정보는 아니지만(에러 메시지도 사용자 대면 메시지 수준으로만 저장) 운영 상태라 로그인
-- 사용자에게만 공개한다 — news/region_stats처럼 비로그인 anon에게까지 열 필요는 없다.
create policy "Authenticated users can read batch job status"
  on public.batch_job_status
  for select
  to authenticated
  using (true);

-- 쓰기 정책은 없음 — 각 Edge Function/스크립트의 service_role 클라이언트만 갱신한다(RLS 우회).

insert into public.batch_job_status (job_name)
values ('fetch-market-data'), ('fetch-region-buzz'), ('sync-news'), ('sync-hug-defaulters')
on conflict (job_name) do nothing;
