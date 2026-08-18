-- sync-news 함수는 config.toml에 verify_jwt 오버라이드가 없어 기본값(true, 인증 필요)으로
-- 배포되어 있었는데, 이 cron 작업은 Content-Type 헤더만 보내고 Authorization/apikey는
-- 전혀 보내지 않았다. 그 결과 2026-07-20 16:25 KST 마지막 정상 실행 이후 매 6시간마다
-- "succeeded"로 기록되긴 했지만(= net.http_post가 요청을 큐에 넣는 SQL 자체는 성공),
-- 실제 HTTP 응답은 매번 401 Unauthorized(UNAUTHORIZED_NO_AUTH_HEADER)였다
-- (net._http_response에서 확인). cron.job_run_details만 보면 정상 작동하는 것처럼
-- 보이는 이유가 바로 이것 — 20260717205500_fix_region_stats_cron_timeout.sql에서 지적된
-- "job_run_details로는 진짜 실패와 느린 성공을 구분할 수 없다"는 문제와 같은 종류의 함정이다.
--
-- fetch-market-data-batch / fetch-region-buzz-batch와 동일하게, sync-news도 이제
-- verify_jwt = false로 배포하고(config.toml) 함수 내부에서 x-cron-secret을 자체 검증한다.
-- 이 마이그레이션은 cron 작업이 그 헤더를 실제로 보내도록 고친다.
select cron.unschedule('sync-news');

select cron.schedule(
  'sync-news',
  '0 */6 * * *', -- 6시간마다 (스케줄은 그대로, 인증 헤더만 추가)
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/sync-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
