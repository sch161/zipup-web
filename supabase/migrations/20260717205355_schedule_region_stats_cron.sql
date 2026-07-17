-- Schedules the daily 03:00 KST (= 18:00 UTC the previous day) sync of `region_stats`:
-- fetch-market-data first, then fetch-region-buzz 10 minutes later so both have finished
-- writing before anyone checks the map. Requires pg_cron + pg_net + supabase_vault, which
-- are already enabled by default on this project.
--
-- The `x-cron-secret` header value is pulled from Vault instead of being hardcoded here, so
-- the secret itself never ends up in this (git-committed) migration file. Before this
-- migration is applied, run once (via `supabase db query --linked`, NOT saved to any file):
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');

select cron.schedule(
  'fetch-market-data-daily',
  '0 18 * * *',
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
  'fetch-region-buzz-daily',
  '10 18 * * *',
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
