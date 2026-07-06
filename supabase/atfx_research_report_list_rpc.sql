-- Lightweight research report list (languages without transferring report HTML).
-- Run in Supabase SQL Editor, then the API uses rpc with fallback to a minimal select.

create or replace function public.atfx_research_report_list(uids text[])
returns table (
  id uuid,
  title text,
  updated_at timestamptz,
  created_at timestamptz,
  firebase_uid text,
  languages text[]
)
language sql
stable
as $$
  select
    r.id,
    r.title,
    r.updated_at,
    r.created_at,
    r.firebase_uid,
    coalesce(
      (
        select array_agg(lang order by ord)
        from (
          select 'en'::text as lang, 1 as ord
          where coalesce(trim(r.report_html), '') <> ''
          union all
          select e.key::text as lang,
            case e.key
              when 'en' then 1
              when 'tc' then 2
              when 'sc' then 3
              when 'th' then 4
              when 'vi' then 5
              else 99
            end as ord
          from jsonb_each(r.report_html_i18n) as e(key, val)
          where e.key in ('en', 'tc', 'sc', 'th', 'vi')
            and coalesce(trim(e.val->>'report_html'), '') <> ''
        ) langs
      ),
      array[]::text[]
    ) as languages
  from public.atfx_research_reports r
  where r.firebase_uid = any(uids)
  order by r.updated_at desc
  limit 50;
$$;
