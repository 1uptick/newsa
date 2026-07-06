-- Brokerage token billing (ATFX and future CFD brokerages).
-- Run in Supabase SQL Editor after schema.sql.

create table if not exists public.brokerage_token_config (
  brokerage_id text primary key,
  display_name text not null,
  monthly_token_limit bigint not null default 500000 check (monthly_token_limit >= 0),
  billing_cycle_start_date date not null default (date_trunc('month', now())::date),
  multipliers jsonb not null default '{
    "quick_analysis": 1.8,
    "research_report": 1.8,
    "translation": 1.0,
    "article_generate": 1.8
  }'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.brokerage_token_usage_periods (
  brokerage_id text not null references public.brokerage_token_config (brokerage_id) on delete cascade,
  period_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  cost_usd numeric(14, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brokerage_id, period_id)
);

create index if not exists idx_brokerage_token_usage_periods_brokerage
  on public.brokerage_token_usage_periods (brokerage_id, period_start desc);

create table if not exists public.brokerage_token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  brokerage_id text not null references public.brokerage_token_config (brokerage_id) on delete cascade,
  charge_id text not null,
  firebase_uid text,
  source text not null,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(14, 6) not null default 0,
  billed_tokens bigint not null default 0 check (billed_tokens >= 0),
  symbol text,
  reference_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (brokerage_id, charge_id)
);

create index if not exists idx_brokerage_token_usage_logs_brokerage_created
  on public.brokerage_token_usage_logs (brokerage_id, created_at desc);

create index if not exists idx_brokerage_token_usage_logs_source
  on public.brokerage_token_usage_logs (brokerage_id, source, created_at desc);

insert into public.brokerage_token_config (brokerage_id, display_name, monthly_token_limit, billing_cycle_start_date)
values ('atfx', 'ATFX', 500000, date_trunc('month', now())::date)
on conflict (brokerage_id) do nothing;
