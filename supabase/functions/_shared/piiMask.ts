// Pure logic for deciding which CLOVA OCR fields contain PII that must be blacked out before an
// image reaches Gemini. No network calls here on purpose — this stays unit-testable against
// mocked CLOVA field data, which matters because the CLOVA free tier is capped at 100 calls/month.
import type { ClovaOcrField } from './clovaOcr.ts'

export interface MaskBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 마스킹 개수를 유형별로 집계한 것. 실제 텍스트는 절대 담지 않는다 — 로그로 남겨도 안전하도록
 *  하기 위한 용도이므로, 여기에 값(이름/번호 등)을 추가하지 않도록 주의할 것. */
export interface PiiMaskStats {
  totalFields: number
  maskedFields: number
  rrn: number
  account: number
  phone: number
  landlordName: number
  tenantName: number
  /** "성명"/"영수자"처럼 어느 당사자인지 특정할 수 없는 이름 라벨. */
  genericName: number
  /** 하단 당사자 표의 "주소"(개인 주소). 상단 매물 소재지("소재지")는 애초에 라벨 목록에 없다. */
  partyAddress: number
}

export interface PiiMaskResult {
  boxes: MaskBox[]
  /** 임대인 라벨 옆에서 읽은 이름. HUG 명단 조회 전용 — Gemini에는 절대 전달하지 않는다. */
  landlordName: string
  stats: PiiMaskStats
}

// 주민등록번호: 6자리 + (구분자 없음/하이픈/공백) + 7자리.
const RRN_PATTERN = /\d{6}[-\s]?\d{7}/
// 계좌번호: 은행마다 자릿수가 달라 완벽한 패턴은 없다 — "숫자-숫자-숫자" 3그룹 형태를 폭넓게 잡되,
// 계약기간처럼 흔히 쓰이는 YYYY-MM-DD 날짜 형식은 아래에서 별도로 걸러낸다.
const ACCOUNT_PATTERN = /\d{2,6}-\d{2,6}-\d{2,8}/
const DATE_LIKE_PATTERN = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
// 전화번호: 휴대폰(01[016789]) 또는 지역번호 유선전화.
const PHONE_PATTERN = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}|0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}/

type NameFieldType = 'landlordName' | 'tenantName' | 'genericName' | 'partyAddress'

interface LabelSpec {
  label: string
  fieldType: NameFieldType
  /** 라벨 뒤 같은 줄에 몇 개 필드까지를 "값"으로 볼지. 이보다 많으면 조항 본문 등 문장 속에서
   *  라벨 단어가 등장한 것으로 보고 아무것도 마스킹하지 않는다. 이름은 보통 1~2토큰이라 좁게,
   *  주소는 여러 토큰(시/구/동/번지)으로 이뤄지는 게 정상이라 넉넉하게 둔다. */
  maxTrailingTokens: number
  maxTrailingChars: number
}

const LABEL_SPECS: LabelSpec[] = [
  { label: '임대인', fieldType: 'landlordName', maxTrailingTokens: 3, maxTrailingChars: 20 },
  { label: '임차인', fieldType: 'tenantName', maxTrailingTokens: 3, maxTrailingChars: 20 },
  // 성명/영수자는 어느 당사자인지 특정할 수 없어 landlordName 추출에는 쓰지 않고 마스킹에만 쓴다.
  { label: '성명', fieldType: 'genericName', maxTrailingTokens: 3, maxTrailingChars: 20 },
  { label: '영수자', fieldType: 'genericName', maxTrailingTokens: 3, maxTrailingChars: 20 },
  // "주소"만 매칭하고 "소재지"(매물 주소)는 라벨 목록에 아예 넣지 않는 것으로 상단/하단을 구분한다 —
  // 표준임대차계약서 관례상 매물 소재지는 "소재지", 당사자 개인 주소는 "주소"로 서로 다른 단어를 쓴다.
  { label: '주소', fieldType: 'partyAddress', maxTrailingTokens: 8, maxTrailingChars: 40 },
]

const NAME_STOPWORDS = new Set(['인', '(인)', '㊞', '서명', '날인', '(서명)', '(날인)', '성명', ':', '：', '(', ')'])
// "임대인"/"임차인"/"성명" 등 뒤에 이 정도 장식만 붙어 있으면 폼 라벨로 본다(예: "임차인(을)",
// "임차인:"). 그 외의 나머지(예: "이", "은" 같은 조사)가 붙어 있으면 "임차인이 부담한다"처럼 조항
// 본문 문장 속에서 쓰인 것으로 보고 라벨로 취급하지 않는다 — 그렇지 않으면 문장 뒤 내용까지
// 통째로 마스킹돼 조항 본문이 손상된다(실제로 발생했던 오탐 2건: 특약사항의 "원상복구는 임차인이
// 부담한다", 제7조 조항 본문 속의 "임대인").
const LABEL_DECORATION_SUFFIXES = new Set(['', '갑', '을', '성명', '서명', '인'])
// 라벨 바로 다음 필드가 이런 접속사/조사라면, 토큰 수와 무관하게 문장 속 사용으로 보고 건너뛴다.
// (예: "책임은 임대인 또는 임차인에게 있다"에서 "임대인" 바로 뒤에 오는 "또는".)
const CLAUSE_CONNECTOR_WORDS = new Set([
  '또는', '그리고', '및', '혹은', '은', '는', '이', '가', '을', '를', '의', '에게', '에서', '으로', '로', '와', '과', '만약', '단',
])

function boundingBox(vertices: { x: number; y: number }[]): MaskBox {
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}

function height(box: MaskBox): number {
  return Math.max(box.y2 - box.y1, 1)
}

function isAccountNumber(text: string): boolean {
  const match = text.match(ACCOUNT_PATTERN)
  if (!match) return false
  return !DATE_LIKE_PATTERN.test(match[0])
}

type NumericPiiType = 'rrn' | 'account' | 'phone' | null

function classifyNumericPii(text: string): NumericPiiType {
  if (RRN_PATTERN.test(text)) return 'rrn'
  if (PHONE_PATTERN.test(text)) return 'phone'
  if (isAccountNumber(text)) return 'account'
  return null
}

function matchesNumericPii(text: string): boolean {
  return classifyNumericPii(text) !== null
}

/** 폼 라벨(임대인/임차인/성명/영수자/주소)인지 판정한다. startsWith + 허용된 장식 접미사만으로
 *  제한해, 문장 속에 조사가 붙어 등장하는 경우(예: "임차인이", "임대인은")를 라벨로 오인하지
 *  않는다. */
function matchLabel(text: string): LabelSpec | null {
  const normalized = text.replace(/[():：\s]/g, '')
  for (const spec of LABEL_SPECS) {
    if (normalized.startsWith(spec.label) && LABEL_DECORATION_SUFFIXES.has(normalized.slice(spec.label.length))) {
      return spec
    }
  }
  return null
}

/** CLOVA는 보통 읽기 순서(왼쪽→오른쪽, 위→아래)대로 fields를 반환하므로, 인접 인덱스를 "같은 줄
 *  후보"로 취급한다. 주민등록번호가 공백으로 두 필드에 걸쳐 나뉘는 경우를 잡기 위함. */
export function findPiiMasks(fields: ClovaOcrField[]): PiiMaskResult {
  const boxes: MaskBox[] = []
  const maskedIndices = new Set<number>()
  const fieldBoxes = fields.map((f) => boundingBox(f.vertices))
  const stats: PiiMaskStats = {
    totalFields: fields.length,
    maskedFields: 0,
    rrn: 0,
    account: 0,
    phone: 0,
    landlordName: 0,
    tenantName: 0,
    genericName: 0,
    partyAddress: 0,
  }

  const sameLine = (i: number, j: number): boolean => {
    const a = fieldBoxes[i]
    const b = fieldBoxes[j]
    return Math.abs((a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2) < height(a) * 0.6
  }

  const maskField = (index: number, type: Exclude<keyof PiiMaskStats, 'totalFields' | 'maskedFields'>) => {
    boxes.push(fieldBoxes[index])
    maskedIndices.add(index)
    stats[type]++
    stats.maskedFields++
  }

  // 1) 숫자 패턴 PII: 단독 필드, 그리고 같은 줄의 바로 다음 필드와 이어붙였을 때도 검사한다.
  for (let i = 0; i < fields.length; i++) {
    const soloType = classifyNumericPii(fields[i].text)
    if (soloType) {
      maskField(i, soloType)
      continue
    }

    // 다음 필드 자체가 이미 단독으로 PII와 매치된다면(예: 라벨 다음에 오는 완전한 값) 그 필드는
    // 자기 차례(i+1)에 스스로 마스킹된다 — 여기서 라벨과 묶어버리면 "라벨+값"을 통째로 마스킹하는
    // 오탐이 생기므로, 결합 검사는 "둘 다 단독으로는 매치되지 않는" 경우로만 제한한다.
    const next = i + 1 < fields.length ? fields[i + 1] : null
    if (next && !matchesNumericPii(next.text) && sameLine(i, i + 1)) {
      const combined = `${fields[i].text}${next.text}`
      const combinedWithSpace = `${fields[i].text} ${next.text}`
      const combinedType = classifyNumericPii(combined) ?? classifyNumericPii(combinedWithSpace)
      if (combinedType) {
        maskField(i, combinedType)
        maskField(i + 1, combinedType)
      }
    }
  }

  // 2) 라벨(임대인/임차인/성명/영수자/주소)과 같은 줄에서, 라벨보다 오른쪽에 있는 텍스트를 값으로
  //    간주해 마스킹한다. 다만 값 후보가 너무 많거나(조항 본문일 가능성) 첫 후보가 접속사/조사면
  //    라벨 단어가 문장 속에서 쓰인 것으로 보고 아무것도 마스킹하지 않는다 — 실제로 "제7조
  //    (채무불이행과 손해배상) 임대인 또는 임차인이 ..." 같은 조항 본문이 통째로 마스킹됐던 오탐을
  //    막기 위한 조치.
  let landlordName = ''
  for (let i = 0; i < fields.length; i++) {
    const matched = matchLabel(fields[i].text)
    if (!matched) continue

    const labelBox = fieldBoxes[i]
    const candidates: number[] = []
    for (let j = 0; j < fields.length; j++) {
      if (j === i || maskedIndices.has(j)) continue
      const box = fieldBoxes[j]
      const isToRight = box.x1 >= labelBox.x2 - height(labelBox) * 0.3
      if (isToRight && sameLine(i, j)) candidates.push(j)
    }
    candidates.sort((a, b) => fieldBoxes[a].x1 - fieldBoxes[b].x1)

    if (candidates.length === 0 || candidates.length > matched.maxTrailingTokens) continue
    if (CLAUSE_CONNECTOR_WORDS.has(fields[candidates[0]].text.trim())) continue
    const totalChars = candidates.reduce((sum, idx) => sum + fields[idx].text.trim().length, 0)
    if (totalChars > matched.maxTrailingChars) continue

    const nameTokens: string[] = []
    for (const j of candidates) {
      maskField(j, matched.fieldType)
      const cleaned = fields[j].text.trim()
      if (!NAME_STOPWORDS.has(cleaned)) nameTokens.push(cleaned)
    }

    if (matched.fieldType === 'landlordName' && nameTokens.length > 0) {
      landlordName = nameTokens.join('').replace(/\(인\)|\(서명\)|㊞/g, '').trim()
    }
  }

  return { boxes, landlordName, stats }
}
