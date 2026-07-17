-- Powers the "안심 시그널 맵" (safety signal map): one row per Seoul 자치구 (district),
-- refreshed daily by the `fetch-market-data` and `fetch-region-buzz` Edge Functions.
create table if not exists public.region_stats (
  id uuid primary key default gen_random_uuid(),
  region_code text not null unique, -- 법정동코드 앞 5자리 (국토부 실거래가 API의 LAWD_CD)
  region_name text not null,
  avg_sale_price numeric, -- 평균 매매가, 만원 단위
  avg_jeonse_price numeric, -- 평균 전세가, 만원 단위
  jeonse_ratio numeric, -- 전세가/매매가 * 100
  news_mentions int,
  risk_score numeric,
  risk_level text check (risk_level in ('위험', '주의', '안전')),
  updated_at timestamptz not null default now()
);

alter table public.region_stats enable row level security;

-- Anyone (including anon) can read region stats for the map. Writes only happen via the
-- Edge Functions' service_role client, which bypasses RLS entirely, so no insert/update
-- policy is defined (same pattern as the `news` table).
create policy "Region stats are publicly readable"
  on public.region_stats
  for select
  to anon, authenticated
  using (true);

-- Seed all 25 Seoul districts up front so the map always has a polygon for every district,
-- even before the first daily sync has run.
insert into public.region_stats (region_code, region_name) values
  ('11110', '종로구'),
  ('11140', '중구'),
  ('11170', '용산구'),
  ('11200', '성동구'),
  ('11215', '광진구'),
  ('11230', '동대문구'),
  ('11260', '중랑구'),
  ('11290', '성북구'),
  ('11305', '강북구'),
  ('11320', '도봉구'),
  ('11350', '노원구'),
  ('11380', '은평구'),
  ('11410', '서대문구'),
  ('11440', '마포구'),
  ('11470', '양천구'),
  ('11500', '강서구'),
  ('11530', '구로구'),
  ('11545', '금천구'),
  ('11560', '영등포구'),
  ('11590', '동작구'),
  ('11620', '관악구'),
  ('11650', '서초구'),
  ('11680', '강남구'),
  ('11710', '송파구'),
  ('11740', '강동구')
on conflict (region_code) do nothing;
