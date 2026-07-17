-- fetch-market-data가 아파트에 더해 연립다세대(빌라) 매매/전월세까지 조회하면서 지역당 실측
-- 처리 시간이 ~0.3초 → ~2.7초로 늘었다. BATCH_SIZE를 50 → 30으로 낮췄으므로(regionBatch.ts),
-- 252개를 하루 안에 다 순회하려면 배치 수도 6 → 9로 늘어나야 한다(ceil(252/30)=9).
-- 기존 03:00 KST(18:00 UTC) 시작 시각은 유지하고, 20분 간격 창을 2시간(18-19시)에서
-- 3시간(18-20시)으로 넓혀 9번 호출되도록 한다.
select cron.unschedule('fetch-market-data-batch');
select cron.unschedule('fetch-region-buzz-batch');

select cron.schedule(
  'fetch-market-data-batch',
  '*/20 18-20 * * *', -- 18:00~20:40 UTC(= 03:00~05:40 KST), 20분 간격 9회
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/fetch-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'fetch-region-buzz-batch',
  '10-50/20 18-20 * * *', -- 대응하는 market-data 배치 10분 뒤, 9회
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/fetch-region-buzz',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
