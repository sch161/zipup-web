-- "sync-news" pg_cron 작업이 마이그레이션을 거치지 않고 Supabase Studio에서 직접 등록되면서
-- 호출 URL이 sync-news가 아니라 analyze-contract로 잘못 설정되어 있었다. 이름 그대로
-- "sync-news"라는 job이 2026-07-18부터 6시간마다 꾸준히 "succeeded"로 기록됐지만, 실제로는
-- 매번 analyze-contract를 빈 요청(주소/문서 없음)으로 호출해 400을 받고 끝나는 상태였다.
-- 그 사이 뉴스 테이블(public.news)은 2026-07-16 발행 기사 이후로 전혀 갱신되지 않았다.
--
-- sync-news 함수는 CRON_SECRET 인증을 요구하지 않으므로(요청 바디도 읽지 않음) 다른 두
-- 배치 cron과 달리 x-cron-secret 헤더는 필요 없다.
select cron.unschedule('sync-news');

select cron.schedule(
  'sync-news',
  '0 */6 * * *', -- 6시간마다 (기존 스케줄 유지, URL만 수정)
  $$
  select net.http_post(
    url := 'https://yksrvkofbxordjagazzi.supabase.co/functions/v1/sync-news',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
