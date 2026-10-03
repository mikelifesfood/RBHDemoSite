-- RBH Safety - Workflow Guidance Preference V1
-- Step 4 of the RBH freeze-template UX upgrades.
-- Run once in Supabase SQL Editor BEFORE deploying the Step 4 dashboard.html.
-- This stores only the signed-in user's workflow-guidance preference.

begin;

alter table public.profiles
  add column if not exists show_workflow_guidance boolean not null default true;

comment on column public.profiles.show_workflow_guidance is
  'Viewer preference only. true shows optional workflow helper text; false hides optional guidance. Regulatory warnings and required-field messages are never controlled by this preference.';

create or replace function public.rbh_update_my_guidance(p_show_guidance boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.profiles
     set show_workflow_guidance = coalesce(p_show_guidance, true)
   where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

grant execute on function public.rbh_update_my_guidance(boolean) to authenticated;
revoke all on function public.rbh_update_my_guidance(boolean) from anon;

commit;
