-- Add lookback window to Quick Analysis history (run after atfx_quick_analyses.sql)

alter table public.atfx_quick_analyses
  add column if not exists lookback text not null default '24h';
