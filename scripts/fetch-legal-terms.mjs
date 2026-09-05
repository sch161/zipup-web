// scripts/fetch-legal-terms.mjs
// 법제처 국가법령정보 공동활용 API(target=lstrm)로 법령 용어의 공식 정의를 조회해
// Supabase `legal_terms` 테이블에 upsert 한다.
//
// API는 2단계로 나뉜다(실제 호출로 확인한 구조, 문서와 다를 수 있음에 주의):
//   1. lawSearch.do?target=lstrm&query=<term>  → 이름이 일치하는 용어 후보 목록(정의 텍스트 없음)
//   2. lawService.do?target=lstrm&trmSeqs=<id> → 후보 하나의 실제 정의(용어당 한 건씩만 조회 가능,
//      trmSeqs를 콤마로 묶어 한 번에 여러 건 조회하는 것은 "일치하는 법령용어가 없습니다"로 실패함이
//      실제 호출로 확인됨 — 검색 결과가 콤마로 묶어 보여주더라도 상세 조회는 항상 개별 id로 한다)
//
// 용어 하나에 대해 사전이 여러 종류로 갈라진다(사전구분코드):
//   - 011402 = 법령정의사전: 특정 법령/훈령이 본문에서 명시적으로 정의한 용어. 우리가 원하는 것.
//   - 011403 = 법령한영사전: 한국어 용어의 영어 번역만 준다(예: 대항력 → "counterforce"). 정의 아님, 버린다.
// 검색 결과에서 법령용어명이 검색어와 "정확히" 일치하는 항목만 후보로 삼고, 그 항목의 trmSeqs를
// (그룹인 경우 콤마로 분리해) 각각 상세 조회해 011402 코드인 것을 찾는다. 그런 항목이 없으면
// (법령이 명시적으로 정의하지 않은 법률 개념이거나, 깡통전세/갭투자 같은 시사 용어라 검색 결과 자체가
// 없는 경우) official_definition은 null로 남기고 나중에 사람이 직접 채운다.
//
// 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MOLEG_API_OC
// 실행: node scripts/fetch-legal-terms.mjs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const OC = process.env.MOLEG_API_OC;
const REQUEST_DELAY_MS = 300; // 정부 API 예의상 딜레이
const DEFINITION_DICT_CODE = "011402"; // 법령정의사전

// "임대인", "보증금"처럼 흔한 단어는 산림청 장비대여 훈령, 병 보증금(자원순환) 지침 등 완전히
// 무관한 규정에도 각자 자기 목적으로 같은 단어를 정의해 두는 경우가 실제로 있었다(실제 호출로
// 확인됨 — 임대인→산림청 임업기계장비 훈령, 보증금→용기보증금 반환 지침, 원상복구→지하수법
// 토양오염 복구). 법령정의사전(011402) 항목이 있어도 그 출처가 주택임대차와 무관하면 조용히
// 잘못된 정의가 저장되므로, 출처 문자열에 아래 키워드가 하나도 없으면 채택하지 않는다.
const RELEVANT_SOURCE_KEYWORDS = ["임대차", "민법", "주택", "상가건물", "부동산", "공인중개사"];

function isRelevantSource(source) {
  return !!source && RELEVANT_SOURCE_KEYWORDS.some((kw) => source.includes(kw));
}

const TERMS = [
  "대항력", "확정일자", "우선변제권", "임차권등기명령", "소액임차인",
  "강행규정", "근저당", "전세가율", "특약사항", "원상복구",
  "필요비", "유익비", "임대인", "임차인", "보증금",
  "계약갱신청구권", "깡통전세", "갭투자", "전세사기", "바지사장",
];

if (!OC) {
  console.error("MOLEG_API_OC가 설정되어 있지 않습니다(.env.local 확인).");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// http://가 일부 환경(사내망, 특정 클라우드 아웃바운드 정책 등)에서 막힐 수 있다고 해서
// http 먼저 시도하고, 실패하면 https로 재시도한다. 어느 쪽이 실제로 동작했는지 로그로 남긴다.
async function fetchJson(path) {
  for (const scheme of ["http", "https"]) {
    const url = `${scheme}://www.law.go.kr${path}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { json, scheme };
    } catch (err) {
      console.error(`  [${scheme}] 호출 실패: ${err.message}`);
      if (scheme === "https") throw err; // 둘 다 실패하면 최종적으로 던진다
    }
  }
}

async function searchTerm(term) {
  const path = `/DRF/lawSearch.do?OC=${OC}&target=lstrm&type=JSON&display=100&query=${encodeURIComponent(term)}`;
  const { json, scheme } = await fetchJson(path);
  const list = json?.LsTrmSearch?.lstrm;
  return { entries: Array.isArray(list) ? list : list ? [list] : [], scheme };
}

async function fetchDefinition(trmSeq) {
  const path = `/DRF/lawService.do?OC=${OC}&target=lstrm&type=JSON&trmSeqs=${trmSeq}`;
  const { json } = await fetchJson(path);
  const service = json?.LsTrmService;
  if (!service) return null;
  return {
    code: service["법령용어코드"],
    definition: service["법령용어정의"]?.trim() || null,
    source: service["출처"] || null,
  };
}

/** 검색 결과 중 법령용어명이 term과 정확히 일치하는 항목들의 trmSeqs를 전부(콤마 그룹 포함)
 *  개별 id로 풀어서 모은다. */
function collectExactMatchIds(entries, term) {
  const ids = [];
  for (const entry of entries) {
    if (entry["법령용어명"] !== term) continue;
    const seqs = String(entry["법령용어ID"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    ids.push(...seqs);
  }
  return [...new Set(ids)];
}

async function resolveOfficialDefinition(term) {
  const { entries, scheme } = await searchTerm(term);
  await sleep(REQUEST_DELAY_MS);

  if (entries.length === 0) {
    return { officialDefinition: null, source: null, scheme, note: "검색 결과 없음" };
  }

  const candidateIds = collectExactMatchIds(entries, term);
  if (candidateIds.length === 0) {
    return { officialDefinition: null, source: null, scheme, note: "정확히 일치하는 용어명 없음" };
  }

  // 011402(법령정의사전) 항목을 전부 모은 뒤, 주택임대차와 무관해 보이는 것들은 걸러내고
  // 그중에서만 고른다 — 첫 번째로 찾은 것을 무조건 채택하지 않는다(위 주석 참고).
  const definitionHits = [];
  for (const id of candidateIds) {
    const detail = await fetchDefinition(id);
    await sleep(REQUEST_DELAY_MS);
    if (detail?.code === DEFINITION_DICT_CODE && detail.definition) {
      definitionHits.push({ id, ...detail });
    }
  }

  if (definitionHits.length === 0) {
    return { officialDefinition: null, source: null, scheme, note: "법령정의사전(011402) 항목 없음(한영사전만 있음 등)" };
  }

  const relevant = definitionHits.find((hit) => isRelevantSource(hit.source));
  if (relevant) {
    return { officialDefinition: relevant.definition, source: relevant.source, scheme, note: `trmSeqs=${relevant.id}` };
  }

  return {
    officialDefinition: null,
    source: null,
    scheme,
    note: `011402 항목 ${definitionHits.length}건 있으나 전부 주택임대차와 무관한 출처라 제외 (예: ${definitionHits[0].source})`,
  };
}

async function main() {
  console.log(`총 ${TERMS.length}개 용어 조회 시작 (OC=${OC})\n`);
  const results = [];

  for (const term of TERMS) {
    process.stdout.write(`- ${term} ... `);
    try {
      const { officialDefinition, source, scheme, note } = await resolveOfficialDefinition(term);
      console.log(officialDefinition ? `[${scheme}] 정의 찾음 (${note})` : `[${scheme}] null (${note})`);
      results.push({ term, official_definition: officialDefinition, source });
    } catch (err) {
      console.log(`실패: ${err.message}`);
      results.push({ term, official_definition: null, source: null });
    }
  }

  console.log("\nSupabase에 upsert 중...");
  for (const row of results) {
    const { error } = await supabase
      .from("legal_terms")
      .upsert(row, { onConflict: "term" });
    if (error) console.error(`  ${row.term} upsert 실패:`, error.message);
  }

  const found = results.filter((r) => r.official_definition).length;
  console.log(`\n완료: ${found}/${results.length}건 공식 정의 확보, 나머지는 official_definition=null로 저장됨.`);
}

main();
