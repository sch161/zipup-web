-- HUG 상습채무불이행자 공개 명단 로컬 캐시.
-- 라이브 크롤링 대신 주기적으로 전체를 동기화해 여기서 조회한다 (scripts/sync-hug-defaulters.mjs 참고).
create extension if not exists pg_trgm;

create table if not exists public.hug_defaulters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age integer,
  address text not null,
  deposit_return_debt bigint,
  debt_occurred_at date, -- 최초 채무발생일
  debt_period_days integer, -- 채무불이행기간
  guarantee_payment_at date, -- 보증채무이행일 (HUG가 보증금을 대신 지급한 날짜). 기존 latest_default_at에서 이름 정정.
  reimbursement_debt bigint, -- 구상채무 (HUG가 임대인에게 청구할 금액). 기존 latest_default_amount에서 이름 정정.
  execution_count integer, -- 강제집행 횟수. 기존 compensation_or_disposal_requests에서 이름 정정.
  base_date date, -- 명단 기준일. 기존에는 컬럼 자체가 없어 크롤러가 insert 시 실패했을 항목.
  -- 소스에 고유 id가 없어 행 내용 해시로 중복 방지 + upsert 키로 사용.
  raw_row_hash text not null unique,
  synced_at timestamptz not null default now()
);

-- 이름/주소 부분일치 검색용 (한글 trigram)
create index if not exists hug_defaulters_name_trgm_idx
  on public.hug_defaulters using gin (name gin_trgm_ops);

create index if not exists hug_defaulters_address_trgm_idx
  on public.hug_defaulters using gin (address gin_trgm_ops);

alter table public.hug_defaulters enable row level security;

-- 공개 명단이므로 조회는 누구나 가능해야 한다 (계약 전 확인이 핵심 기능).
create policy "Anyone can search hug defaulters"
  on public.hug_defaulters
  for select
  to anon, authenticated
  using (true);

-- 동기화 진행 상태 (region_sync_cursor와 동일한 패턴).
-- Edge Function으로 배치 동기화할 경우에만 필요. Node 스크립트로만 돌린다면 생략 가능.
create table if not exists public.hug_sync_cursor (
  id smallint primary key default 1,
  last_page integer not null default 0,
  total_pages integer,
  updated_at timestamptz not null default now(),
  constraint hug_sync_cursor_singleton check (id = 1)
);

insert into public.hug_sync_cursor (id, last_page, total_pages)
values (1, 0, null)
on conflict (id) do nothing;