-- Run once in Supabase SQL Editor if `capital_articles` exists without notify_sent_at.
alter table public.capital_articles
  add column if not exists notify_sent_at timestamptz;

comment on column public.capital_articles.notify_sent_at is
  'When Capital Articles notify emails were last sent; dashboard badge hides after 72h.';
