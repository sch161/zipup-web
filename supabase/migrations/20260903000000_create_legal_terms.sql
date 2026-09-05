-- 법제처 국가법령정보 공동활용 API(lawSearch.do/lawService.do, target=lstrm)로 조회한
-- 법령 용어 공식 정의를 저장하는 테이블. official_definition은 "법령정의사전"
-- (사전구분코드=011402, 특정 법령/훈령이 명시적으로 정의해 둔 용어만 존재) 결과만 담는다 —
-- "법령한영사전"(011402가 아닌 011403, 영어 번역만 제공)은 쓰지 않는다.
-- 시사 용어(깡통전세, 갭투자 등)나 법령이 명시적으로 정의하지 않은 법률 개념(대항력 등)은
-- 검색 결과 자체가 없거나 법령정의사전 항목이 없을 수 있어 official_definition이 null일 수 있다
-- — 이 경우는 사람이 나중에 직접 채운다(plain_explanation도 마찬가지로 이 마이그레이션에서는
-- 채우지 않는다).
create table if not exists public.legal_terms (
  id bigint generated always as identity primary key,
  -- fetch-legal-terms.mjs가 upsert(onConflict: 'term')로 재실행해도 중복 없이 갱신되도록 유니크.
  term text not null unique,
  official_definition text,
  plain_explanation text,
  category text,
  -- lawService.do 응답의 "출처" 필드(그 용어를 정의한 법령/훈령 이름과 개정 이력)를 그대로 담는다.
  -- official_definition이 null이면 source도 null이다.
  source text,
  related_provision_id bigint references public.legal_provisions (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.legal_terms enable row level security;

create policy "Anyone can read legal terms"
  on public.legal_terms
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.legal_terms from anon, authenticated;
