# 🏠 ZIPUP

**AI로 부동산 계약의 위험을 미리 알려주는, 상경 청년을 위한 안심 주거 서비스**

지방에서 서울로 상경해 처음 집을 구하는 청소년·사회초년생은 부동산 정보에는 쉽게 접근할 수 있지만, 전문적인 법률 지식이 없어 계약서의 위험 요소를 스스로 판단하기 어렵습니다. ZIPUP은 AI가 계약서와 대화 내용을 분석해 위험을 미리 알려주고, 지역별 위험도를 지도로 시각화해 안전한 주거 결정을 돕습니다.

---

## 📌 주요 기능

### 1. AI 계약서 안전 스캔
계약서 이미지·PDF를 업로드하면 Gemini API가 내용을 직접 분석합니다.
- 보증금, 특약사항 등 핵심 정보 자동 추출 (별도 OCR 없이 멀티모달 모델이 직접 인식)
- 항목별 위험도 분석 (권리관계·근저당 / 특약사항 / 전세가율 / 건물상태)
- 주변 시세 대비 전세가율 계산 및 위험 여부 표시
- 위험/주의/안전 태그가 붙은 조항별 상세 설명
- AI 추천 조치(체크리스트) 및 종합 코멘트 제공

### 2. 심리 가드 (부동산 가스라이팅 탐지 AI)
중개인·집주인에게 받은 문자·카톡 내용(텍스트 또는 캡처 이미지)을 분석합니다.
- 재촉, 허위정보 주입, 신뢰 유도 등 패턴별 확신도(%) 표시
- 대화 위험도 게이지 및 종합 신뢰도 표시
- 사용자가 바로 복사해서 쓸 수 있는 AI 추천 대응 멘트 제공

### 3. 안심 시그널 맵
**전국** 시/군/구(252개 지역) 단위의 주거 위험도를 지도에서 확인할 수 있습니다.
- 국토교통부 실거래가(**아파트 + 연립다세대**) 기반 전세가율로 정량 위험도 산출 — 실제 전세사기 위험이 큰 연립다세대(빌라)에 더 높은 가중치 적용
- 네이버 뉴스 "{지역} 전세사기" 언급 빈도를 보조 지표로 결합 (공식 통계 아닌 참고 지표임을 화면에 명시)
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

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Vite, React, TypeScript, Tailwind CSS |
| 백엔드 | Supabase Edge Functions (Deno) |
| 데이터베이스 | Supabase (PostgreSQL), Row Level Security |
| 인증 | Supabase Auth |
| 스케줄링 | Supabase pg_cron, pg_net |
| AI | Google Gemini API (`gemini-2.5-flash`, 멀티모달) |
| 지도 | Kakao Maps JavaScript SDK |

---

## 🔌 외부 API

| API | 용도 | 발급처 |
|---|---|---|
| **Google Gemini API** | 계약서 이미지/PDF 분석, 위험 조항 판별, 가스라이팅 대화 패턴 분석 | [Google AI Studio](https://aistudio.google.com) |
| **네이버 검색 API (뉴스)** | 최근 전세사기 뉴스 조회, 지역별 "전세사기" 언급 빈도 집계 | [네이버 개발자센터](https://developers.naver.com) |
| **국토교통부 실거래가 API** | 아파트·연립다세대 매매/전월세 실거래가 → 지역별 전세가율 계산 | [공공데이터포털](https://www.data.go.kr) |
| **카카오맵 API** | 안심 시그널 맵 지도 렌더링 및 지역 폴리곤 시각화 | [Kakao Developers](https://developers.kakao.com) |
| **Google / Kakao OAuth** | 소셜 로그인 | [Google Cloud Console](https://console.cloud.google.com) / [Kakao Developers](https://developers.kakao.com) |

> 국토교통부 API는 아파트/연립다세대 각각 매매·전월세 자료를 별도로 신청해야 합니다 (총 4개).
> 카카오 로그인은 일반 개발자 계정에서는 이메일 동의항목(`account_email`)이 제한되어 있어, **비즈 앱 전환** 후 이메일 필수 동의로 설정해야 정상 동작합니다.

---

## 🗄 데이터베이스 스키마 (요약)

| 테이블 | 설명 |
|---|---|
| `analyses` | 계약서 스캔 분석 결과 (위험도, 조항, 추천 조치 등) |
| `gaslighting_checks` | 심리 가드 대화 분석 결과 (패턴, 신뢰도, 추천 응답) |
| `news` | 전세사기 관련 뉴스 캐시 |
| `region_stats` | 전국 시/군/구별 전세가율, 뉴스 언급 건수, 위험도 점수 |
| `region_sync_cursor` | 전국 데이터 배치 처리 진행 상태 (Edge Function 실행 시간 제한 대응) |

---

## ⚙️ Edge Functions

| 함수명 | 역할 | 실행 방식 |
|---|---|---|
| `analyze-contract` | 계약서 이미지/PDF를 Gemini API로 분석 | 사용자 요청 시 |
| `analyze-chat` | 가스라이팅 대화 텍스트/이미지 분석 | 사용자 요청 시 |
| `fetch-market-data` | 국토부 실거래가 조회 → 전세가율 계산 | pg_cron 배치 (자동) |
| `fetch-region-buzz` | 네이버 뉴스 지역별 언급 건수 집계 | pg_cron 배치 (자동) |

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

> ⚠️ Gemini, 네이버, 국토부 키는 절대 프론트엔드(`VITE_` 접두사)에 넣지 않고 Supabase Secrets로만 관리합니다. 카카오맵 키는 브라우저 노출을 전제로 설계된 키이므로 프론트엔드 환경변수로 관리합니다.

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

| 이름 | 역할 |
|---|---|
| 김희성 | 백엔드 |
| 신수아 | 백엔드 |
| 이서영 | 프론트엔드 |
| 조성찬 | 프론트엔드 |

미림마이스터고 지능형소프트웨어과

---

## 📄 라이선스

이 프로젝트는 교육 목적의 팀 프로젝트로 제작되었습니다.
