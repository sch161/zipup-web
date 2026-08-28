// contract_risk_patterns 20건을 매번 통째로 프롬프트에 넣으면 Gemini 요청이 무거워져 28초
// 타임아웃을 자주 넘긴다(analyze-contract의 Gemini 호출 지연 문제, 2026-08-28). 이미 CLOVA
// OCR로 읽어 둔 계약서 텍스트에 각 패턴의 특징 키워드가 하나라도 등장하는 패턴만 골라 넣어
// 프롬프트 크기를 줄인다 — 새 네트워크/DB 호출은 추가하지 않고 순수 문자열 매칭만 한다.

export interface RiskPattern {
  id: number
  pattern_name: string
  description: string
  severity: string
  recommended_action: string
}

// pattern id -> 실제 계약서/등기부등본 텍스트에 등장할 법한 핵심 키워드. contract_risk_patterns의
// 실제 라이브 데이터 20건(2026-07-20 시딩, id 1~20) 내용을 직접 조회해 확인하고 고른 값이라,
// 이 테이블의 내용이 바뀌면(패턴 추가/수정) 이 목록도 함께 손봐야 한다 — 자동 추출이 아니라
// 수동 큐레이션이다.
export const RISK_PATTERN_KEYWORDS: Record<number, string[]> = {
  1: ['근저당', '대항력', '확정일자'], // 대항력 발생 시차 악용
  2: ['지위승계', '소유자변경', '소유자 변경'], // 임대인 무단 변경(바지사장 매매)
  3: ['신탁', '수탁자', '위탁자'], // 신탁 부동산 무단 계약
  4: ['보증보험', '반환보증', 'HUG', 'SGI'], // 보증보험 가입 불발
  5: ['위임장', '대리인', '인감증명서'], // 무권 대리인 계약
  6: ['근린생활시설', '위반건축물', '용도변경', '용도 변경'], // 근린생활시설 용도 속임
  7: ['다가구', '선순위', '전입세대확인서', '전입세대 확인서'], // 다가구 선순위 보증금 은폐
  8: ['당해세', '체납', '완납증명서', '완납 증명서'], // 국세/지방세 체납
  9: ['업계약', '깡통전세', '감정가'], // 업계약서/깡통전세
  10: ['법인', '대표이사', '연대보증'], // 페이퍼컴퍼니 법인 임대인
  11: ['이중계약', '이중 계약', '관리인', '전대'], // 전세-월세 이중 계약
  12: ['임차권등기명령', '임차권 등기명령'], // 임차권등기명령 금지 조항
  13: ['원상복구', '도배', '장판'], // 과도한 원상복구
  14: ['보일러', '누수', '배관'], // 필수 수리비 전가
  15: ['위약금'], // 집 보여주기 거부 시 위약금
  16: ['경매', '가압류', '압류'], // 경매 진행 시 반환 미루기
  17: ['다음 세입자', '다음세입자'], // 조건부 보증금 반환
  18: ['가계약금', '가계약'], // 가계약금 반환 거부
  19: ['관리비'], // 관리비 꼼수
  20: ['위반건축물', '이행강제금', '단전', '단수'], // 위반건축물 지정
}

export interface PatternFilterResult {
  matched: RiskPattern[]
  matchedIds: number[]
  /** 키워드 매칭이 하나도 없어(또는 OCR 텍스트 자체가 없어) 안전하게 전체 패턴으로 되돌아간 경우. */
  fellBackToAll: boolean
}

/** ocrText 안에 패턴의 키워드가 하나라도 등장하면 그 패턴을 포함시킨다. 매칭이 하나도 없으면
 *  (OCR 텍스트가 비어 있는 경우 포함) 안전한 쪽으로 전체 패턴을 그대로 반환한다 — 매칭 0건은
 *  실제로 위험이 없다기보다 OCR 품질 문제이거나 첨부 파일이 없는 경우일 가능성이 더 크다고
 *  판단했기 때문이다(근거 사례 없이 Gemini 자체 판단에만 맡기는 쪽보다 안전). */
export function filterRiskPatternsByKeywords(patterns: RiskPattern[], ocrText: string): PatternFilterResult {
  const matched = patterns.filter((p) => {
    const keywords = RISK_PATTERN_KEYWORDS[p.id] ?? []
    return keywords.some((kw) => ocrText.includes(kw))
  })

  if (matched.length === 0) {
    return { matched: patterns, matchedIds: patterns.map((p) => p.id), fellBackToAll: true }
  }
  return { matched, matchedIds: matched.map((p) => p.id), fellBackToAll: false }
}
