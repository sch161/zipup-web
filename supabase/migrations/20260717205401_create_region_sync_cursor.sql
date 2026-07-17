-- 지역이 25(서울)→252(전국)로 늘어나면서 fetch-market-data/fetch-region-buzz가 ALL_REGIONS를
-- 한 번의 호출로 다 순회하면 Edge Function 실행 시간 제한(150초)을 넘길 위험이 크다. 대신 각
-- 함수가 호출될 때마다 이 테이블에서 "어디까지 처리했는지"를 읽어 다음 50개(BATCH_SIZE)만
-- 처리하고 커서를 전진시킨다 — 하루 여러 번의 짧은 호출로 나눠 전체를 순회하는 방식.
--
-- sync_name별로 독립된 커서를 두는 이유: fetch-market-data와 fetch-region-buzz는 같은
-- ALL_REGIONS를 서로 다른 스케줄(10분 간격)로 순회하므로 진행 위치가 서로 달라야 한다.
-- cycle_date가 오늘(UTC)과 다르면 다음 호출에서 next_index를 0으로 리셋해 새로 순회를 시작한다.
create table if not exists public.region_sync_cursor (
  sync_name text primary key,
  next_index int not null default 0,
  cycle_date date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.region_sync_cursor enable row level security;
-- 이 테이블은 Edge Function의 service_role 클라이언트만 읽고 쓴다(같은 이유로 policy가 없는
-- region_stats 쓰기와 동일한 패턴). anon/authenticated에는 어떤 접근도 허용하지 않는다.

insert into public.region_sync_cursor (sync_name) values
  ('fetch-market-data'),
  ('fetch-region-buzz')
on conflict (sync_name) do nothing;
