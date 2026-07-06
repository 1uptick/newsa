-- ATFX Research Report SEO excerpt + thumbnail — run once in Supabase SQL Editor

alter table public.atfx_research_reports
  add column if not exists seo_excerpt text,
  add column if not exists thumbnail_url text;
