-- Add Thai / Vietnamese translation columns for Quick Analysis history

alter table public.atfx_quick_analyses
  add column if not exists report_th text,
  add column if not exists report_vi text;
