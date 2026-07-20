-- RAG 검색 대상: 실제 전세사기 위험 패턴 / 판례 / 국토부 가이드라인.
-- analyze-contract 함수가 Gemini 호출 전에 이 테이블에서 관련 패턴을 검색해 프롬프트에 포함한다.
--
-- NOTE: public.contract_risk_patterns 테이블은 이 마이그레이션이 작성되기 전에 이미
-- 원격 DB에 수동으로 생성되어 있었고(국토부 가이드라인 기반 시드 데이터 6건 포함),
-- id가 bigint identity, category/risk_level이 제약 없는 varchar였다.
-- 기존 데이터를 보존하기 위해 CREATE TABLE 대신 ALTER TABLE로 부족한 컬럼/인덱스/정책만 보강한다.
create table if not exists public.contract_risk_patterns (
  id bigint generated always as identity primary key,
  category varchar(50) not null,
  pattern_description text not null,
  risk_level varchar(20) not null,
  example_clause text,
  created_at timestamptz not null default now()
);

alter table public.contract_risk_patterns
  add column if not exists source text;

alter table public.contract_risk_patterns
  add column if not exists keywords text[] not null default '{}';

-- 계약서에서 추출된 키워드/조항 텍스트로 검색할 때 쓰는 전문 검색 인덱스.
alter table public.contract_risk_patterns
  add column if not exists search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(pattern_description, '') || ' ' || coalesce(example_clause, ''))
  ) stored;

create index if not exists contract_risk_patterns_category_idx
  on public.contract_risk_patterns (category);

create index if not exists contract_risk_patterns_keywords_idx
  on public.contract_risk_patterns using gin (keywords);

create index if not exists contract_risk_patterns_search_idx
  on public.contract_risk_patterns using gin (search_vector);

alter table public.contract_risk_patterns enable row level security;

-- 위험 패턴 자체는 민감정보가 아니라 누구나 읽을 수 있어야 RAG 검색(anon 포함)이 가능하다.
-- 기존에 정책이 없었으므로(= RLS는 켜져 있지만 아무도 못 읽는 상태) 새로 추가한다.
drop policy if exists "Anyone can read risk patterns" on public.contract_risk_patterns;
create policy "Anyone can read risk patterns"
  on public.contract_risk_patterns
  for select
  to anon, authenticated
  using (true);

-- 쓰기는 service_role(관리자 도구/시드 스크립트)로만 수행하므로 별도 insert/update 정책 없음.
