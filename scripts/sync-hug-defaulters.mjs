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
import { Agent } from "undici";
import crypto from "node:crypto";
import dotenv from "dotenv";

// 로컬 실행 시에만 .env.local에서 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 읽는다.
// GitHub Actions에서는 워크플로우가 실제 env를 주입하므로 이 값들이 이미 있어 덮어쓰지 않는다.
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://www.khug.or.kr/jeonse/web/s01/s010321.jsp";
// 페이지 요청 사이 딜레이. 180페이지쯤부터 ConnectTimeoutError가 발생해 HUG 측
// 속도 제한/봇 방지로 추정 — 500ms~1s 랜덤 딜레이로 완화. 절대 줄이지 말 것.
const REQUEST_DELAY_MIN_MS = 500;
const REQUEST_DELAY_MAX_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MIN_MS = 2000;
const RETRY_DELAY_MAX_MS = 3000;
const JOB_NAME = "sync-hug-defaulters";
// 페이지 몇 개마다 그때까지 모은 행을 Supabase에 flush할지 — 중간에 실패해도
// 이미 flush된 페이지는 저장돼 있고, 다음 실행이 실패 지점부터 재개할 수 있다.
const FLUSH_EVERY_PAGES = 20;

// undici 기본 connect timeout(10s)이 err 로그의 UND_ERR_CONNECT_TIMEOUT 10000ms와 일치 —
// HUG 서버가 부하 시 응답이 느려질 수 있으므로 20~30s로 상향.
const fetchDispatcher = new Agent({
  connect: { timeout: 25_000 },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  return minMs + Math.random() * (maxMs - minMs);
}

// 실패 시 재개 지점(다음에 이어서 처리할 페이지 번호) — main()에서 갱신하고,
// 최상위 catch에서 batch_job_status.last_result에 기록해 다음 실행이 참고하게 한다.
let lastCompletedPage = 0;

// Edge Function들의 _shared/jobStatus.ts와 같은 역할 — GitHub Actions로 도는 이 스크립트도
// 같은 batch_job_status 테이블에 자신의 실행 결과를 남겨, 마이페이지 상태판에서 다른 배치
// 작업들과 동일하게 "마지막 갱신: N일 전"으로 보이게 한다.
async function recordJobRun(outcome) {
  const now = new Date().toISOString();
  const patch = outcome.success
    ? {
        job_name: JOB_NAME,
        last_run_at: now,
        last_success_at: now,
        last_error: null,
        last_result: outcome.result ?? null,
        updated_at: now,
      }
    : {
        job_name: JOB_NAME,
        last_run_at: now,
        last_error: String(outcome.error).slice(0, 500),
        last_result: outcome.resumeFromPage
          ? { resumeFromPage: outcome.resumeFromPage }
          : null,
        updated_at: now,
      };

  const { error } = await supabase
    .from("batch_job_status")
    .upsert(patch, { onConflict: "job_name" });
  if (error) {
    console.error("[sync-hug-defaulters] batch_job_status 기록 실패", error);
  }
}

// 직전 실행이 페이지 도중 실패했다면 그 지점부터 재개한다. 직전 실행이 성공했거나
// 기록이 없으면(또는 last_result에 체크포인트가 없으면) 1페이지부터 처음 시작한다.
async function getResumePage() {
  const { data, error } = await supabase
    .from("batch_job_status")
    .select("last_error, last_result")
    .eq("job_name", JOB_NAME)
    .maybeSingle();
  if (error || !data?.last_error) return 1;

  const resumeFromPage = data.last_result?.resumeFromPage;
  return Number.isInteger(resumeFromPage) && resumeFromPage > 1
    ? resumeFromPage
    : 1;
}

async function fetchPage(pageNum) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}?cur_page=${pageNum}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        dispatcher: fetchDispatcher,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return iconv.decode(buffer, "euc-kr");
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const waitMs = randomDelay(RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS);
      console.warn(
        `[sync-hug-defaulters] ${pageNum}페이지 요청 실패(시도 ${attempt}/${MAX_RETRIES}): ${err.message}. ${Math.round(waitMs)}ms 후 재시도`,
      );
      await sleep(waitMs);
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

// buffer에 쌓인 행을 raw_row_hash 기준 upsert로 즉시 저장한다. onConflict로 중복은
// 자동 병합되므로, 재개 시 겹치는 페이지를 다시 보내도 안전하다.
async function flushRows(rows) {
  if (rows.length === 0) return null;

  const payload = rows.map((row) => ({
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
      return error;
    }
  }
  return null;
}

async function main() {
  console.log("[sync-hug-defaulters] 시작");

  const firstPageHtml = await fetchPage(1);
  const totalPages = await getTotalPages(firstPageHtml);
  console.log(`[sync-hug-defaulters] 총 ${totalPages}페이지 감지`);

  const startPage = await getResumePage();
  if (startPage > 1) {
    console.log(
      `[sync-hug-defaulters] 이전 실행이 ${startPage}페이지 직전까지 실패한 기록이 있어 그 지점부터 재개`,
    );
  }
  lastCompletedPage = startPage - 1;

  // 1페이지는 총 페이지 수 계산을 위해 항상 다시 받으므로, 재개 여부와 무관하게 버퍼에
  // 포함해도 무방하다(raw_row_hash upsert가 중복을 안전하게 병합).
  let buffer = parseRows(firstPageHtml);
  let totalRows = 0;
  let firstUpsertError = null;

  for (let page = Math.max(startPage, 2); page <= totalPages; page++) {
    await sleep(randomDelay(REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS));
    const html = await fetchPage(page);
    buffer = buffer.concat(parseRows(html));
    lastCompletedPage = page;

    if (page % FLUSH_EVERY_PAGES === 0 || page === totalPages) {
      const error = await flushRows(buffer);
      if (error) {
        firstUpsertError ??= error;
        process.exitCode = 1;
      }
      totalRows += buffer.length;
      buffer = [];
      console.log(
        `[sync-hug-defaulters] ${page}/${totalPages} 페이지 처리 (누적 ${totalRows}건 저장)`,
      );
    }
  }

  // startPage가 totalPages보다 커서 루프가 한 번도 안 돈 경우(재개 지점이 실제 총
  // 페이지 수를 넘어선 경우) 등, 1페이지 분량이 아직 buffer에 남아있을 수 있어 안전망으로 flush.
  if (buffer.length > 0) {
    const error = await flushRows(buffer);
    if (error) {
      firstUpsertError ??= error;
      process.exitCode = 1;
    }
    totalRows += buffer.length;
    buffer = [];
  }

  if (firstUpsertError) {
    await recordJobRun({
      success: false,
      error: `hug_defaulters upsert 실패: ${firstUpsertError.message}`,
    });
  } else {
    await recordJobRun({
      success: true,
      result: { totalPages, totalRows },
    });
  }

  console.log("[sync-hug-defaulters] 완료");
}

main().catch(async (err) => {
  console.error("[sync-hug-defaulters] 실패", err);
  await recordJobRun({
    success: false,
    error: err.message ?? String(err),
    // 페이지 루프 도중 실패했다면 다음 실행이 lastCompletedPage+1부터 재개하도록 기록.
    // 1페이지도 못 받고 실패한 경우(lastCompletedPage === 0)는 처음부터 다시 시작.
    resumeFromPage: lastCompletedPage > 0 ? lastCompletedPage + 1 : undefined,
  });
  process.exitCode = 1;
});
