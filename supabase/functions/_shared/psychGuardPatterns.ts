// 심리 가드(가스라이팅 탐지) 규칙 기반 패턴 DB.
//
// 기존에는 Gemini에게 "이 대화에 가스라이팅이 있나?"를 그대로 물어 그 판단을 썼는데, AI의
// 주관적 판단이라 신뢰도가 낮았다. 카테고리 분류는 Robert Cialdini(1984)의 설득의 6원칙
// (Influence: The Psychology of Persuasion) 기반이며, 한국어 키워드는 부동산 중개 맥락에
// 맞게 직접 설계했다.

export interface PsychGuardCategory {
  category: string
  weight: number
  keywords: string[]
  /** 이 카테고리 키워드를 고른 근거. */
  sourceNote: string
}

const CIALDINI_SOURCE_NOTE =
  '카테고리 분류는 Robert Cialdini(1984)의 설득의 6원칙 기반, 한국어 키워드는 부동산 중개 맥락에 맞게 직접 설계'

// 실제 언론에 보도된 중개인 발화 문구를 근거로 삼은 카테고리(scarcity, authority)에는
// 이 출처를 함께 남긴다.
const NEWS_SOURCE_NOTE = '언론 보도(뷰어스 2026.09.17, KB부동산 2026.07)에서 확인된 실제 중개인 발화 문구 기반'

export const PSYCH_GUARD_CATEGORIES: PsychGuardCategory[] = [
  {
    // 희소성: 긴급어 + 손실어 — "지금 안 하면 손해 본다"는 압박으로 즉각적인 결정을 강요.
    category: 'scarcity',
    weight: 3,
    keywords: [
      // 긴급어
      '오늘',
      '지금',
      '당장',
      '곧',
      '빨리',
      '서둘러',
      '마지막',
      '임박',
      // 손실어 — includes 매칭이라 기본형뿐 아니라 실제 대화체 존댓말/평서형 활용형도 함께 등록.
      '놓친다',
      '놓쳐요',
      '놓치세요',
      '놓칠 수도',
      '나간다',
      '나가요',
      '나갑니다',
      '나갈 거예요',
      '넘어간다',
      '넘어가요',
      '넘어갑니다',
      '넘어갈 수도',
      '없어진다',
      '없어져요',
      '없어질 수도',
      '마감',
      '품절',
    ],
    sourceNote: `${NEWS_SOURCE_NOTE}. ${CIALDINI_SOURCE_NOTE}`,
  },
  {
    // 권위: 전문성/경험을 앞세워 세입자 스스로의 확인 절차를 건너뛰게 유도.
    category: 'authority',
    weight: 3,
    keywords: [
      '제가 다 봤어요',
      '제가 다 봤습니다',
      '제가 이미 봤어요',
      '제가 확인했어요',
      '제가 확인했습니다',
      '확인했으니',
      '안 봐도 돼요',
      '안 봐도 됩니다',
      '안 보셔도 돼요',
      '안 보셔도 됩니다',
      '문제없어요',
      '문제없습니다',
      '오래 일했어요',
      '오래 일했습니다',
      '전문가라서',
      '전문가니까',
      '다 알아서',
      '다 알아서 해드릴게요',
    ],
    sourceNote: `${NEWS_SOURCE_NOTE}. ${CIALDINI_SOURCE_NOTE}`,
  },
  {
    // 사회적 증거: 다른 사람들도 그렇게 한다는 암시로 동조 압박.
    category: 'socialProof',
    weight: 2,
    keywords: [
      '다른 손님도',
      '다른 손님들도',
      '다들 그렇게',
      '다들 그렇게 해요',
      '다른 분도',
      '다른 분들도',
      '인기가 많아서',
      '인기가 많으니까',
      '많이들 하세요',
      '많이들 하십니다',
    ],
    sourceNote: CIALDINI_SOURCE_NOTE,
  },
  {
    // 상호성: 작은 호의(할인/서비스)를 베풀어 빚진 느낌을 주고 되갚게 유도.
    category: 'reciprocity',
    weight: 2,
    keywords: [
      '제가 특별히',
      '특별히 해드리는 거예요',
      '원래 안 되는데',
      '원래는 안 되지만',
      '서비스로',
      '서비스 차원에서',
      '깎아드릴게요',
      '깎아드리겠습니다',
      '봐드릴게요',
      '봐드리겠습니다',
    ],
    sourceNote: CIALDINI_SOURCE_NOTE,
  },
  {
    // 호감: 친밀감/신뢰를 앞세워 검증 없이 그대로 따르게 유도.
    category: 'liking',
    weight: 1,
    keywords: [
      '저 믿으세요',
      '저를 믿으세요',
      '저만 믿고',
      '저만 믿으시면',
      '저 아니었으면',
      '제가 아니었으면',
      '진짜 좋은 분이라서',
      '정말 좋은 분이라서',
    ],
    sourceNote: CIALDINI_SOURCE_NOTE,
  },
  {
    // 일관성(commitment): 이전 발언/행동을 상기시켜 번복하기 어렵게 만듦.
    category: 'commitment',
    weight: 1,
    keywords: [
      '아까 그러셨잖아요',
      '방금 그러셨잖아요',
      '아까 말씀하셨잖아요',
      '이미 마음 정하셨잖아요',
      '마음 이미 정하셨잖아요',
      '계약금만 먼저',
      '계약금부터 먼저',
    ],
    sourceNote: CIALDINI_SOURCE_NOTE,
  },
]
