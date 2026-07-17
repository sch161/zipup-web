-- 지역이 25(서울)→252(전국)로 늘어나면서 하루 한 번의 호출로 ALL_REGIONS를 전부 순회하면
-- Edge Function 실행 시간 제한(150초)을 넘길 수 있다 (지역당 API 응답 시간 감안 시 최악의
-- 경우 fetch-market-data 약 550초, fetch-region-buzz 약 140초로 추산됨). 반면 하루 총 호출
-- 수(fetch-market-data 504건, fetch-region-buzz 252건)는 국토부/네이버 API 일일 한도 대비
-- 각각 5%, 1% 수준이라 여러 날에 걸쳐 나눌 필요는 없다.
--
-- 그래서 하루 한 번 대신 20분 간격으로 6번(=252 ÷ BATCH_SIZE(50), regionBatch.ts) 호출해
-- region_sync_cursor에 저장된 위치부터 50개씩만 처리하도록 스케줄을 바꾼다. 기존 03:00 KST
-- (18:00 UTC) 시작 시각은 유지하고, 그 이후 20분 간격으로 두 시간에 걸쳐 전체를 순회한다.
select cron.unschedule('fetch-market-data-daily');
select cron.unschedule('fetch-region-buzz-daily');

select cron.schedule(
  'fetch-market-data-batch',
  '*/20 18-19 * * *', -- 18:00, 18:20, 18:40, 19:00, 19:20, 19:40 UTC (= 03:00~04:40 KST) — 6회
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/fetch-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fetch-region-buzz-batch',
  '10-50/20 18-19 * * *', -- 18:10, 18:30, 18:50, 19:10, 19:30, 19:50 UTC — 대응하는 market-data 배치 10분 뒤
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/fetch-region-buzz',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
