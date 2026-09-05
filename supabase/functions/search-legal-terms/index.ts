// Supabase Edge Function: search-legal-terms
// /law-search 페이지("검증되지 않은 실시간 검색")가 쓰는, 법제처 국가법령정보 공동활용
// API(lawSearch.do/lawService.do, target=lstrm)를 대신 호출해 주는 얇은 프록시.
// MOLEG_API_OC는 여기(서버)에서만 읽고 클라이언트에는 절대 내려주지 않는다.
//
// scripts/fetch-legal-terms.mjs와 달리 이 엔드포인트는 "관련성 필터"를 걸지 않는다 —
// /law-search 자체가 "무관한 법령이 섞여 있을 수 있는 검증 안 된 원문 검색"이라는 걸
// 사용자에게 그대로 보여주는 화면이라, 사전구분코드(dictionaryLabel)만 알려주고 필터링은
// 사용자 판단에 맡긴다.

const OC = Deno.env.get("MOLEG_API_OC");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 검색 한 번에 상세(정의) 조회까지 하는 개수를 제한한다 — 흔한 단어는 검색 결과가 수십 건이라,
// 전부 lawService.do로 조회하면 요청 하나가 너무 느려지고 법제처 API도 과하게 두드리게 된다.
const MAX_DETAIL_LOOKUPS = 15;

const DICTIONARY_LABELS: Record<string, string> = {
  "011402": "법령정의사전",
  "011403": "법령한영사전",
};

interface SearchEntry {
  법령용어명: string;
  법령용어ID: string;
  사전구분코드: string;
  법령용어상세검색: string;
}

interface ServiceDetail {
  법령용어코드?: string;
  법령용어정의?: string;
  출처?: string;
}

async function fetchJson(path: string): Promise<unknown> {
  let lastErr: unknown;
  for (const scheme of ["http", "https"]) {
    try {
      const res = await fetch(`${scheme}://www.law.go.kr${path}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function searchTerm(query: string): Promise<{ entries: SearchEntry[]; totalCnt: number }> {
  const path = `/DRF/lawSearch.do?OC=${OC}&target=lstrm&type=JSON&display=30&query=${encodeURIComponent(query)}`;
  const json = (await fetchJson(path)) as {
    LsTrmSearch?: { lstrm?: SearchEntry | SearchEntry[]; totalCnt?: string };
    result?: string;
    msg?: string;
  };

  // 법제처 API는 인증/입력 오류일 때 LsTrmSearch가 아예 없는 다른 모양({result, msg})으로
  // 응답한다(IP 미등록 시 "사용자 정보 검증에 실패" 등). 이걸 놓치면 진짜 오류가 "검색 결과
  // 0건"으로 조용히 둔갑해 버린다 — 실제로 배포 후 재현되어 이 방어 코드를 추가함.
  if (!json?.LsTrmSearch) {
    throw new Error(`법제처 API 응답 이상 — result="${json?.result}" msg="${json?.msg}"`);
  }

  const raw = json.LsTrmSearch.lstrm;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { entries, totalCnt: Number(json.LsTrmSearch.totalCnt ?? entries.length) };
}

async function fetchDetail(trmSeq: string): Promise<ServiceDetail | null> {
  const path = `/DRF/lawService.do?OC=${OC}&target=lstrm&type=JSON&trmSeqs=${trmSeq}`;
  const json = (await fetchJson(path)) as { LsTrmService?: ServiceDetail };
  return json?.LsTrmService ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!OC) {
    console.error("MOLEG_API_OC is not set in Supabase Secrets");
    return jsonResponse({ error: "법령 검색 기능이 설정되지 않았습니다. 관리자에게 문의하세요." }, 500);
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const query = body.query?.trim();
  if (!query) return jsonResponse({ error: "검색어가 필요합니다." }, 400);

  try {
    const { entries, totalCnt } = await searchTerm(query);

    // 그룹으로 묶인 항목(콤마로 이어진 법령용어ID)은 첫 번째 id만 대표로 상세 조회한다 —
    // 한 검색 결과 행당 상세 조회 1회로 총 호출 수를 예측 가능하게 유지하기 위함.
    const toLookup = entries.slice(0, MAX_DETAIL_LOOKUPS);
    const results = await Promise.all(
      toLookup.map(async (entry) => {
        const firstId = String(entry["법령용어ID"] ?? "").split(",")[0]?.trim();
        const detail = firstId ? await fetchDetail(firstId).catch(() => null) : null;
        const code = detail?.["법령용어코드"] ?? entry["사전구분코드"]?.split(",")[0];
        return {
          term: entry["법령용어명"],
          definition: detail?.["법령용어정의"]?.trim() || null,
          dictionaryCode: code ?? null,
          dictionaryLabel: code ? (DICTIONARY_LABELS[code] ?? "기타 사전") : null,
          source: detail?.["출처"] ?? null,
          detailUrl: `https://www.law.go.kr${entry["법령용어상세검색"]}`,
        };
      }),
    );

    return jsonResponse({
      query,
      totalCnt,
      truncated: entries.length > MAX_DETAIL_LOOKUPS,
      results,
    });
  } catch (err) {
    // 2026-09 확인: 법제처 오픈API는 호출 서버 IP를 화이트리스트로 등록해야 하는데,
    // Supabase Edge Function은 고정 아웃바운드 IP를 제공하지 않아(공식 문서로 확인) 이 호출은
    // 현재 항상 "사용자 정보 검증에 실패" 에러로 막힌다. 고정 IP 아웃바운드 프록시(자체 VM 또는
    // QuotaGuard/OutboundGateway 같은 서비스)를 앞에 두기 전까지는 정상 동작하지 않는다.
    console.error("search-legal-terms failed", err);
    return jsonResponse({ error: "법령 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, 502);
  }
});
