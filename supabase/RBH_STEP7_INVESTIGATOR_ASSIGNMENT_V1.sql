-- RBH STEP 7: Case Owner / Investigator assignment
-- Additive migration. Does not change existing role/RLS access yet.
-- Step 8 will use this field for investigator-specific permissions and My Work routing.

begin;

alter table public.reports
  add column if not exists investigator_user_id uuid;

-- Keep the assignment tied to a real dashboard profile.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_investigator_user_id_fkey'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_investigator_user_id_fkey
      foreign key (investigator_user_id)
      references public.profiles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists reports_investigator_user_id_idx
  on public.reports (investigator_user_id);

comment on column public.reports.investigator_user_id is
  'Dashboard user responsible for owning the report investigation. Separate from the corrective-action assignee.';

-- Defense in depth: even if the browser dropdown is bypassed, a newly selected
-- investigator must be an active Admin, Safety Manager, or Supervisor.
create or replace function public.rbh_validate_investigator_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_active boolean;
begin
  if new.investigator_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.investigator_user_id is not distinct from old.investigator_user_id then
    return new;
  end if;

  select p.app_role, coalesce(p.is_active, true)
    into v_role, v_active
  from public.profiles p
  where p.id = new.investigator_user_id;

  if not found then
    raise exception 'Investigator must be an existing dashboard user.';
  end if;

  if not v_active then
    raise exception 'Investigator must be an active dashboard user.';
  end if;

  if v_role is null or v_role not in ('admin', 'safety_manager', 'supervisor') then
    raise exception 'Read Only users cannot be assigned as investigators.';
  end if;

  return new;
end;
$$;

drop trigger if exists rbh_validate_investigator_assignment_trg on public.reports;

create trigger rbh_validate_investigator_assignment_trg
before insert or update of investigator_user_id on public.reports
for each row
execute function public.rbh_validate_investigator_assignment();

-- Restart Workflow returns the report to a clean Step 1 cycle, so clear the
-- active investigator assignment just as the active corrective-action plan is cleared.
create or replace function public.rbh_clear_investigator_on_restart()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.workflow_restart_count, 0) > coalesce(old.workflow_restart_count, 0) then
    new.investigator_user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rbh_clear_investigator_on_restart_trg on public.reports;

create trigger rbh_clear_investigator_on_restart_trg
before update of workflow_restart_count on public.reports
for each row
execute function public.rbh_clear_investigator_on_restart();

commit;

-- Verification output
select
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'reports'
  and c.column_name = 'investigator_user_id';

select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = 'public.reports'::regclass
  and con.conname = 'reports_investigator_user_id_fkey';

select
  t.tgname as trigger_name
from pg_trigger t
join pg_class r on r.oid = t.tgrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname = 'reports'
  and t.tgname in (
    'rbh_validate_investigator_assignment_trg',
    'rbh_clear_investigator_on_restart_trg'
  )
  and not t.tgisinternal
order by t.tgname;
