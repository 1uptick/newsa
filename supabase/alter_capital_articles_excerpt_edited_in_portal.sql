-- Run once in Supabase SQL Editor if `capital_articles` exists without excerpt_edited_in_portal.

alter table public.capital_articles
  add column if not exists excerpt_edited_in_portal boolean not null default false;

comment on column public.capital_articles.excerpt_edited_in_portal is
  'When true, Airtable sync must not overwrite excerpt (portal-edited description).';
