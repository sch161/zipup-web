-- News articles synced from the Naver News Search API by the `sync-news` Edge Function.
-- Schema matches the `news` table already provisioned on the project (title/url/media/published_at).
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text,
  url text,
  media text,
  published_at timestamp,
  created_at timestamp default now()
);

create index if not exists news_published_at_idx on public.news (published_at desc);

alter table public.news enable row level security;

-- Anyone (including anon) can read news. Writes only happen via the Edge Function's
-- service_role client, which bypasses RLS entirely, so no insert/update policy is defined.
create policy "News is publicly readable"
  on public.news
  for select
  to anon, authenticated
  using (true);
