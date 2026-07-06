-- ATFX Research Report chat sessions (run in Supabase SQL Editor)

create table if not exists public.atfx_research_reports (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  title text not null default 'Untitled report',
  report_html text not null default '',
  output_options jsonb,
  research_plan jsonb,
  research_brief jsonb,
  report_html_i18n jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_atfx_research_reports_uid_updated
  on public.atfx_research_reports (firebase_uid, updated_at desc);

create table if not exists public.atfx_research_report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.atfx_research_reports (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  tool_events jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_atfx_research_report_messages_report
  on public.atfx_research_report_messages (report_id, created_at asc);
