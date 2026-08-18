# ZIPUP 프로젝트 기술 문서

> 이 문서는 2026-08-18 기준 코드베이스(`src/`, `supabase/functions/`, `supabase/migrations/`, `scripts/`, `.github/workflows/`)를 실제로 읽고 작성했습니다. 계획만 있고 구현되지 않은 부분은 **[미구현]**으로, 구현은 됐지만 한계가 있는 부분은 솔직하게 표기했습니다. 멘토링에서 그대로 읽으면서 설명할 수 있도록 코드 인용보다 흐름 설명 위주로 작성했습니다.

---

## 1. 전체 아키텍처 개요

### 1-1. 구성 요소

- **프론트엔드**: Vite + React 18 + TypeScript + Tailwind CSS. SPA(React Router)로 동작하며 별도 SSR/BFF 서버 없음. Vercel에 정적 배포(`vercel.json` 존재).
- **백엔드**: Supabase Edge Functions(Deno). 사용자 요청 시 실행되는 함수 2개(`analyze-contract`, `analyze-chat`, `delete-account`)와 pg_cron이 주기적으로 호출하는 배치 함수 3개(`fetch-market-data`, `fetch-region-buzz`, `sync-news`)로 구성.
- **데이터베이스**: Supabase Postgres. 8개 테이블 + Row Level Security(RLS) + `pg_trgm` 확장(트라이그램 유사도 검색) + `pg_cron`/`pg_net`(스케줄링·HTTP 호출) + Supabase Vault(시크릿 보관).
- **외부 API**: Google Gemini API(계약서/대화 분석), 네이버 뉴스 검색 API(뉴스·언급빈도), 국토교통부 실거래가 API(전세가율 산출용 원자료), 카카오맵 SDK(지도 렌더링), Google/Kakao OAuth(소셜 로그인).
- **오프-플랫폼 자동화**: GitHub Actions가 주 1회 Node 스크립트(`scripts/sync-hug-defaulters.mjs`)를 실행해 HUG 명단을 크롤링 — Supabase 생태계 밖에서 도는 유일한 자동화.

### 1-2. 텍스트 다이어그램

```
[브라우저 SPA: React]
   ├─ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  ──▶  Supabase Auth (이메일/Google/Kakao 로그인, JWT 세션)
   ├─ VITE_SUPABASE_ANON_KEY (anon key, RLS로 권한 제한) ──▶  Postgres (analyses, gaslighting_checks, region_stats, news 등 SELECT)
   ├─ supabase.functions.invoke('analyze-contract') ─┐
   ├─ supabase.functions.invoke('analyze-chat')      ─┼─▶  [Supabase Edge Functions, Deno]
   ├─ supabase.functions.invoke('delete-account')    ─┘        │  GEMINI_API_KEY, NAVER_*, MOLIT_API_KEY
   └─ VITE_KAKAO_MAP_KEY ──▶ 카카오맵 SDK(dapi.kakao.com, 브라우저에서 직접 로드)  │  (Supabase Secrets, 서버 전용)
                                                                 ▼
                                    Google Gemini API / 네이버 뉴스 API / 국토교통부 실거래가 API
                                                                 │
                                                                 ▼
                                    service_role 클라이언트로 Postgres에 결과 저장 (RLS 우회)

[pg_cron, Postgres 내부 스케줄러]
   ├─ fetch-market-data-batch (20분 간격, 1일 9회) ─▶ net.http_post(x-cron-secret) ─▶ fetch-market-data 함수 ─▶ MOLIT API ─▶ region_stats 갱신
   ├─ fetch-region-buzz-batch (20분 간격, 시장데이터 10분 뒤) ─▶ fetch-region-buzz 함수 ─▶ 네이버 뉴스 API ─▶ region_stats 갱신
   └─ sync-news (6시간 간격) ─▶ sync-news 함수 ─▶ 네이버 뉴스 API ─▶ news 테이블 갱신

[GitHub Actions, Supabase 밖]
   └─ 매주 월요일 05:00 KST ─▶ scripts/sync-hug-defaulters.mjs (SUPABASE_SERVICE_ROLE_KEY로 직접 접속)
         └─▶ HUG 안심전세포털 크롤링(cheerio) ─▶ hug_defaulters 테이블 upsert
```

### 1-3. 왜 이런 구조를 택했는가

**API 키를 서버(Edge Function)에만 두는 이유**는 브라우저 번들에 포함되는 모든 `VITE_` 접두사 환경변수는 최종 사용자에게 그대로 노출되기 때문입니다. Gemini/네이버/국토부 키가 프론트에 있으면 누구나 개발자 도구로 추출해 무단 사용·과금 유발이 가능합니다. 그래서:

- `GEMINI_API_KEY`, `NAVER_CLIENT_ID/SECRET`, `MOLIT_API_KEY`는 **Supabase Secrets**(Edge Function 런타임에만 주입되는 환경변수)에 두고, 프론트는 이 값들을 절대 참조하지 않습니다. 대신 프론트는 `supabase.functions.invoke(...)`로 Edge Function을 호출하고, 실제 외부 API 호출은 서버 쪽 코드가 대행합니다.
- `SUPABASE_SERVICE_ROLE_KEY`(RLS를 완전히 우회하는 최고 권한 키)는 GitHub Actions Secrets에만 존재하고, 리포지토리 코드 어디에도 값 자체가 없습니다. 이 키가 필요한 이유는 계약서/대화 분석 결과를 `analyses`/`gaslighting_checks`에 쓸 때, 그리고 HUG 명단을 `hug_defaulters`에 upsert할 때 RLS 정책(본인 데이터만 SELECT 가능)을 우회해 시스템이 대신 써야 하기 때문입니다.
- 반대로 **카카오맵 JavaScript 키**(`VITE_KAKAO_MAP_KEY`)는 프론트 환경변수로 관리합니다. 애초에 브라우저에서 직접 로드되는 것을 전제로 발급되는 키이고, 카카오 개발자 콘솔에서 도메인 화이트리스트로 오남용을 막는 구조이기 때문에 서버에 숨길 이유가 없습니다.
- 사용자 요청형 함수(`analyze-contract`, `analyze-chat`)는 `supabase/config.toml`에서 `verify_jwt = false`로 설정되어 있습니다. 이유는 프로젝트가 신규 형식의 publishable anon key(`sb_publishable_...`)를 쓰는데, 이는 JWT가 아니라서 비로그인 상태에서는 Authorization 헤더 자체가 안 실리기 때문입니다(`verify_jwt=true`면 비로그인 사용자의 모든 요청이 거부됨). 대신 함수 내부에서 `Authorization` 헤더가 있으면 파싱해 `user_id`를 선택적으로 채우고, 없으면 `user_id`를 `null`로 저장합니다 — 즉 **비로그인 상태에서도 분석 자체는 가능하지만 이력이 남지 않습니다.**
- 배치 함수(`fetch-market-data`, `fetch-region-buzz`)는 pg_cron/pg_net이 호출하는데, 이 경로는 Supabase가 서명한 JWT를 실을 수 없습니다. 그래서 별도의 `x-cron-secret` 헤더(값은 Supabase Vault에 저장된 `cron_secret`)를 자체 검증하는 방식(`_shared/cronAuth.ts`)으로 "이 요청은 pg_cron이 보낸 것이 맞다"를 확인합니다.

---

## 2. 화면(페이지)별 기능 목록

`src/pages/` 기준 실제 존재하는 페이지는 총 9개입니다. `MainLayout`(TopNav+BottomNav)으로 감싸이는 페이지는 `/home`, `/psych-guard`, `/map`, `/profile` 4개뿐이고, 나머지(`/`, `/login`, `/signup`, `/analysis`, `/psych-guard/:id`, `/privacy`)는 레이아웃 밖에서 독립적으로 렌더링됩니다. 특히 `/analysis`는 성격상 "앱의 핵심 화면"인데도 `MainLayout` 밖에 있어서, `Analysis.tsx`가 자체적으로 `<TopNav variant="app"/>`를 다시 렌더링하고 `BottomNav`는 아예 없습니다 — 레이아웃 일관성 관점의 사소한 허점입니다.

| 라우트 | 파일 | 기능 | 데이터 소스 | 호출 함수 |
|---|---|---|---|---|
| `/`, `/login` | `Login.tsx` | 이메일 로그인, Google/Kakao 로그인 | Supabase Auth | `supabase.auth.signInWithPassword`, `supabase.auth.signInWithOAuth({provider:'google'\|'kakao'})` |
| `/signup` | `Signup.tsx` | 이메일 회원가입, 소셜 회원가입 | Supabase Auth | `supabase.auth.signUp` (name/region을 user_metadata에 저장), `signInWithOAuth` |
| `/home` | `Home.tsx` | 계약서 업로드 폼 + 최근 뉴스 목록 | `news` 테이블 | `analyzeContract()` → Edge Function `analyze-contract`, `fetchLatestNews(12)` |
| `/analysis` | `Analysis.tsx` | 계약서 분석 결과 표시 | `location.state` 또는 `sessionStorage`(`zipup:lastAnalysis`) | 없음(수신한 결과를 그대로 렌더링) |
| `/psych-guard` | `Cure.tsx` | 심리 가드(가스라이팅 탐지) 채팅 UI | `sessionStorage`(`zipup:psychGuardMessages`) | `analyzeChat()` → Edge Function `analyze-chat` |
| `/psych-guard/:id` | `GaslightingDetail.tsx` | 개별 대화 분석 결과 상세 | `gaslighting_checks` 테이블 | `fetchGaslightingCheckById(id)` |
| `/map` | `SignalMap.tsx` | 전국 시/군/구 위험도 지도 | `region_stats` 테이블 + `public/data/skorea-municipalities.json` | `fetchRegionStats()`, 카카오맵 SDK |
| `/profile` | `Profile.tsx` | 프로필, 분석 이력, 계정 관리, 배치 작업 상태판 | `analyses`, `gaslighting_checks`, `batch_job_status` 테이블 | `fetchAnalysisHistory()`, `fetchGaslightingHistory()`, `deleteAccount()`, `fetchBatchJobStatus()` |
| `/privacy` | `Privacy.tsx` | 개인정보 처리방침 안내 | 없음(정적 텍스트) | 없음 |

**인증 가드**: 라우트 레벨의 접근 제어 컴포넌트는 존재하지 않습니다. 로그인 여부와 무관하게 `Home`/`Cure`/`SignalMap`/`Analysis`는 렌더링되고, 실제로 로그아웃 상태에서 리다이렉트를 거는 화면은 **`Profile.tsx`가 유일**합니다(`useEffect`에서 `supabase.auth.getUser()` 확인 후 `!user`면 `/login`으로 이동).

---

## 3. 기능별 상세 데이터 흐름

### 3-1. 계약서 안전 스캔 (`/home` → `/analysis`)

**① 사용자 입력** — `Home.tsx`의 업로드 카드에서 주소(필수), 보증금(필수), 건물 유형(선택)을 입력하고, 계약서/등기부등본 이미지 또는 PDF를 파일 선택 또는 드래그 앤 드롭으로 첨부합니다. 화면에는 "최대 20MB, HWP는 PDF로 변환" 안내 문구가 있지만 **실제 파일 크기·타입 검증 코드는 존재하지 않습니다** — 안내는 텍스트일 뿐이고 무엇을 올려도 그대로 전송됩니다.

**② 처리 — 프론트 인코딩** — `analyzeContract()`(`src/lib/analyzeContract.ts`)가 파일을 `arrayBuffer()`로 읽어 바이트 단위로 순회하며 `btoa()`로 base64 문자열을 만듭니다(청크 분할 없이 메인 스레드에서 동기 실행 — 큰 파일일수록 UI가 잠깐 멈출 수 있음). 이후 `{ address, deposit, buildingType, fileBase64, fileMimeType }`을 body로 `supabase.functions.invoke('analyze-contract')`를 호출합니다. 업로드는 별도 Storage 경유 없이 **파일 전체를 JSON 요청 본문에 base64로 실어 보내는 방식**입니다.

**③ 처리 — Edge Function `analyze-contract`**
1. `address` 또는 `fileBase64` 둘 중 하나는 필수(둘 다 없으면 400). `GEMINI_API_KEY` 미설정 시 500.
2. **"RAG" 단계** — `contract_risk_patterns`(전세사기·독소조항 실제 피해 패턴 DB, 약 20건)를 조건 없이 `SELECT *`로 **전부** 가져와 프롬프트에 통째로 삽입합니다. 코드 주석에 "테이블이 20건 내외의 작은 지식베이스라 키워드 검색 없이 전부 포함시킨다(테이블이 커지면 검색 기반으로 바꿀 것)"이라고 명시되어 있습니다 — 즉 **실제로는 유사도 검색이 아니라 전체 덤프이며, 벡터 임베딩·전문검색(tsvector) 등은 코드에서 전혀 쓰이지 않습니다.** (아래 7장에서 스키마 이력 문제와 함께 다시 설명)
3. Gemini API(`gemini-flash-latest`, 환경변수 `GEMINI_MODEL`로 재정의 가능)를 멀티모달로 호출합니다. 이미지/PDF는 `inline_data`로 프롬프트에 직접 첨부하고(별도 OCR 단계 없음), `responseSchema`로 JSON 스키마를 강제해 구조화된 응답을 받습니다. 429(과부하)/503(할당량 초과) 응답 시 `[1000ms, 3000ms]` 지연으로 최대 2회 재시도(총 3회 시도), 요청당 타임아웃 28초.
4. **위험도 점수는 서버가 계산하지 않고 Gemini가 직접 산출**합니다. 프롬프트는 모델에게 "패턴 DB의 대항력 악용·신탁 부동산·바지사장 넘기기·과도한 원상복구 등이 발견되면 `hugLandlordCheck.isBlacklisted`를 true로 설정하고 `overallScore`를 무조건 40점 미만(danger)으로 낮추라"는 **규칙을 텍스트로 지시**할 뿐이며, 서버 코드는 Gemini가 반환한 JSON을 그대로 파싱해 사용합니다(재검증·재계산 없음).
5. Gemini가 계약서에서 추출한 `landlordName`이 있으면, 별도로 Postgres 함수 `search_hug_defaulters_by_name(query_name, min_similarity=0.4)`를 호출합니다 — `pg_trgm`의 `similarity()` 함수로 이름 컬럼만 비교하는 트라이그램 유사도 검색이며, 유사도 0.4 이상인 상위 5건을 반환합니다. 이 결과는 `hugDefaulterMatch`라는 **별도 필드**로 응답에 붙습니다 — Gemini가 패턴만 보고 "추정"한 `hugLandlordCheck`와는 명확히 구분되는, **공식 명단 대조에 기반한 사실 확인**입니다.
6. 최종적으로 `analyses` 테이블에 service_role 클라이언트로 insert합니다(주소/보증금/건물유형/점수/등급/카테고리/조항/추천조치/코멘트). 저장이 실패해도 사용자에게 보여줄 분석 결과 자체는 정상 반환됩니다(이력 저장 실패가 사용자 경험을 막지 않도록 설계).

**④ 결과** — `Analysis.tsx`가 응답을 `sessionStorage`에 캐싱하며 렌더링합니다. HUG 공식 명단과 일치하면 빨간 배너("HUG 상습 채무불이행자 명단에서 발견"), AI 패턴 추정만 있으면 주황 배너("AI 위험 패턴 감지")로 시각적으로 구분해 보여줍니다. `RiskGauge`로 종합 점수, 카테고리별(권리관계·특약사항·전세가율·건물상태) 막대, 발견된 유의 조항, AI 추천 조치를 표시합니다.

### 3-2. 심리 가드 (가스라이팅 탐지)

**① 입력** — `Cure.tsx`의 채팅형 UI에서 텍스트(엔터로 전송, Shift+Enter 줄바꿈) 또는 캡처 이미지 1장을 첨부합니다. 대화 스레드는 `sessionStorage`(`zipup:psychGuardMessages`)에 저장되어 탭 내에서는 유지되지만 탭을 닫으면 사라집니다 — DB(`gaslighting_checks`)와는 별개의 저장소라서, 만약 DB insert가 실패해도 화면상 대화는 그대로 보입니다.

**② 처리** — `analyzeChat()`이 동일한 방식으로 base64 인코딩 후 Edge Function `analyze-chat`을 호출합니다. Gemini 호출 로직(모델명, 재시도 횟수/지연, 타임아웃)은 `analyze-contract`와 **완전히 동일하지만 코드가 별도 파일에 복사되어 있어 중복**입니다. 패턴별 확신도(재촉/허위정보 주입/신뢰 유도 각각 0~100점), 종합 `confidence`, `riskLevel`(위험/주의/안전), 경고 여부(`isWarning`)는 **전부 Gemini가 JSON으로 직접 산출**하며, 서버에는 이를 재계산하는 로직이 없습니다. `gaslighting_checks`에 service_role로 insert(입력 텍스트, 위험등급, 확신도, 패턴, 추천 응답 — Gemini의 답장 문구 `aiReply` 자체는 DB에 저장되지 않고 응답에만 포함됨).

**③ 결과** — `AnalysisPanel`이 `RiskGauge`(확신도 기준)와 패턴별 칩을 보여줍니다. 칩 색상은 점수 70 이상 위험/40 이상 주의/그 미만 안전으로 나누는 `patternTone()` 함수로 정하는데, 이 함수는 `Cure.tsx`와 `GaslightingDetail.tsx`에 **각각 복사**되어 있습니다. 사용자가 바로 복사해 쓸 수 있는 "AI 추천 대응 멘트"(`suggestedResponse`)도 함께 표시됩니다.

`/psych-guard/:id`(`GaslightingDetail.tsx`)는 프로필 이력에서 특정 대화를 클릭했을 때의 상세 화면으로, router state 없이 **id로 DB를 다시 조회**합니다(`fetchGaslightingCheckById`). 이 조회 쿼리는 `.eq('user_id', ...)` 필터가 코드상 없고 RLS 정책(`auth.uid() = user_id`)에만 접근 제어를 맡깁니다 — 마이그레이션을 확인한 결과 이 RLS 정책 자체는 정상적으로 걸려 있어 실질적인 보안 취약점은 아니지만, 다른 조회 함수들이 클라이언트에서도 이중으로 필터링하는 것과 비교하면 방어 계층이 하나 적은 구조입니다.

### 3-3. 안심 시그널 맵

이 기능은 **사용자가 요청할 때 실시간으로 계산되는 것이 아니라, pg_cron 배치가 미리 계산해 둔 `region_stats` 테이블을 프론트가 그대로 읽어오는 구조**입니다. 지도를 여는 순간 일어나는 일과, 그 데이터가 애초에 어떻게 만들어지는지를 나눠서 설명합니다.

**데이터가 만들어지는 과정 (배치, 자세한 스케줄은 4장 참고)**
1. `fetch-market-data`가 국토교통부 실거래가 API 4종(아파트 매매/전월세, 연립다세대 매매/전월세)을 지역(LAWD 코드)별로 호출해 전월 실거래 데이터를 가져오고, 지역별 평균 매매가·평균 전세가·전세가율(`전세가/매매가 × 100`)을 계산해 `region_stats`에 저장합니다.
2. `fetch-region-buzz`가 네이버 뉴스 API로 `"{지역명} 전세사기"`를 검색해 전체 검색결과 수(`total` 필드)를 `region_stats.news_mentions`에 저장합니다.
3. 두 함수 모두 배치가 끝날 때마다 `recalculateAllRiskScores()`(`_shared/riskScore.ts`)를 호출해 전체 지역의 `risk_score`/`risk_level`을 다시 계산·갱신합니다(정확한 공식은 6장 참고).

**지도를 열었을 때 (프론트, `SignalMap.tsx`)**
1. `VITE_KAKAO_MAP_KEY`로 카카오맵 SDK 스크립트를 동적으로 주입하고 로드합니다(키가 없으면 에러 메시지만 표시하고 로드를 시도하지 않음).
2. `public/data/skorea-municipalities.json`을 fetch합니다. 이 파일은 `southkorea-maps` 오픈소스의 2018년 시/군/구 TopoJSON을 `scripts/build-nationwide-geojson.mjs`(수동 실행 스크립트)로 GeoJSON 변환하면서, 법정동코드(LAWD_CD) 5자리를 각 지역에 정확히 매핑해 사전 생성해 둔 정적 파일입니다. 이름만으로 매칭하면 "중구"·"강서구"처럼 전국에 동명 지역이 여러 곳이라 코드 기반 매칭이 필요하다는 이유가 코드 주석에 명시되어 있습니다.
3. `fetchRegionStats()`(`src/lib/regionStats.ts`)로 `region_stats` 테이블 전체(약 252행)를 조회해, 지도 폴리곤의 `properties.code`(LAWD 코드)와 조인합니다.
4. `risk_level` 값(위험/주의/안전)을 미리 정해진 색상(위험 `#E5484D`, 주의 `#E8912A`, 안전 `#12A150`, 매칭 데이터 없음 `#B4B1AB`)에 매핑해 폴리곤을 칠합니다. **위험도 등급을 나누는 실제 임계값 계산은 프론트에 전혀 없고**, `region_stats`에 이미 계산되어 저장된 값을 그대로 색으로 바꿀 뿐입니다.
5. 좌측 패널에 "전세가율 50% · HUG 밀도 30% · 뉴스 언급 20%"라는 가중치 설명이 표시되는데, 이는 **UI 안내 문구로 하드코딩된 값**입니다. 실제 백엔드 공식(6장)과 일치하도록 사람이 수동으로 맞춰 둔 것이며, 프론트가 이 값을 어떤 설정이나 API에서 읽어오는 구조는 아닙니다(다행히 실제로 값이 일치함은 `_shared/riskScore.ts`를 직접 확인해 검증했습니다).
6. 지역 검색은 지역명에 검색어가 포함되는지만 보는 단순 부분일치(`includes`)로, 첫 번째로 매칭된 결과만 사용합니다(순위·복수 결과 처리 없음).

### 3-4. 인증 (이메일 / Google / Kakao)

세 방식 모두 **Supabase Auth 하나로 통합**되어 있고, 별도 `profiles` 테이블이나 커스텀 세션 관리 코드는 없습니다.

- **이메일**: `Login.tsx`는 `supabase.auth.signInWithPassword({ email, password })`, `Signup.tsx`는 `supabase.auth.signUp({ email, password, options: { data: { name, region } } })`을 호출합니다. 이름/지역은 별도 테이블이 아니라 Supabase Auth의 `user_metadata`에 저장됩니다. 이메일 확인이 필요한 프로젝트 설정이면(`data.session`이 없으면) 안내 메시지만 보여주고, 세션이 즉시 발급되면 `/home`으로 이동합니다.
- **Google / Kakao**: 두 경우 모두 `supabase.auth.signInWithOAuth({ provider: 'google' | 'kakao', options: { redirectTo: `${origin}/home` } })` 한 줄로 처리됩니다. 즉 **Kakao 로그인도 카카오 SDK를 따로 붙인 게 아니라 Supabase가 제공하는 OAuth 프로바이더 통합을 그대로 사용**합니다. "회원가입"과 "로그인" 버튼이 내부적으로 완전히 동일한 함수를 호출하는데, 이는 OAuth의 특성상 Supabase가 최초 로그인 시 사용자를 자동 생성해 주기 때문입니다. README에는 카카오 일반 개발자 앱은 이메일 동의항목이 제한되어 있어 비즈 앱 전환이 필요하다고 명시되어 있으나, 이는 카카오 개발자 콘솔 설정 사항이라 리포지토리 코드로는 확인할 수 없습니다.
- 로그인 성공/실패와 무관하게 앱 어디에도 전역 인증 컨텍스트(Context/Provider)가 없고, 각 컴포넌트가 필요할 때마다 개별적으로 `supabase.auth.getUser()`/`onAuthStateChange`를 호출합니다(예: `TopNav.tsx`, `Profile.tsx`).

### 3-5. 배치 작업 상태판 (2026-08-18 추가)

3-3에서 설명한 sync-news 401 사고(29일간 조용히 실패)가 재발하지 않도록, 마이페이지에 "배치 작업 상태" 카드를 추가했습니다. 흐름은 다음과 같습니다.

**기록(백엔드)** — 배치 4종(`fetch-market-data`, `fetch-region-buzz`, `sync-news`, `sync-hug-defaulters`)이 각자 실행을 마칠 때마다 `public.batch_job_status`(작업명 PK, `last_run_at`/`last_success_at`/`last_error`/`last_result`)에 스스로 결과를 기록합니다. Edge Function 3개는 공통 헬퍼 `_shared/jobStatus.ts`의 `recordJobRun()`을 성공 경로와 모든 실패 경로(설정 누락, 외부 API 오류, 예외)에 각각 호출하고, `scripts/sync-hug-defaulters.mjs`(GitHub Actions)는 같은 역할을 하는 동일한 로직을 자체적으로 구현해 `main()` 성공 시점과 `.catch()` 실패 시점에 호출합니다. 이번 사고에서 배웠듯 `cron.job_run_details`(pg_net의 SQL 큐잉 성공 여부)만으로는 진짜 실패를 알 수 없기 때문에, **각 함수가 스스로 "나 지금 성공/실패했다"를 직접 남기는 방식**을 택했습니다.

**조회(프론트)** — `src/lib/jobStatus.ts`의 `fetchBatchJobStatus()`가 `batch_job_status` 전체를 조회하고, `BatchJobStatusCard.tsx`가 작업마다 "마지막 갱신: N시간/일 전"과 상태 배지(✅ 정상 / ⚠️ 지연 / 🔴 중단 의심 / ❔ 기록 없음)를 보여줍니다. 상태 판정은 작업별로 하드코딩된 임계값(예: `sync-news`는 12시간 지연·24시간 중단 의심, 하루 한 번만 도는 `fetch-market-data`/`fetch-region-buzz`는 30시간·72시간, 주 1회인 `sync-hug-defaulters`는 9일·14일)을 `last_success_at`과 비교해서 프론트에서 계산합니다 — DB에 저장된 값이 아니라 컴포넌트 상수입니다.

**한계**: 이메일/슬랙 등 능동적 알림은 없고, 사용자가 마이페이지를 직접 열어야만 보입니다(그래서 완전한 "감지"가 아니라 "눈으로 확인하면 바로 알 수 있게 만든 것"에 가깝습니다). 또한 함수가 배포조차 안 되거나 Deno 런타임 자체가 기동에 실패하는 등 코드가 전혀 실행되지 못하는 극단적 장애는 여전히 기록되지 않습니다(이번 sync-news 401 사고는 코드가 실행되긴 했으니 이 방식으로 잡혔을 것이지만, 완전히 다른 종류의 장애까지 보장하진 않습니다). RLS는 `authenticated`로 제한해 로그인 사용자만 볼 수 있게 했습니다.

### 3-6. 마이페이지 — 분석 이력 조회 방식

`Profile.tsx`는 로그인 가드를 통과하면(`getUser()`로 확인) `Promise.all`로 두 이력을 동시에 조회합니다:
- `fetchAnalysisHistory(userId)` → `analyses` 테이블을 `user_id`로 필터, `created_at` 내림차순
- `fetchGaslightingHistory(userId)` → `gaslighting_checks` 테이블을 동일한 방식으로 필터

두 쿼리 모두 **클라이언트 코드에서 `.eq('user_id', userId)`로 한 번 필터링하고, 서버의 RLS 정책이 다시 한 번 필터링하는 이중 방어 구조**입니다(위에서 언급한 `GaslightingDetail.tsx`의 단건 조회와는 다른 패턴). 탭 전환(계약서 스캔 / 마음 상담)은 이미 받아온 두 배열을 화면에서만 바꿔 보여주는 클라이언트 사이드 전환이며, "전체보기" 버튼도 처음부터 가져온 배열을 5개씩 자르는 `.slice(0, 5)` 토글일 뿐, 실제로 더 가져오는 재조회는 일어나지 않습니다.

계약서 이력 항목을 클릭하면 `toAnalysisResult()`로 DB 행을 `AnalysisResult` 형태로 재구성해 `/analysis`로 이동합니다. 이 재구성 과정에서 `landlordName`/`hugDefaulterMatch`/`hugLandlordCheck` 필드는 애초에 이력 조회 쿼리(`ANALYSIS_COLUMNS`)에 포함되지 않아 **소실됩니다** — 즉 실시간 분석 직후에는 보였던 HUG 명단 대조 배너가, 나중에 마이페이지에서 같은 분석을 다시 열어보면 나타나지 않습니다(7장 한계에서 다시 언급).

---

## 4. 자동화(배치) 작업 목록

### 4-1. Supabase pg_cron (Postgres 내부 스케줄러, 최종 3개 작업)

| 작업명 | 스케줄(UTC) | 실제 시각(KST) | 대상 | 타임아웃 |
|---|---|---|---|---|
| `fetch-market-data-batch` | `*/20 18-20 * * *` | 03:00~05:40, 20분 간격 하루 9회 | `fetch-market-data` 함수 | 120,000ms |
| `fetch-region-buzz-batch` | `10-50/20 18-20 * * *` | 03:10~05:50, 20분 간격 하루 9회(시장데이터보다 10분 늦게) | `fetch-region-buzz` 함수 | 120,000ms |
| `sync-news` | `0 */6 * * *` | 매 6시간(00/06/12/18시 UTC) | `sync-news` 함수 | 30,000ms |

**왜 배치로 나누는가**: Supabase Edge Function은 실행시간 제한(약 150초)이 있는데, 전국 시/군/구는 252개 지역입니다. 하나의 함수 호출로 전부 처리할 수 없어서, `region_sync_cursor` 테이블에 진행 상태(다음에 처리할 지역 인덱스, 오늘 날짜의 사이클)를 저장해두고 한 번에 `BATCH_SIZE`개씩만 처리한 뒤 커서를 갱신하는 방식으로 나눠 돌립니다. 애초 배치 크기는 50개였지만, 연립다세대(빌라) 실거래가 조회가 추가되면서 지역당 처리시간이 약 0.3초에서 2.7초로 늘어나 30개(30×2.7초≈81초, 150초 제한 내 안전마진 확보)로 낮췄고, 그 결과 하루에 필요한 실행 횟수도 `ceil(252/50)=6회`에서 `ceil(252/30)=9회`로 늘어 위 스케줄이 확정되었습니다. 이 조정 과정이 마이그레이션 파일명(`batch_region_stats_cron` → `fix_region_stats_cron_timeout` → `expand_batch_cron_for_villa`)에 그대로 남아 있습니다. 두 배치 사이 20분 텀은 국토부/네이버 API 호출량을 배려한 것이고, 지역 간에도 각각 200ms/150ms의 짧은 딜레이를 둡니다.

`sync-news`는 지역별 배치가 아니라 "전세사기" 키워드로 뉴스 20건을 한 번에 가져와 갱신하는 단발성 작업이라 커서 없이 6시간마다 통째로 돕니다. 다만 다른 두 배치 함수와 달리 `x-cron-secret` 인증을 요구하지 않고(`verify_jwt`가 기본값 `true`인데 실제 호출부에는 인증 헤더가 전혀 없는 설정 불일치가 있음 — 7장 참고), 실제로 2026-07-18~21 사이 이 작업의 호출 URL이 `analyze-contract`로 잘못 설정되어 있어 `news` 테이블이 며칠간 갱신되지 않은 채로 "성공"으로 기록된 사고가 있었고, 이는 URL을 고친 마이그레이션(`fix_sync_news_cron_url`)으로 해결되었습니다.

### 4-2. GitHub Actions (Supabase 밖, 1개 워크플로)

| 워크플로 | 스케줄 | 실행 내용 |
|---|---|---|
| `.github/workflows/sync-hug-defaulters.yml` | `0 20 * * 0` (UTC 일요일 20시 = **KST 매주 월요일 05:00**) + `workflow_dispatch`(수동 실행) | `scripts/sync-hug-defaulters.mjs` 실행 |

**왜 Edge Function이 아니라 별도 스크립트인가**: HUG 안심전세포털의 상습채무불이행자 명단은 여러 페이지로 나뉘어 있고(현재 200페이지대, 페이지 하단의 "N / M" 텍스트를 정규식으로 파싱해 총 페이지 수를 그때그때 동적으로 감지 — 코드에 하드코딩된 숫자가 아님), 정부 사이트에 대한 예의상 페이지마다 400ms 지연을 둡니다. 이렇게 되면 전체 크롤링에 Edge Function의 실행시간 제한을 훌쩍 넘는 시간이 걸리기 때문에, GitHub Actions(워크플로 타임아웃 30분)에서 Node 스크립트로 독립 실행합니다. 페이지의 HTML은 서버에서 완성된 테이블로 내려오므로 브라우저 렌더링(Playwright 등) 없이 `cheerio`로 파싱하고, EUC-KR로 인코딩된 원문을 `iconv-lite`로 디코딩합니다. 각 행은 이름/주소/보증금반환채무 등을 조합한 해시(`raw_row_hash`)를 고유키 삼아 500건씩 배치로 `hug_defaulters` 테이블에 upsert됩니다(소스에 고유 ID가 없어 해시로 중복을 방지).

### 4-3. 배치 상태 모니터링

위 4개 배치(3개 pg_cron 함수 + HUG 크롤러)는 모두 실행이 끝날 때마다 `batch_job_status` 테이블에 스스로 마지막 성공 시각을 기록하고, 마이페이지에서 이를 예상 주기와 비교해 지연/중단 여부를 보여줍니다. 자세한 구조는 3-5 참고.

### 4-4. 자동화되지 않은 스크립트 (수동 실행 전용)

- `scripts/generate-regions.mjs` — 법정동코드 CSV에서 전국 시/군/구 지역 목록을 생성해 `supabase/functions/_shared/regions.generated.ts`를 만드는 스크립트. `npm run generate:regions`로 실행 가능하지만 어떤 CI/cron에도 연결되어 있지 않습니다. 지역 목록이 바뀔 때만 사람이 직접 돌립니다.
- `scripts/build-nationwide-geojson.mjs` — 지도 폴리곤 원본(TopoJSON)에 법정동코드를 매핑해 `public/data/skorea-municipalities.json`을 만드는 스크립트. `package.json`의 npm script로도 등록되어 있지 않고 완전히 수동 실행 전용입니다.

---

## 5. 데이터베이스 테이블 전체 목록

`pg_trgm`(트라이그램 유사도), `pg_cron`, `pg_net`, `supabase_vault` 확장이 사용됩니다. 아래는 마이그레이션을 순서대로 적용했을 때의 최종 스키마 기준입니다.

| 테이블 | 역할 | 주요 컬럼 | 쓰는 주체 | 읽는 주체 | RLS |
|---|---|---|---|---|---|
| `analyses` | 계약서 스캔 결과 이력 | `user_id`(FK, cascade delete), `address`, `deposit`, `building_type`, `overall_score`, `risk_level`(danger/warning/success), `categories`/`detected_clauses`/`recommended_actions`(jsonb), `ai_comment` | `analyze-contract` 함수(service_role) | `Profile.tsx`(`fetchAnalysisHistory`, 본인 것만) | 활성. `authenticated`가 `auth.uid()=user_id`인 행만 SELECT 가능. INSERT 정책 없음(service_role은 RLS 우회) |
| `gaslighting_checks` | 마음 상담(가스라이팅) 분석 이력 | `user_id`(FK, cascade delete), `input_text`, `risk_level`(위험/주의/안전), `confidence`(0~100), `patterns`(jsonb), `suggested_response` | `analyze-chat` 함수(service_role) | `Profile.tsx`, `GaslightingDetail.tsx`(id로 단건) | 활성. `authenticated`가 `auth.uid()=user_id`인 행만 SELECT 가능 |
| `news` | 전세사기 관련 뉴스 캐시 | `title`, `url`(unique), `media`, `published_at` | `sync-news` 함수(service_role) | `Home.tsx`(`fetchLatestNews`) | 활성. `anon`/`authenticated` 모두 전체 SELECT 가능(공개 데이터) |
| `region_stats` | 지역별 위험도 맵 데이터 | `region_code`(unique, LAWD), `region_name`, `avg_sale_price`/`avg_jeonse_price`/`jeonse_ratio`(아파트), `villa_avg_sale_price`/`villa_avg_jeonse_price`/`villa_jeonse_ratio`, `news_mentions`, `hug_defaulter_count`, `risk_score`, `risk_level`(위험/주의/안전) | `fetch-market-data`, `fetch-region-buzz` 함수(service_role) | `SignalMap.tsx`(`fetchRegionStats`, 전체) | 활성. `anon`/`authenticated` 모두 전체 SELECT 가능 |
| `region_sync_cursor` | 지역 배치 처리 진행 상태 | `sync_name`(PK), `next_index`, `cycle_date` | `fetch-market-data`/`fetch-region-buzz` 내부(`_shared/regionBatch.ts`) | 위 두 함수만 | 활성, **정책 없음**(service_role만 접근 가능, anon/authenticated는 기본 차단) |
| `contract_risk_patterns` | 계약서 분석용 위험 패턴 지식베이스 | (아래 스키마 이력 참고) | 수동 시딩 | `analyze-contract`(전체 SELECT) | 활성. `anon`/`authenticated`는 SELECT만 가능, INSERT/UPDATE/DELETE/TRUNCATE는 명시적으로 REVOKE됨 |
| `hug_defaulters` | HUG 상습채무불이행자 명단 로컬 캐시 | `name`, `age`, `address`, `deposit_return_debt`, `debt_occurred_at`, `guarantee_payment_at`, `reimbursement_debt`, `execution_count`, `base_date`, `raw_row_hash`(unique, upsert 키) | `scripts/sync-hug-defaulters.mjs`(service_role, GitHub Actions) | `analyze-contract`(이름 유사도 검색), `_shared/riskScore.ts`(지역별 카운트) | 활성. `anon`/`authenticated` 전체 SELECT 가능 |
| `hug_sync_cursor` | HUG 크롤링 진행 상태(단일 행) | `id`(PK, 항상 1), `last_page`, `total_pages` | (현재 크롤러 스크립트에서 직접 갱신하지는 않고 구조만 존재 — 아래 7장 참고) | — | **한때 RLS 미적용 상태였음** — 아래 참고 |
| `batch_job_status` | 배치 4종의 마지막 실행/성공 시각·에러 기록 (2026-08-18 추가, 3-5 참고) | `job_name`(PK), `last_run_at`, `last_success_at`, `last_error`, `last_result`(jsonb) | 4개 배치(3개 Edge Function + `sync-hug-defaulters.mjs`) 각자 service_role로 자가 기록 | `Profile.tsx`의 `BatchJobStatusCard`(`fetchBatchJobStatus`) | 활성. `authenticated`만 SELECT 가능(비로그인 anon 차단) |

**RLS 관련 특이사항**: `hug_sync_cursor`는 생성 당시(마이그레이션 `20260721000001`) RLS를 켜는 구문이 누락되어, `anon`/`authenticated` 기본 권한이 그대로 노출된 채로 한동안 존재했습니다. 이후 별도 보안 감사에서 발견되어 `20260721000007_enable_rls_hug_sync_cursor.sql`로 RLS를 활성화(정책은 추가하지 않아 결과적으로 service_role만 접근 가능)했습니다. `contract_risk_patterns` 역시 한 시점에 원격 DB에서 테이블이 수동으로 재생성되며 RLS가 꺼진 채로 방치되어 `anon` 키로 쓰기가 가능했던 이력이 있었고, 이 역시 같은 감사에서 발견되어 `20260721000005` 마이그레이션으로 RLS 재활성화 및 쓰기 권한 REVOKE로 조치되었습니다.

**`risk_level` 값 체계가 테이블마다 다릅니다**: `analyses`는 영어(`danger`/`warning`/`success`), `gaslighting_checks`·`region_stats`는 한글(`위험`/`주의`/`안전`)을 씁니다. 기능적으로 문제는 없지만(각자 자기 테이블 안에서만 일관되게 사용) 하나의 코드베이스 안에 두 가지 어휘가 공존하는 점은 알아두어야 합니다.

**`contract_risk_patterns` 스키마 이력 — 코드상 실제로 꼬여 있는 부분**: 최초 마이그레이션(`20260721000000`)은 `category`/`pattern_description`/`risk_level`/`example_clause`/`source`/`keywords`/`search_vector`(생성 컬럼, tsvector) 스키마로 테이블을 만듭니다. 이후 시딩 마이그레이션(`20260721000002`)도 이 컬럼명을 그대로 씁니다. 그런데 `20260721000005`는 주석으로 "실제 운영 DB는 2026-07-20에 수동으로 `pattern_name`/`description`/`severity`/`recommended_action` 스키마로 재생성되었다"고 밝히면서, 동일한 `create table if not exists` 구문을 다시 씁니다. **`IF NOT EXISTS` 때문에, 이 마이그레이션들을 처음부터 순서대로 재생하면(예: 새 환경에 배포) 최초 스키마(구 컬럼명)가 그대로 유지되고 새 스키마로 바뀌지 않습니다** — 즉 "마이그레이션 파일이 기술하는 스키마"와 "실제 운영 DB의 현재 스키마"가 서로 다를 수 있는 상태입니다. 현재 `analyze-contract` 함수 코드는 새 컬럼명(`pattern_name`, `description`, `severity`, `recommended_action`)으로 쿼리하므로, 최초 스키마 그대로인 환경에서는 이 쿼리가 실패합니다. 새 마이그레이션으로 정리되지 않은 기술 부채입니다.

**HUG 관련 RPC 함수 2종**(둘 다 마이그레이션에서 정의):
- `search_hug_defaulters_by_name(query_name, min_similarity=0.4)` — 이름 컬럼에 대한 `pg_trgm` 유사도 검색, 상위 5건. `analyze-contract`가 계약서에서 추출한 임대인 이름을 확인할 때 사용.
- `hug_defaulter_region_counts()` — `hug_defaulters.address`를 정규식(한글 단어 경계 패턴)과 시/도 약칭↔정식명 별칭 테이블로 `region_stats.region_name`에 매칭해 지역별 명단 건수를 집계. 유사도가 아니라 **정확한 토큰 매칭**이며, "남동구"가 "동구"에 잘못 매칭되는 것을 막기 위한 경계 처리가 되어 있습니다. `_shared/riskScore.ts`가 지역 위험도 계산 시 호출.

---

## 6. 위험도 점수 산출 로직

이 프로젝트에는 성격이 완전히 다른 두 가지 "위험도"가 있습니다. 하나는 **결정론적 수식으로 서버가 직접 계산**하고, 다른 하나는 **AI가 판단해서 그대로 내려주는 값**입니다. 멘토링에서 가장 헷갈리기 쉬운 지점이라 명확히 구분합니다.

### 6-1. 안심맵 지역 위험도 — 코드로 계산되는 확정 수식

`supabase/functions/_shared/riskScore.ts`에 정의되어 있고, `fetch-market-data`/`fetch-region-buzz` 배치가 끝날 때마다 전체 지역에 대해 다시 계산됩니다.

**1단계 — 세 지표를 각각 0~100점 구간 점수로 변환** (모두 구간별 선형 보간, 상한 이후는 값 고정):

- 전세가율 점수(`jeonseRatioScore`): 80% 이하는 0~30점, 80~100%는 30~60점, 100~130%는 60~90점, 130% 초과는 90~100점(150%에서 100점 도달, 그 이상은 100점 고정). "깡통전세" 위험이 100%를 넘는 구간에서 점수가 너무 완만하게 오르지 않도록 구간을 잘게 나눴습니다.
- 뉴스 언급 점수(`newsMentionScore`): 0~5건은 0~20점, 6~20건은 20~50점, 21건 이상은 50~100점(50건에서 100점 도달, 그 이상 고정).
- HUG 밀도 점수(`hugDefaulterScore`): 0~5건은 0~20점, 6~22건은 20~60점, 23건 이상은 60~100점(90건에서 100점 도달, 그 이상 고정). 5/22/90이라는 경계값은 2026년 7월 크롤링 기준 252개 지역의 실제 분포(중앙값 5, 90번째 백분위수 22, 최댓값 91)를 근거로 정해졌다고 코드 주석에 명시되어 있습니다.

**2단계 — 아파트/빌라 전세가율을 하나로 합산**: 아파트 30% + 빌라(연립다세대) 70% 가중 평균(`effectiveJeonseRatio`). 한쪽 데이터가 그 달에 없으면 있는 쪽만 사용합니다. 빌라에 더 큰 가중치를 준 이유는 "전세사기는 시세 파악이 어려운 빌라에서 압도적으로 많이 발생하고, 아파트는 실거래가가 투명해 상대적으로 안전하다"는 주석 설명입니다.

**3단계 — 최종 결합**:

```
riskScore = round((전세가율점수 × 0.5 + HUG밀도점수 × 0.3 + 뉴스언급점수 × 0.2) × 10) / 10
riskLevel = riskScore ≥ 70 → '위험'
            riskScore ≥ 40 → '주의'
            그 외        → '안전'
```

이 50%/30%/20% 가중치가 바로 `SignalMap.tsx` 사이드바에 안내되는 수치와 정확히 일치합니다(README와 UI 문구가 실제 코드와 맞는 몇 안 되는 정량적 주장 중 하나로, 직접 대조 확인했습니다). 한 가지 예외 처리로, 그 달 아파트·빌라 실거래가 데이터가 둘 다 없는 지역은 `jeonseRatio`가 `null`이 되어 `calculateRisk()`가 아예 `null`을 반환하고 — 이 경우 기존에 저장돼 있던 `risk_score`/`risk_level` 값이 그대로 남습니다(즉 오래된 값일 수 있고, 화면에서 이를 구분해서 보여주지는 않습니다).

### 6-2. 계약서 위험도 — 서버 공식이 존재하지 않음

솔직히 말하면 **계약서의 `overallScore`(0~100)와 `riskLevel`은 서버 코드에 어떤 계산식도 없습니다.** `analyze-contract` 함수는 Gemini에게 JSON 스키마(`overallScore: INTEGER`, `riskLevel: enum`)로 응답을 강제할 뿐이고, 응답이 오면 `JSON.parse()`해서 그대로 클라이언트에 돌려주고 DB에 저장합니다. 서버가 개입하는 유일한 지점은:

- 프롬프트 텍스트로 "패턴 DB의 위험 신호(대항력 악용·신탁 부동산 등)가 발견되면 `overallScore`를 40점 미만으로 낮추라"고 **모델에게 지시**하는 것 — 이는 코드가 검증하는 규칙이 아니라 모델이 지켜주길 기대하는 자연어 지시이며, 실제로 지켜지는지 서버가 재확인하지 않습니다.
- HUG 명단 실명 대조(`hugDefaulterMatch`)만은 서버가 직접 SQL로 계산한 값이지만, 이것도 `overallScore` 자체에 영향을 주도록 코드로 연결되어 있지는 않습니다(대조 결과는 별도 필드로 붙을 뿐).

즉 계약서 위험도는 **재현성이 보장되지 않습니다.** 같은 계약서를 두 번 올려도 Gemini의 비결정적 특성상 점수가 달라질 수 있고, 이를 검증하거나 클램핑하는 서버 로직도 없습니다. 심리 가드의 `confidence`/패턴 점수도 동일하게 전부 Gemini가 산출한 값을 그대로 사용하는 구조입니다.

---

## 7. 알려진 한계와 미해결 과제

코드에 리터럴 `TODO`/`FIXME` 주석은 없었습니다(전체 `src/`, `supabase/` 검색 결과 0건). 다만 실질적으로 TODO에 해당하는 주석과, 코드를 직접 읽어야만 드러나는 한계들은 다음과 같습니다.

**정확도·재현성 관련**
- 계약서 위험 점수(`overallScore`, `riskLevel`)에 서버 검증 로직이 없어 재현성이 보장되지 않습니다(6-2 참고).
- `analyze-contract`의 "RAG"는 실제로는 유사도 검색이 아니라 지식베이스(~20건) 전체를 프롬프트에 덤프하는 방식입니다. 작성자 스스로 "테이블이 커지면 검색 기반으로 바꿀 것"이라고 남긴 주석이 있어 사실상 TODO입니다.
- `region_stats`의 위험도는 그 달 실거래 데이터가 없는 지역의 경우 갱신되지 않고 이전 값이 그대로 유지되며, 화면에서 이를 "오래된 데이터"로 구분해 보여주지 않습니다.
- HUG 명단-지역 매칭(`hug_defaulter_region_counts`)은 정규식 토큰 매칭이라 주소 표기가 특이한 케이스는 누락될 수 있습니다(README의 "98.9% 매칭" 같은 구체적 수치는 코드 어디에도 계산·저장되어 있지 않아 검증이 불가능합니다 — 실제 매칭률을 추적하는 로직 자체가 없습니다).

**미구현**
- 마이페이지의 알림 설정(위험 알림/분석 알림/마케팅 알림) — UI 자체에 "설정은 저장되지 않아요"라고 명시된 완전한 스텁입니다.
- 회원가입 시 수집하는 `region` 필드 — `user_metadata`에 저장만 되고 이후 어디에서도(마이페이지 표시, 지도 초기 위치 등) 사용되지 않습니다.
- 실시간 실거래가 조회 — 사용자가 지도를 볼 때 즉석에서 계산하는 게 아니라 최대 20분~하루 전에 배치가 계산해 둔 값을 보여줍니다.

**설정/구성 불일치 (2026-08-18 확인 및 수정 완료)**
- `sync-news` cron 작업은 인증 헤더를 전혀 보내지 않는데, 해당 Edge Function은 `verify_jwt` 기본값(`true`)을 그대로 쓰고 있었습니다. 이 문서 초판에서는 "리포지토리 코드만으로는 확정할 수 없다"고 적었지만, 실제 운영 DB(`cron.job_run_details`, `net._http_response`)를 직접 조회해 확정했습니다: **2026-07-20 16:25(KST) 마지막 정상 실행 이후 29일간 매 6시간마다 401 Unauthorized로 거부**되고 있었고, `cron.job_run_details`는 `net.http_post`의 비동기 특성 때문에 계속 "succeeded"로만 기록되어 있어 장애가 숨겨져 있었습니다(진짜 HTTP 결과는 `net._http_response`에서만 확인 가능). `fetch-market-data`/`fetch-region-buzz`와 동일하게 `verify_jwt=false` + `x-cron-secret` 자체 검증 패턴으로 통일해 수정했고(`20260818140000_fix_sync_news_auth.sql`), 수동 트리거로 뉴스 20건 정상 동기화(`{"synced":20}`, HTTP 200)를 확인했습니다.
- `contract_risk_patterns` 테이블은 마이그레이션 파일이 기술하는 스키마와 실제 운영 DB 스키마가 다를 가능성이 있는 상태로 남아 있습니다(5장 참고). 새 컬럼명을 쓰는 것은 애플리케이션 코드뿐이고, 마이그레이션은 정리되지 않았습니다.
- `contract_risk_patterns` GIN 인덱스(카테고리, 키워드 배열, `search_vector`)가 최초 마이그레이션에 정의되어 있지만, 현재 쿼리 코드(전체 SELECT)는 이 인덱스들을 전혀 활용하지 않는 죽은 인프라입니다.

**과거 발생했던 사고(코드/마이그레이션에 기록으로 남아있음)**
- `sync-news` cron의 호출 URL이 `analyze-contract`로 잘못 설정되어 2026-07-18~21 사이 뉴스 테이블이 갱신되지 않은 채 "성공"으로 로그에 남았던 사고.
- `hug_sync_cursor`, `contract_risk_patterns`가 한때 RLS 없이 노출되어 있던 시점이 있었음(보안 감사로 발견 후 조치).

**코드 품질 — 중복/일관성**
- Gemini 재시도(backoff) 로직이 `analyze-contract`/`analyze-chat`에 동일하게 복사돼 있습니다(공유 모듈로 추출되지 않음).
- 파일→base64 변환 함수, 패턴 점수 색상 임계값(`patternTone`), 위험도 색상 hex 값이 여러 파일에 중복 정의되어 있습니다.
- `analyses.risk_level`(영어)과 `gaslighting_checks`/`region_stats.risk_level`(한글)의 어휘가 다릅니다.

**성능/UX**
- 프론트에서 파일→base64 변환이 바이트 단위 동기 루프라 큰 파일에서는 메인 스레드가 잠깐 멈출 수 있습니다. 클라이언트 측 파일 크기/타입 검증이 전혀 없습니다.
- 마이페이지 "전체보기"와 홈 화면 뉴스 "더보기"는 실제 페이지네이션이 아니라, 처음에 가져온 목록을 자르고 펼치는 방식입니다.
- 지도의 지역 검색은 순위 없는 단순 부분일치라 여러 지역이 매칭될 수 있는 검색어에서는 사용자가 원하는 결과가 아닐 수 있습니다.
- `Profile.tsx`에서 옛 분석을 다시 열면 HUG 명단 대조 배너가 사라집니다(이력 조회 쿼리가 해당 필드를 아예 선택하지 않기 때문).

**접근 제어**
- `/psych-guard/:id` 조회는 클라이언트 쿼리에 `user_id` 필터가 없어 RLS에만 의존합니다. 확인 결과 RLS 정책 자체는 올바르게 걸려 있어 실제 취약점은 아니지만, 다른 조회 함수 대비 방어 계층이 하나 적습니다.
- `Home`/`Cure`/`SignalMap`/`Analysis`는 비로그인 상태에서도 렌더링되며, 로그인 여부를 확인해 리다이렉트하는 화면은 `Profile.tsx`가 유일합니다.
