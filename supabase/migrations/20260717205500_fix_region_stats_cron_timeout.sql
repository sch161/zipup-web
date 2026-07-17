-- 20260717205402_batch_region_stats_cron.sql에서 만든 배치 cron job들이 net.http_post의
-- timeout_milliseconds 기본값(5000ms = 5초)을 그대로 쓰고 있었다. 실제로 수동 트리거해서
-- 확인해보니 배치(50개 지역) 처리에 15~35초가 걸려 매번 5초 만에 pg_net이 응답을 포기하고
-- net._http_response.timed_out = true를 남겼다 — Edge Function 자체는 서버에서 끝까지
-- 실행되어 region_stats에는 정상적으로 반영되지만, 이 상태로는 net._http_response로
-- 실제 실패와 "그냥 느린 정상 처리"를 구분할 수 없다. timeout_milliseconds를 120초로 늘려
-- 정상적으로 완료 응답을 받도록 고친다.
select cron.unschedule('fetch-market-data-batch');
select cron.unschedule('fetch-region-buzz-batch');

select cron.schedule(
  'fetch-market-data-batch',
  '*/20 18-19 * * *',
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
  '10-50/20 18-19 * * *',
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
