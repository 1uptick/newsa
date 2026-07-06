-- ATFX Markets Quick Analysis history (run in Supabase SQL Editor)

create table if not exists public.atfx_quick_analyses (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  symbol text not null,
  display_name text not null default '',
  report text not null default '',
  change_pct double precision,
  last_close double precision,
  chart_image_url text,
  chart_caption text,
  chart_interval text,
  lookback text not null default '24h',
  created_at timestamptz not null default now()
);

create index if not exists idx_atfx_quick_analyses_uid_created
  on public.atfx_quick_analyses (firebase_uid, created_at desc);
