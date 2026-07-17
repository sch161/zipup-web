-- 전세사기 위험은 시세 파악이 어려운 연립다세대(빌라)에서 훨씬 크게 발생하는데, 지금까지
-- fetch-market-data는 아파트 실거래가만 집계했다. 연립다세대 매매/전월세를 별도 컬럼으로 추가
-- 집계하고, risk_score 계산 시 아파트보다 빌라 쪽 전세가율에 더 큰 가중치를 준다
-- (_shared/riskScore.ts의 effectiveJeonseRatio 참고). avg_sale_price/avg_jeonse_price/
-- jeonse_ratio는 기존과 동일하게 "아파트" 기준을 유지해 화면 표시 의미가 바뀌지 않는다.
alter table public.region_stats
  add column villa_avg_sale_price numeric,
  add column villa_avg_jeonse_price numeric,
  add column villa_jeonse_ratio numeric;
