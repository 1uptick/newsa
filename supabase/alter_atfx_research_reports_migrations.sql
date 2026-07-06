-- ATFX Research Report — run once in Supabase SQL Editor
-- Adds pipeline metadata + multi-language HTML storage

alter table public.atfx_research_reports
  add column if not exists output_options jsonb,
  add column if not exists research_plan jsonb,
  add column if not exists research_brief jsonb,
  add column if not exists report_html_i18n jsonb,
  add column if not exists seo_excerpt text,
  add column if not exists thumbnail_url text;
