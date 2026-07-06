-- Run once in Supabase SQL Editor: tracks which Ready to Post articles each user has opened (preview modal).
create table if not exists public.capital_ready_post_opened (
  firebase_uid text not null,
  airtable_id text not null,
  opened_at timestamptz not null default now(),
  primary key (firebase_uid, airtable_id)
);

create index if not exists idx_capital_ready_post_opened_uid on public.capital_ready_post_opened (firebase_uid);
