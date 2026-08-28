-- contract_risk_patterns와 legal_provisions의 다대다 연결 테이블. 패턴 하나가 여러 조문에
-- 근거할 수 있고(예: 임차권등기명령 금지 조항 → 강행규정 + 임차권등기명령 조문 둘 다),
-- 조문 하나가 여러 패턴에 쓰일 수도 있다(예: 강행규정은 여러 독소조항 패턴에 공통 근거).
--
-- 매핑은 20개 패턴 중 명확히 확정된 5건만 넣는다(#2, #16은 애매해서 제외 확정됨):
--   #1  대항력 발생 시차 악용              -> 제3조(대항력 등)
--   #7  다가구주택 선순위 보증금 은폐       -> 제3조의2(보증금의 회수)
--   #12 임차권등기명령 신청 금지 독소조항   -> 제10조(강행규정) + 제3조의3(임차권등기명령)
--   #14 필수 수리비 전가 독소조항           -> 민법 제623조(임대인의 의무) + 제626조(상환청구권)
--   #17 다음 세입자 조건부 보증금 반환      -> 제10조(강행규정)
create table if not exists public.pattern_legal_provisions (
  pattern_id bigint not null references public.contract_risk_patterns (id) on delete cascade,
  legal_provision_id bigint not null references public.legal_provisions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pattern_id, legal_provision_id)
);

alter table public.pattern_legal_provisions enable row level security;

create policy "Anyone can read pattern-legal provision links"
  on public.pattern_legal_provisions
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.pattern_legal_provisions from anon, authenticated;

-- pattern_id는 contract_risk_patterns의 실제 라이브 데이터를 직접 조회해 확인한 id(1~20)를
-- 그대로 쓰고, legal_provision_id는 삽입 순서에 의존하지 않도록 (law_name, article)로 찾는다.
insert into public.pattern_legal_provisions (pattern_id, legal_provision_id)
select 1, id from public.legal_provisions where law_name = '주택임대차보호법' and article = '제3조'
union all
select 7, id from public.legal_provisions where law_name = '주택임대차보호법' and article = '제3조의2'
union all
select 12, id from public.legal_provisions where law_name = '주택임대차보호법' and article = '제10조'
union all
select 12, id from public.legal_provisions where law_name = '주택임대차보호법' and article = '제3조의3'
union all
select 14, id from public.legal_provisions where law_name = '민법' and article = '제623조'
union all
select 14, id from public.legal_provisions where law_name = '민법' and article = '제626조'
union all
select 17, id from public.legal_provisions where law_name = '주택임대차보호법' and article = '제10조'
on conflict do nothing;
