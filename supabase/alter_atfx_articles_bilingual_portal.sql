-- ATFX portal: store Traditional Chinese body edits separately from English (existing `content` + `content_edited_in_portal`).
-- Run in Supabase SQL Editor if your project was created before this change.

alter table public.atfx_articles add column if not exists content_tc text;
alter table public.atfx_articles add column if not exists content_tc_edited_in_portal boolean not null default false;
alter table public.atfx_articles add column if not exists title_en text;
