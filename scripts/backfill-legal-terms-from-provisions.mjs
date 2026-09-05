// scripts/backfill-legal-terms-from-provisions.mjs
// 법제처 법령용어사전(target=lstrm)에 없거나 무관한 정의만 있던 용어 중, 이미 검증된
// legal_provisions 원문에 그대로 등장하는 6개는 API를 다시 부르지 않고 legal_provisions에서
// 그대로 채운다(2026-09 fetch-legal-terms.mjs 결과 확인 후 사람이 직접 확정한 매핑).
//
// 필요비/유익비는 legal_provisions.id=7(민법 제626조)이 ①②항을 한 컬럼에 같이 담고 있어서,
// 그 항만 잘라 쓴다 — legal_provisions.content 자체는 건드리지 않는다.
//
// 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 실행: node scripts/backfill-legal-terms-from-provisions.mjs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// provisionId: legal_provisions.id. definition이 없으면 provision의 content를 그대로 쓴다.
const MAPPINGS = [
  { term: "대항력", provisionId: 1 },
  { term: "우선변제권", provisionId: 2 },
  { term: "임차권등기명령", provisionId: 3 },
  { term: "강행규정", provisionId: 5 },
  {
    term: "필요비",
    provisionId: 7,
    definition:
      "①임차인이 임차물의 보존에 관한 필요비를 지출한 때에는 임대인에 대하여 그 상환을 청구할 수 있다.",
    articleSuffix: "제1항",
  },
  {
    term: "유익비",
    provisionId: 7,
    definition:
      "②임차인이 유익비를 지출한 경우에는 임대인은 임대차종료시에 그 가액의 증가가 현존한 때에 한하여 임차인의 지출한 금액이나 그 증가액을 상환하여야 한다.",
    articleSuffix: "제2항",
  },
];

async function main() {
  const { data: provisions, error } = await supabase
    .from("legal_provisions")
    .select("id, law_name, article, title, content");
  if (error) throw error;

  const byId = new Map(provisions.map((p) => [p.id, p]));

  for (const { term, provisionId, definition, articleSuffix } of MAPPINGS) {
    const provision = byId.get(provisionId);
    if (!provision) {
      console.error(`${term}: legal_provisions id=${provisionId} 를 찾지 못함, 건너뜀`);
      continue;
    }

    const official_definition = definition ?? provision.content;
    const articlePart = articleSuffix ? `${provision.article} ${articleSuffix}` : provision.article;
    const source = `${provision.law_name} ${articlePart}(${provision.title})`;

    const { error: upsertError } = await supabase
      .from("legal_terms")
      .upsert(
        { term, official_definition, source, related_provision_id: provisionId },
        { onConflict: "term" },
      );

    if (upsertError) {
      console.error(`${term}: upsert 실패`, upsertError.message);
    } else {
      console.log(`${term}: ${source} 기준으로 채움`);
    }
  }
}

main();
