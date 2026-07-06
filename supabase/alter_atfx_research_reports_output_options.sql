-- ATFX Research Report: persist user output options and pipeline artifacts

alter table public.atfx_research_reports
  add column if not exists output_options jsonb,
  add column if not exists research_plan jsonb,
  add column if not exists research_brief jsonb;
