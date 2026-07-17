-- Stores each 심리 가드 (gaslighting detection) chat analysis produced by the
-- `analyze-chat` Edge Function, so users can review past risk assessments.
create table if not exists public.gaslighting_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  input_text text not null,
  risk_level text not null check (risk_level in ('위험', '주의', '안전')),
  confidence integer not null check (confidence >= 0 and confidence <= 100),
  patterns jsonb not null default '[]'::jsonb,
  suggested_response text,
  created_at timestamptz not null default now()
);

create index if not exists gaslighting_checks_user_id_idx on public.gaslighting_checks (user_id, created_at desc);

alter table public.gaslighting_checks enable row level security;

-- Users can only read their own analysis history. Writes only happen via the
-- Edge Function's service_role client, which bypasses RLS entirely, so no
-- insert/update policy is defined (same pattern as the `news` table).
create policy "Users can view their own gaslighting checks"
  on public.gaslighting_checks
  for select
  to authenticated
  using (auth.uid() = user_id);
