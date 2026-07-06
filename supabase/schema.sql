-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) to create all tables.
--
-- Then in Dashboard → Storage: create a bucket named exactly "article-images",
-- set it to Public so uploaded image URLs work in the article content.

-- Capital/SEO articles (existing)
create table if not exists public.capital_articles (
  airtable_id text primary key,
  title text,
  excerpt text,
  created_date text,
  content text not null default '',
  -- When true, Airtable sync must not overwrite content (e.g. inline images added in the portal).
  content_edited_in_portal boolean not null default false,
  -- When true, Airtable sync / content fetch must not overwrite title (portal-edited).
  title_edited_in_portal boolean not null default false,
  -- When true, Airtable sync must not overwrite excerpt (portal-edited description).
  excerpt_edited_in_portal boolean not null default false,
  -- Last time "notify" emails were sent from the Capital Articles page (Ready to Post badge TTL).
  notify_sent_at timestamptz,
  updated_at timestamptz default now()
);

-- ATFX portal articles (same shape as capital_articles; server uses AIRTABLE_ATFX_TABLE_ID)
create table if not exists public.atfx_articles (
  airtable_id text primary key,
  title text,
  title_en text,
  excerpt text,
  created_date text,
  content text not null default '',
  content_tc text,
  comments text,
  content_edited_in_portal boolean not null default false,
  content_tc_edited_in_portal boolean not null default false,
  updated_at timestamptz default now()
);

-- Groups (replaces SQLite groups)
create table if not exists public.groups (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz default now()
);

-- User roles (replaces SQLite user_roles)
create table if not exists public.user_roles (
  firebase_uid text primary key,
  role text not null check (role in ('admin', 'client')),
  group_id bigint references public.groups(id),
  email text,
  created_at timestamptz default now()
);

create index if not exists idx_user_roles_group_id on public.user_roles(group_id);
create index if not exists idx_user_roles_created_at on public.user_roles(created_at desc);

-- Optional: seed user group for 1uptick (idempotent). Admins can also add via Admin Panel → Add new group.
insert into public.groups (name) values ('1uptick') on conflict (name) do nothing;
insert into public.groups (name) values ('atfx') on conflict (name) do nothing;

-- Invitations (replaces SQLite invitations)
create table if not exists public.invitations (
  id bigserial primary key,
  code text unique,
  role text not null default 'client' check (role in ('admin', 'client')),
  used integer not null default 0,
  email text,
  group_id bigint references public.groups(id),
  created_at timestamptz default now()
);

create index if not exists idx_invitations_code_used on public.invitations(code, used);
create index if not exists idx_invitations_created_at on public.invitations(created_at desc);

-- Password reset tokens (replaces SQLite password_reset_tokens)
create table if not exists public.password_reset_tokens (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_password_reset_expires on public.password_reset_tokens(expires_at);

-- Capital dashboard: per-user Ready to Post preview opens (for "New" tag)
create table if not exists public.capital_ready_post_opened (
  firebase_uid text not null,
  airtable_id text not null,
  opened_at timestamptz not null default now(),
  primary key (firebase_uid, airtable_id)
);

create index if not exists idx_capital_ready_post_opened_uid on public.capital_ready_post_opened (firebase_uid);

-- ATFX Research Report chat sessions
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

-- Brokerage token billing (ATFX + future CFD brokerages). See supabase/brokerage_token_migrations.sql
-- Tables: brokerage_token_config, brokerage_token_usage_periods, brokerage_token_usage_logs

-- Tables are accessed by your server using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- To fix "RLS Disabled in Public" in Supabase Security: run enable_rls.sql in SQL Editor.
