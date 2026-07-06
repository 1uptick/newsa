-- Add Traditional / Simplified Chinese report columns for Quick Analysis history

alter table public.atfx_quick_analyses
  add column if not exists report_tc text,
  add column if not exists report_sc text,
  add column if not exists report_th text,
  add column if not exists report_vi text;
