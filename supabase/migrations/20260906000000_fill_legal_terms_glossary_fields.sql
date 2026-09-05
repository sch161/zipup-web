-- /glossary 페이지 표시를 위해, 공식 정의가 확정된 9개 용어에 한해 plain_explanation(쉬운 설명)과
-- category(법률 용어/계약서 용어/시사 용어 필터용)를 채운다. official_definition이 null인 나머지
-- 12개는 이 마이그레이션에서 건드리지 않는다 — 나중에 정의가 채워지면 그때 같이 채운다.
--
-- category 분류 기준: 계약서 양식에 당사자 역할로 실제 등장하는 용어("임차인")만 "계약서 용어"로
-- 두고, 나머지는 계약과 밀접히 관련돼 있어도 법적 효과·절차를 가리키는 개념이라 "법률 용어"로
-- 분류했다. "시사 용어"(깡통전세 등)는 현재 official_definition이 있는 용어 중엔 없다.
update public.legal_terms set
  plain_explanation = '이사하고 전입신고를 마치면, 그다음 날부터 집이 다른 사람 손에 넘어가도 내 임차권을 주장할 수 있어요.',
  category = '법률 용어'
where term = '대항력';

update public.legal_terms set
  plain_explanation = '관할 세무서장이 임대차계약서가 그 날짜에 존재했다는 것을 공식적으로 확인해 주는 도장 같은 거예요. 이게 있어야 나중에 경매·공매 때 순위대로 보증금을 돌려받을 수 있어요.',
  category = '법률 용어'
where term = '확정일자';

update public.legal_terms set
  plain_explanation = '전입신고와 확정일자를 모두 갖추면, 집이 경매나 공매로 넘어갔을 때 후순위 채권자보다 먼저 보증금을 돌려받을 권리가 생겨요.',
  category = '법률 용어'
where term = '우선변제권';

update public.legal_terms set
  plain_explanation = '이사를 나가야 하는데 보증금을 못 받았다면, 법원에 신청해서 임차권을 등기로 남겨두고도 대항력을 유지할 수 있어요.',
  category = '법률 용어'
where term = '임차권등기명령';

update public.legal_terms set
  plain_explanation = '계약서에 뭐라고 적혀 있든, 세입자에게 불리하게 이 법을 벗어난 약속은 법적으로 효력이 없어요.',
  category = '법률 용어'
where term = '강행규정';

update public.legal_terms set
  plain_explanation = '세입자가 집을 원래대로 쓸 수 있도록 꼭 필요한 수리(보일러·누수 등)에 쓴 돈은 집주인에게 돌려달라고 청구할 수 있어요.',
  category = '법률 용어'
where term = '필요비';

update public.legal_terms set
  plain_explanation = '세입자가 집의 가치를 높이는 데 돈을 썼다면, 계약이 끝날 때 그만큼 오른 가치를 집주인에게 돌려받을 수 있어요.',
  category = '법률 용어'
where term = '유익비';

update public.legal_terms set
  plain_explanation = '여기서는 일정 금액 이하의 보증금으로 상가를 빌려 쓰는 사람(개인·법인·단체 포함)을 말해요 — 법이 특별히 보호하는 대상 범위를 정한 거예요.',
  category = '계약서 용어'
where term = '임차인';

update public.legal_terms set
  plain_explanation = '세입자는 계약 기간이 끝나기 전에 한 번은 계약을 2년 더 연장해 달라고 요구할 수 있는 권리가 있어요.',
  category = '법률 용어'
where term = '계약갱신요구권';
