# 🏠 ZIPUP

**AI로 부동산 계약의 위험을 미리 알려주는, 상경 청년을 위한 안심 주거 서비스**

지방에서 서울로 상경해 처음 집을 구하는 청소년·사회초년생은 부동산 정보에는 쉽게 접근할 수 있지만, 전문적인 법률 지식이 없어 계약서의 위험 요소를 스스로 판단하기 어렵습니다. ZIPUP은 AI가 계약서와 대화 내용을 분석해 위험을 미리 알려주고, 지역별 위험도를 지도로 시각화해 안전한 주거 결정을 돕습니다.

---

## 📌 주요 기능

### 1. AI 계약서 안전 스캔

계약서 이미지·PDF를 업로드하면 Gemini API가 내용을 직접 분석합니다.

- 보증금, 특약사항 등 핵심 정보 자동 추출 (별도 OCR 없이 멀티모달 모델이 직접 인식)
- **RAG 기반 위험 패턴 대조**: 분석 전 `contract_risk_patterns`(전세사기·독소조항 실제 피해 패턴 DB)에서 관련 사례를 검색해 프롬프트에 포함, 실제 사례 기반으로 위험 조항을 판별 (AI 환각 방지)
- **HUG 상습 채무불이행자 실명단 대조**: 계약서에서 추출한 임대인 이름을 `hug_defaulters`(HUG 공개 명단, 주 1회 자동 동기화)와 trigram 유사도 검색으로 직접 대조 — 일치 시 강한 경고 배너로 표시 (AI 추정이 아닌 공식 데이터 기반 사실 확인)
- 항목별 위험도 분석 (권리관계·근저당 / 특약사항 / 전세가율 / 건물상태)
- 주변 시세 대비 전세가율 계산 및 위험 여부 표시
- 위험/주의/안전 태그가 붙은 조항별 상세 설명
- AI 추천 조치(방어 특약 문구 포함 체크리스트) 및 종합 코멘트 제공
- Gemini 서버 과부하(503)·할당량 초과(429) 시 자동 재시도(지수 백오프)로 안정성 확보

### 2. 심리 가드 (부동산 가스라이팅 탐지 AI)

중개인·집주인에게 받은 문자·카톡 내용(텍스트 또는 캡처 이미지)을 분석합니다.

- 재촉, 허위정보 주입, 신뢰 유도 등 패턴별 확신도(%) 표시
- 대화 위험도 게이지 및 종합 신뢰도 표시
- 사용자가 바로 복사해서 쓸 수 있는 AI 추천 대응 멘트 제공

### 3. 안심 시그널 맵

**전국** 시/군/구(252개 지역) 단위의 주거 위험도를 지도에서 확인할 수 있습니다.

- **위험도 공식**: 전세가율(30%, 국토교통부 실거래가 기반 정량 지표) + HUG 상습 채무불이행자 밀도(50%, 실제 사고 이력 기반) + 뉴스 언급 빈도(20%, 언론 노출 참고 지표) 가중 결합
- 아파트+연립다세대 실거래가를 모두 반영하며, 시세 파악이 어려워 실제 위험이 더 큰 연립다세대(빌라)에 더 높은 가중치 적용
- `hug_defaulters` 주소를 지역명 기준으로 매칭해 지역별 상습 채무불이행자 밀도 산출 (전국 98.9% 지역 매칭)
- 네이버 뉴스 "{지역} 전세사기" 언급 빈도는 공식 통계가 아닌 참고 지표임을 화면에 명시
- 카카오맵 위에 전국 시/군/구 경계를 위험/주의/안전 단계별 색상으로 시각화
- 20분 간격 배치로 전국 데이터를 자동 순환 갱신 (Supabase pg_cron + 커서 기반 배치 처리)

### 4. 최근 전세사기 뉴스

네이버 뉴스 검색 API로 최신 전세사기 관련 뉴스를 홈 화면에 제공합니다.

### 5. 로그인 / 회원가입

Supabase Auth 기반 이메일 인증 + **Google, Kakao 소셜 로그인**

### 6. 마이페이지

- 프로필 정보(아바타, 이름, 이메일, 안심 회원 배지)
- **내 분석 이력**: 계약서 스캔 / 심리 가드 기록을 탭으로 구분해 조회 (RLS로 본인 데이터만 노출)
- 알림 설정, 개인정보 처리방침, 고객센터, 로그아웃

---

## 🛠 기술 스택

| 영역         | 기술                                             |
| ------------ | ------------------------------------------------ |
| 프론트엔드   | Vite, React, TypeScript, Tailwind CSS            |
| 백엔드       | Supabase Edge Functions (Deno)                   |
| 데이터베이스 | Supabase (PostgreSQL), Row Level Security        |
| 인증         | Supabase Auth                                    |
| 스케줄링     | Supabase pg_cron, pg_net                         |
| AI           | Google Gemini API (`gemini-2.5-flash`, 멀티모달) |
| 지도         | Kakao Maps JavaScript SDK                        |

---

## 🔌 외부 API

| API                           | 용도                                                              | 발급처                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Google Gemini API**         | 계약서 이미지/PDF 분석, 위험 조항 판별, 가스라이팅 대화 패턴 분석 | [Google AI Studio](https://aistudio.google.com)                                                             |
| **네이버 검색 API (뉴스)**    | 최근 전세사기 뉴스 조회, 지역별 "전세사기" 언급 빈도 집계         | [네이버 개발자센터](https://developers.naver.com)                                                           |
| **국토교통부 실거래가 API**   | 아파트·연립다세대 매매/전월세 실거래가 → 지역별 전세가율 계산     | [공공데이터포털](https://www.data.go.kr)                                                                    |
| **HUG 상습채무불이행자 명단** | 계약서 임대인 실명 대조, 지역별 위험도 밀도 산출                  | [HUG 안심전세포털](https://www.khug.or.kr) (공개 명단 페이지 주기적 동기화)                                 |
| **카카오맵 API**              | 안심 시그널 맵 지도 렌더링 및 지역 폴리곤 시각화                  | [Kakao Developers](https://developers.kakao.com)                                                            |
| **Google / Kakao OAuth**      | 소셜 로그인                                                       | [Google Cloud Console](https://console.cloud.google.com) / [Kakao Developers](https://developers.kakao.com) |

> 국토교통부 API는 아파트/연립다세대 각각 매매·전월세 자료를 별도로 신청해야 합니다 (총 4개).
> HUG 명단은 별도 오픈API가 없어, `scripts/sync-hug-defaulters.mjs`가 공개 명단 페이지를 GitHub Actions로 주 1회 크롤링해 DB에 동기화합니다.
> 카카오 로그인은 일반 개발자 계정에서는 이메일 동의항목(`account_email`)이 제한되어 있어, **비즈 앱 전환** 후 이메일 필수 동의로 설정해야 정상 동작합니다.

---

## 🗄 데이터베이스 스키마 (요약)

| 테이블                   | 설명                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| `analyses`               | 계약서 스캔 분석 결과 (위험도, 조항, 추천 조치, HUG 명단 대조 결과 등)            |
| `gaslighting_checks`     | 심리 가드 대화 분석 결과 (패턴, 신뢰도, 추천 응답)                                |
| `news`                   | 전세사기 관련 뉴스 캐시                                                           |
| `region_stats`           | 전국 시/군/구별 전세가율, HUG 채무불이행자 밀도, 뉴스 언급 건수, 종합 위험도 점수 |
| `region_sync_cursor`     | 전국 데이터 배치 처리 진행 상태 (Edge Function 실행 시간 제한 대응)               |
| `contract_risk_patterns` | 전세사기·독소조항 실제 피해 패턴 DB (계약서 분석 RAG 검색 대상)                   |
| `hug_defaulters`         | HUG 상습 채무불이행자 공개 명단 로컬 캐시 (주 1회 동기화)                         |
| `hug_sync_cursor`        | HUG 명단 크롤링 진행 상태                                                         |

---

## ⚙️ Edge Functions

| 함수명              | 역할                                                                               | 실행 방식           |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| `analyze-contract`  | 계약서 이미지/PDF를 RAG(위험 패턴 DB)와 함께 Gemini API로 분석, HUG 명단 실명 대조 | 사용자 요청 시      |
| `analyze-chat`      | 가스라이팅 대화 텍스트/이미지 분석                                                 | 사용자 요청 시      |
| `fetch-market-data` | 국토부 실거래가 조회 → 전세가율 계산                                               | pg_cron 배치 (자동) |
| `fetch-region-buzz` | 네이버 뉴스 지역별 언급 건수 집계                                                  | pg_cron 배치 (자동) |

`scripts/sync-hug-defaulters.mjs`(Node 스크립트, GitHub Actions 주 1회 실행)는 Edge Function이 아니라 별도 크롤러입니다. HUG 명단 페이지가 228페이지에 달해 Edge Function 실행시간 제한을 넘기 때문에 독립 스크립트로 분리했습니다.

---

## 🔑 환경 변수

### 프론트엔드 (`.env.local`)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_KAKAO_MAP_KEY=
```

### 백엔드 (Supabase Secrets)

```
GEMINI_API_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
MOLIT_API_KEY=
```

### HUG 크롤러 (GitHub Actions Secrets, `scripts/sync-hug-defaulters.mjs`용)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

> ⚠️ Gemini, 네이버, 국토부 키는 절대 프론트엔드(`VITE_` 접두사)에 넣지 않고 Supabase Secrets로만 관리합니다. 카카오맵 키는 브라우저 노출을 전제로 설계된 키이므로 프론트엔드 환경변수로 관리합니다.
> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하는 최고 권한 키이므로, GitHub Actions Secrets에만 등록하고 절대 워크플로우 파일이나 커밋에 값 자체를 남기지 않습니다.

---

## 🚀 실행 방법

```bash
# 설치
npm install

# 개발 서버 실행
npm run dev

# Edge Function 배포 (Supabase CLI)
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy <function-name>

# DB 마이그레이션 반영
npx supabase db push
```

---

## 👥 팀 소개

| 이름   | 역할       |
| ------ | ---------- |
| 김희성 | 백엔드     |
| 신수아 | 백엔드     |
| 이서영 | 프론트엔드 |
| 조성찬 | 프론트엔드 |

미림마이스터고 지능형소프트웨어과

---

## 📄 라이선스

이 프로젝트는 교육 목적의 팀 프로젝트로 제작되었습니다.
