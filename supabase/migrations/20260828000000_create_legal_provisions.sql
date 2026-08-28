-- 위험 패턴(contract_risk_patterns)에 근거가 되는 실제 법 조문을 저장하는 테이블.
-- 원문(content)은 사용자가 국가법령정보센터(law.go.kr)에서 직접 확인해 제공한 것을 그대로
-- 옮겨 적었다 — 절대 표현을 바꾸지 않는다. plain_explanation만 일반인이 이해할 수 있는
-- 쉬운 말로 별도 작성했다. 일부 조문은 여러 항 중 이 서비스와 관련 있는 항만 발췌했다(전문이
-- 아님 — 예: 제3조는 ①항만, 제3조의2는 ②항만).
create table if not exists public.legal_provisions (
  id bigint generated always as identity primary key,
  law_name text not null,
  article text not null,
  title text not null,
  content text not null,
  plain_explanation text not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

alter table public.legal_provisions enable row level security;

-- contract_risk_patterns와 동일하게 법 조문 자체는 민감하지 않으므로 비로그인 포함 누구나 읽을 수 있다.
create policy "Anyone can read legal provisions"
  on public.legal_provisions
  for select
  to anon, authenticated
  using (true);

-- 쓰기는 service_role(관리자 도구)로만 수행하므로 별도 insert/update 정책 없음.
revoke insert, update, delete, truncate on public.legal_provisions from anon, authenticated;

insert into public.legal_provisions (law_name, article, title, content, plain_explanation, source_url)
values
  (
    '주택임대차보호법',
    '제3조',
    '대항력 등',
    '① 임대차는 그 등기(登記)가 없는 경우에도 임차인(賃借人)이 주택의 인도(引渡)와 주민등록을 마친 때에는 그 다음 날부터 제삼자에 대하여 효력이 생긴다. 이 경우 전입신고를 한 때에 주민등록이 된 것으로 본다.',
    '이사(입주)하고 전입신고를 마치면, 그다음 날부터 집이 다른 사람 손에 넘어가도 내 임차권을 주장할 수 있어요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95'
  ),
  (
    '주택임대차보호법',
    '제3조의2',
    '보증금의 회수',
    '② 제3조제1항ㆍ제2항 또는 제3항의 대항요건(對抗要件)과 임대차계약증서(...) 상의 확정일자(確定日字)를 갖춘 임차인은 「민사집행법」에 따른 경매 또는 「국세징수법」에 따른 공매(公賣)를 할 때에 임차주택(대지를 포함한다)의 환가대금(換價代金)에서 후순위권리자(後順位權利者)나 그 밖의 채권자보다 우선하여 보증금을 변제(辨濟)받을 권리가 있다.',
    '전입신고와 확정일자를 모두 갖추면, 집이 경매나 공매로 넘어갔을 때 후순위 채권자보다 먼저 보증금을 돌려받을 권리가 생겨요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95'
  ),
  (
    '주택임대차보호법',
    '제3조의3',
    '임차권등기명령',
    '① 임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차주택의 소재지를 관할하는 지방법원ㆍ지방법원지원 또는 시ㆍ군 법원에 임차권등기명령을 신청할 수 있다.',
    '이사를 나가야 하는데 보증금을 못 받았다면, 법원에 신청해서 임차권을 등기로 남겨두고도 대항력을 유지할 수 있어요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95'
  ),
  (
    '주택임대차보호법',
    '제8조',
    '보증금 중 일정액의 보호',
    '① 임차인은 보증금 중 일정액을 다른 담보물권자(擔保物權者)보다 우선하여 변제받을 권리가 있다. 이 경우 임차인은 주택에 대한 경매신청의 등기 전에 제3조제1항의 요건을 갖추어야 한다.',
    '집이 경매로 넘어가도 소액 임차인은 일정 금액만큼은 다른 담보권자보다 먼저 돌려받을 수 있어요(단, 경매신청 등기 전에 대항요건을 갖춰야 해요).',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95'
  ),
  (
    '주택임대차보호법',
    '제10조',
    '강행규정',
    '이 법에 위반된 약정(約定)으로서 임차인에게 불리한 것은 그 효력이 없다.',
    '계약서에 뭐라고 적혀 있든, 세입자에게 불리하게 이 법을 벗어난 약속은 법적으로 효력이 없어요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EC%A3%BC%ED%83%9D%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95'
  ),
  (
    '민법',
    '제623조',
    '임대인의 의무',
    '임대인은 목적물을 임차인에게 인도하고 계약존속중 그 사용, 수익에 필요한 상태를 유지하게 할 의무를 부담한다.',
    '집주인은 집을 넘겨주는 것뿐 아니라, 계약 기간 내내 살 수 있는 상태로 유지해줄 의무가 있어요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EB%AF%BC%EB%B2%95'
  ),
  (
    '민법',
    '제626조',
    '임차인의 상환청구권',
    '①임차인이 임차물의 보존에 관한 필요비를 지출한 때에는 임대인에 대하여 그 상환을 청구할 수 있다.
②임차인이 유익비를 지출한 경우에는 임대인은 임대차종료시에 그 가액의 증가가 현존한 때에 한하여 임차인의 지출한 금액이나 그 증가액을 상환하여야 한다.',
    '세입자가 집을 고치는 데 꼭 필요한 비용(누수·보일러 등)을 냈다면 집주인에게 돌려달라고 청구할 수 있고, 집 가치를 높인 비용도 계약이 끝날 때 그만큼 돌려받을 수 있어요.',
    'https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=%EB%AF%BC%EB%B2%95'
  )
on conflict do nothing;
