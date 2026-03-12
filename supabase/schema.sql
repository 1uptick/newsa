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

-- Tables are accessed by your server using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Add RLS and policies in Supabase Dashboard if you need client-side access.
