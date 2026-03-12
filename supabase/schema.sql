-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) to create the table
-- for editable Capital/SEO articles.
--
-- Then in Dashboard → Storage: create a bucket named exactly "article-images",
-- set it to Public so uploaded image URLs work in the article content.

create table if not exists public.capital_articles (
  airtable_id text primary key,
  title text,
  excerpt text,
  created_date text,
  content text not null default '',
  updated_at timestamptz default now()
);

-- Table is accessed by your server using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Add RLS and policies in Supabase Dashboard if you need client-side access.
