-- Enable Row Level Security (RLS) on all public tables exposed to PostgREST.
-- Run this in Supabase Dashboard → SQL Editor.
--
-- Your server uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS, so server
-- access is unchanged. This only restricts direct client access (anon key)
-- until you add policies. Enabling RLS fixes the "RLS Disabled in Public"
-- critical security finding.
--
-- For "Sensitive Columns Exposed": with RLS enabled and no permissive policies,
-- no rows are visible to anon/authenticated roles, so sensitive data is not
-- exposed. Add policies only if you need direct client access to specific rows.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'analyses',
    'archived_analyses',
    'capital_articles',
    'capital_ready_post_opened',
    'atfx_articles',
    'atfx_quick_analyses',
    'groups',
    'index_constituents',
    'invitations',
    'market_analyses_cache',
    'n8n_chat_histories',
    'password_reset_tokens',
    'symbols',
    'user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS enabled on public.%', t;
    END IF;
  END LOOP;
END $$;
