-- contract_risk_patterns(20건)이 공통으로 참고한 출처 자료 3건을 기록하는 테이블.
--
-- 개별 패턴 하나하나가 특정 판례·사례 하나에서 나온 게 아니라, 아래 3개 자료(경기도
-- 전세피해지원센터 사례집, 국토교통부/HUG 가이드북, 한국공인중개사협회 체크리스트)를
-- 종합해 정리한 것이라 패턴별 FK로 연결하지 않고 데이터셋 전체 수준의 출처로 둔다.
create table if not exists public.pattern_sources (
  id bigint generated always as identity primary key,
  organization text not null,
  title text not null,
  description text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.pattern_sources enable row level security;

-- contract_risk_patterns와 동일하게 출처 정보 자체는 민감하지 않으므로 비로그인 포함 누구나 읽을 수 있다.
create policy "Anyone can read pattern sources"
  on public.pattern_sources
  for select
  to anon, authenticated
  using (true);

-- 쓰기는 service_role(관리자 도구)로만 수행하므로 별도 insert/update 정책 없음.
revoke insert, update, delete, truncate on public.pattern_sources from anon, authenticated;

insert into public.pattern_sources (organization, title, description, url)
values
  (
    '경기도 전세피해지원센터',
    '경기도 전세피해 사례집',
    '경기도 전세피해지원센터가 실제로 접수·수집한 29가지 피해 사례 중 계약서 관련 내용을 선별해 정리한 자료입니다.',
    'https://map.gg.go.kr/pdf/CaseOfLeaseDamage.pdf'
  ),
  (
    '국토교통부 · HUG(주택도시보증공사)',
    '전세사기 예방 및 피해지원 가이드북',
    '계약서 작성 시점에 자주 누락되는 특약 유형을 분석한 국토교통부·HUG의 공식 가이드라인입니다.',
    'https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?lcmspage=1&id=95087855'
  ),
  (
    '한국공인중개사협회',
    '전세사기 주요 유형별 범죄 수사 사례 및 계약 체크리스트',
    '전세사기 주요 유형을 범죄 수사 사례와 함께 정리하고, 계약 시 확인해야 할 체크리스트를 제공하는 자료입니다.',
    'https://www.kar.or.kr/consult_new/menu3.html'
  )
on conflict do nothing;
