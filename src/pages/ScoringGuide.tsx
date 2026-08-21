import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import BrokenText from '../components/ui/BrokenText'
import Card from '../components/ui/Card'
import TopNav from '../components/TopNav'

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로가기"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-gray shadow-card"
    >
      ←
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-text-dark">{title}</h2>
      <div className="mt-1.5 text-xs leading-relaxed text-text-gray">{children}</div>
    </div>
  )
}

interface WeightRow {
  name: string
  weight: string
  reason: string
}

// supabase/functions/_shared/contractScore.ts의 CATEGORY_WEIGHTS와 같은 값을 유지해야 한다.
const CONTRACT_WEIGHTS: WeightRow[] = [
  { name: '권리관계', weight: '35%', reason: '근저당·신탁 같은 선순위 권리는 보증금을 직접 못 받게 만드는 가장 치명적인 요인이에요.' },
  { name: '특약사항', weight: '30%', reason: '세입자에게 불리한 독소조항은 문제가 생겼을 때 대응할 방법을 막아버려요.' },
  { name: '전세가율', weight: '25%', reason: '보증금이 집값에 가까울수록 집이 경매로 넘어갔을 때 돌려받기 어려워요.' },
  { name: '건물상태', weight: '10%', reason: '위반건축물 등은 대출·보증보험 가입에 영향을 주지만, 보증금 반환에 미치는 영향은 상대적으로 작아요.' },
]

// supabase/functions/_shared/riskScore.ts의 calculateRisk와 같은 값을 유지해야 한다.
const MAP_WEIGHTS: WeightRow[] = [
  { name: '전세가율', weight: '50%', reason: '국토교통부 실거래가로 계산한 정량 지표라 가장 신뢰도가 높아요.' },
  { name: 'HUG 상습 채무불이행자 밀도', weight: '30%', reason: '그 지역에서 실제로 보증금 사고가 얼마나 일어났는지를 보여줘요.' },
  { name: '뉴스 언급 빈도', weight: '20%', reason: '공식 통계가 아닌 참고 지표라 비중을 가장 낮게 뒀어요.' },
]

function WeightTable({ rows }: { rows: WeightRow[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.name} className="rounded-2xl bg-subtle p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-text-dark">{row.name}</span>
            <span className="shrink-0 text-xs font-extrabold text-primary">{row.weight}</span>
          </div>
          <p className="mt-0.5 text-pretty text-[11px] leading-relaxed text-text-gray">{row.reason}</p>
        </li>
      ))}
    </ul>
  )
}

export default function ScoringGuide() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto w-full max-w-app flex-1 px-5 py-6 lg:max-w-[720px] lg:px-6 lg:py-10">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-primary lg:text-2xl">위험도 산정 기준</h1>
        </div>

        <Card className="mt-4 border-primary/30 bg-primary-bg/40 lg:mt-6">
          <p className="text-xs font-bold text-text-dark">📊 점수가 높을수록 위험합니다</p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-gray">
            <BrokenText text="계약서 분석과 안심 시그널 맵 모두 0~100점으로 표시되며, 점수가 높을수록 위험하다는 뜻이에요. 두 기능이 같은 방향을 쓰기 때문에 함께 놓고 비교해도 헷갈리지 않아요." />
          </p>
        </Card>

        <div className="mt-4 flex flex-col gap-5 lg:mt-6">
          <Section title="1. 계약서 종합 위험도는 어떻게 계산되나요?">
            <BrokenText text="AI가 매긴 점수를 그대로 쓰지 않고, 아래 4개 항목의 점수에 각각 정해진 비중을 곱해 더하는 방식(가중평균)으로 계산해요. 같은 계약서를 다시 분석해도 같은 결과가 나오도록 계산식을 코드로 고정해 두었어요." />
            <WeightTable rows={CONTRACT_WEIGHTS} />
            <p className="mt-2">
              <BrokenText text="비중은 전세사기 관점에서 정했어요. 보증금을 못 돌려받는 사고는 대부분 권리관계와 특약사항에서 시작되기 때문에 이 둘을 가장 높게 잡았습니다." />
            </p>
          </Section>

          <Section title="2. 등급은 어떻게 나뉘나요?">
            <ul className="flex flex-col gap-1">
              <li>· <span className="font-bold text-danger">위험</span> — 61점 이상</li>
              <li>· <span className="font-bold text-warning">주의</span> — 31점 ~ 60점</li>
              <li>· <span className="font-bold text-success">안전</span> — 30점 이하</li>
            </ul>
            <p className="mt-2">
              <BrokenText text="다만 대항력 악용, 신탁 부동산, 바지사장 넘기기처럼 실제 피해 사례와 일치하는 치명적인 패턴이 발견되면, 계산 결과가 낮게 나왔더라도 최소 61점(위험)으로 올려서 표시해요. 계산상 안전해 보여도 실제로는 위험한 신호가 확인된 상황이기 때문이에요." />
            </p>
          </Section>

          <Section title="3. 전세가율은 무엇과 비교해 계산하나요?">
            <BrokenText text="계약서에 적힌 매물 주소로 지역(시·군·구)을 찾은 뒤, 그 지역의 국토교통부 실거래가 평균 매매가와 보증금을 비교해 계산해요. 건물 유형이 아파트가 아니면 연립다세대(빌라) 시세를 기준으로 삼습니다 — 전세사기는 시세 파악이 어려운 빌라에서 훨씬 많이 발생하기 때문이에요." />
            <ul className="mt-2 flex flex-col gap-1">
              <li>· 전세가율 80% 이하 — 비교적 안전한 구간</li>
              <li>· 80% ~ 100% — 주의가 필요한 구간</li>
              <li>· 100% 초과 — 보증금이 집값보다 큰 이른바 &lsquo;깡통전세&rsquo; 위험 구간</li>
            </ul>
            <p className="mt-2">
              <BrokenText text="주소가 지역과 매칭되지 않거나 그 지역의 최근 실거래가 데이터가 없으면 임의로 점수를 매기지 않고 '데이터 없음'으로 표시해요. 이때는 이 항목을 종합 점수 계산에서 아예 빼고, 남은 항목들끼리 비중을 다시 나눠 계산합니다." />
            </p>
          </Section>

          <Section title="4. 안심 시그널 맵의 지역 위험도는요?">
            <BrokenText text="계약서 분석과는 별개로, 지역 단위 위험도는 아래 3가지를 가중 결합해 계산해요." />
            <WeightTable rows={MAP_WEIGHTS} />
            <p className="mt-2">
              <BrokenText text="지역 위험도 등급은 70점 이상이면 위험, 40점 이상이면 주의, 그 아래는 안전이에요. 전세가율은 아파트와 빌라를 각각 집계한 뒤 빌라 쪽에 70%, 아파트 쪽에 30% 비중을 둬서 하나로 합칩니다." />
            </p>
          </Section>

          <Section title="5. 참고해주세요">
            <ul className="flex flex-col gap-1">
              <li>
                <BrokenText text="· 이 점수는 계약 여부를 대신 판단해주는 것이 아니라, 무엇을 더 확인해야 하는지 알려주는 참고 지표예요." />
              </li>
              <li>
                <BrokenText text="· 실거래가·HUG 명단 등 원본 데이터가 갱신되면 같은 지역이라도 점수가 달라질 수 있어요." />
              </li>
              <li>
                <BrokenText text="· 2026년 8월 이전에 분석한 이력은 점수가 낮을수록 위험한 예전 기준으로 계산돼 있어요. 해당 결과 화면에는 그 사실이 함께 표시됩니다." />
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
