-- Stores each 계약서 스캔 (contract risk analysis) produced by the
-- `analyze-contract` Edge Function, so users can review past analyses.
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  address text,
  deposit text,
  building_type text,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  risk_level text not null check (risk_level in ('danger', 'warning', 'success')),
  categories jsonb not null default '[]'::jsonb,
  detected_clauses jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  ai_comment text,
  created_at timestamptz not null default now()
);

create index if not exists analyses_user_id_idx on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

-- Users can only read their own analysis history. Writes only happen via the
-- Edge Function's service_role client, which bypasses RLS entirely, so no
-- insert/update policy is defined (same pattern as the `gaslighting_checks` table).
create policy "Users can view their own analyses"
  on public.analyses
  for select
  to authenticated
  using (auth.uid() = user_id);
