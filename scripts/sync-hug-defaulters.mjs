// scripts/sync-hug-defaulters.mjs
// HUG(주택도시보증공사) "상습채무불이행자 명단" 전체를 크롤링해서
// Supabase `hug_defaulters` 테이블에 upsert 한다.
// - 대상 페이지는 EUC-KR로 서빙되므로 iconv-lite로 반드시 디코딩해야 한다.
// - JS 렌더링 없이 서버가 완성된 HTML 테이블을 내려주므로 axios+cheerio로 충분하다 (Playwright 불필요).
// - GitHub Actions cron (예: 매주 1회) 이나 로컬에서 `node scripts/sync-hug-defaulters.mjs` 로 실행.
//
// 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import iconv from "iconv-lite";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import dotenv from "dotenv";

// 로컬 실행 시에만 .env.local에서 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 읽는다.
// GitHub Actions에서는 워크플로우가 실제 env를 주입하므로 이 값들이 이미 있어 덮어쓰지 않는다.
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://www.khug.or.kr/jeonse/web/s01/s010321.jsp";
const REQUEST_DELAY_MS = 400; // 정부 사이트 예의상 딜레이. 절대 줄이지 말 것.
const MAX_RETRIES = 3;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(pageNum) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}?cur_page=${pageNum}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ZIPUP-Sync/1.0; +https://zipup-web.vercel.app)",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return iconv.decode(buffer, "euc-kr");
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(1000 * attempt);
    }
  }
}

// 통화/숫자 텍스트("476,000,000") -> bigint 문자열로 안전 변환
function parseNumber(text) {
  const cleaned = (text || "").replace(/[^0-9]/g, "");
  return cleaned ? cleaned : null;
}

function parseDate(text) {
  const t = (text || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function parseRows(html) {
  const $ = cheerio.load(html);
  const rows = [];

  // 실제 HUG 마크업 확인 결과: <tbody id="tbd1"> 안에 데이터 행이 들어있다.
  // 컬럼 순서(0~9): 이름 / 나이 / 주소 / 임차보증금 반환채무 / 최초 채무발생일 /
  //                채무불이행기간 / 보증채무이행일 / 구상채무 / 강제집행 횟수 / 기준일
  $("#tbd1 tr").each((_, el) => {
    const cells = $(el)
      .find("td")
      .map((__, td) => $(td).text().trim())
      .get();
    if (cells.length < 10) return; // 헤더/공백 행 스킵

    // destructuring 대신 index로 명시해 순서 실수를 방지한다 (컬럼 순서는 변경되지 않는다고 가정하지 않음).
    const name = cells[0];
    const age = cells[1];
    const address = cells[2];
    const depositReturnDebt = cells[3];
    const debtOccurredAt = cells[4];
    const debtPeriodDays = cells[5];
    const guaranteePaymentAt = cells[6];
    const reimbursementDebt = cells[7];
    const executionCount = cells[8];
    const baseDate = cells[9];

    rows.push({
      name,
      age: age ? Number(age.replace(/[^0-9]/g, "")) : null,
      address,
      deposit_return_debt: parseNumber(depositReturnDebt),
      debt_occurred_at: parseDate(debtOccurredAt),
      debt_period_days: debtPeriodDays
        ? Number(debtPeriodDays.replace(/[^0-9]/g, ""))
        : null,
      guarantee_payment_at: parseDate(guaranteePaymentAt),
      reimbursement_debt: parseNumber(reimbursementDebt),
      execution_count: executionCount
        ? Number(executionCount.replace(/[^0-9]/g, ""))
        : null,
      base_date: parseDate(baseDate),
    });
  });

  return rows;
}

// 소스가 고유 id를 안 주므로, 행 내용 해시로 중복 방지 + upsert 키를 만든다.
function rowHash(row) {
  const key = [
    row.name,
    row.address,
    row.deposit_return_debt,
    row.debt_occurred_at,
  ].join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function getTotalPages(firstPageHtml) {
  const $ = cheerio.load(firstPageHtml);
  // 하단 "1 / 228" 형태 텍스트에서 총 페이지 수 추출.
  // 사이트 마크업이 바뀌면 이 파싱도 깨지니, 실패 시 안전하게 1페이지만 처리하도록 폴백.
  const text = $.text();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[2]) : 1;
}

async function main() {
  console.log("[sync-hug-defaulters] 시작");

  const firstPageHtml = await fetchPage(1);
  const totalPages = await getTotalPages(firstPageHtml);
  console.log(`[sync-hug-defaulters] 총 ${totalPages}페이지 감지`);

  let allRows = parseRows(firstPageHtml);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(REQUEST_DELAY_MS);
    const html = await fetchPage(page);
    const rows = parseRows(html);
    allRows = allRows.concat(rows);
    if (page % 20 === 0)
      console.log(`[sync-hug-defaulters] ${page}/${totalPages} 페이지 처리`);
  }

  console.log(
    `[sync-hug-defaulters] 총 ${allRows.length}건 파싱 완료. Supabase upsert 시작`,
  );

  const payload = allRows.map((row) => ({
    ...row,
    raw_row_hash: rowHash(row),
    synced_at: new Date().toISOString(),
  }));

  // 500건씩 배치 upsert (한 번에 너무 큰 요청 방지)
  const BATCH = 500;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase
      .from("hug_defaulters")
      .upsert(chunk, { onConflict: "raw_row_hash" });
    if (error) {
      console.error("[sync-hug-defaulters] upsert 오류", error);
      process.exitCode = 1;
    }
  }

  console.log("[sync-hug-defaulters] 완료");
}

main().catch((err) => {
  console.error("[sync-hug-defaulters] 실패", err);
  process.exitCode = 1;
});
