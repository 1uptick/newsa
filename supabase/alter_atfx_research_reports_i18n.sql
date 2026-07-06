-- Multi-language report HTML (EN written first; TC/SC/TH/VI translated)

alter table public.atfx_research_reports
  add column if not exists report_html_i18n jsonb;
