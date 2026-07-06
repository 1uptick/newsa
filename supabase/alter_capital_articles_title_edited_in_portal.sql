-- Run once in Supabase SQL Editor if `capital_articles` exists without title_edited_in_portal.
-- If you still see "schema cache" errors from the API, wait ~1–2 minutes for PostgREST to pick up
-- the new column, then retry (the app also falls back when this error is detected).
alter table public.capital_articles
  add column if not exists title_edited_in_portal boolean not null default false;

comment on column public.capital_articles.title_edited_in_portal is
  'When true, portal title overrides Airtable; sync and content fetch must not replace title.';
