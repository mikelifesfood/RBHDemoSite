-- RBH Safety - Language Preferences V1
-- Run once in Supabase SQL Editor before deploying dashboard.html.
-- This migration stores each authenticated user's preferred report-reading language.
-- It does NOT modify the original language or wording of any submitted report.

begin;

alter table public.profiles
  add column if not exists preferred_language text not null default 'auto';

comment on column public.profiles.preferred_language is
  'Viewer preference only. auto uses the browser/device language. Never use this field to choose a regulatory filing language.';

create or replace function public.rbh_update_my_language(p_preferred_language text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_language text := lower(trim(coalesce(p_preferred_language, 'auto')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_language <> 'auto'
     and v_language !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    raise exception 'INVALID_LANGUAGE';
  end if;

  update public.profiles
     set preferred_language = v_language
   where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

grant execute on function public.rbh_update_my_language(text) to authenticated;
revoke all on function public.rbh_update_my_language(text) from anon;

commit;
