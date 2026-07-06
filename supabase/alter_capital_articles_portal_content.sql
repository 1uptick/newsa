-- Run once in Supabase SQL Editor if `capital_articles` already exists without this column.
alter table public.capital_articles
  add column if not exists content_edited_in_portal boolean not null default false;
