-- RBH STEP 6: Hierarchy of Controls / corrective-action control type
-- Safe, additive migration. Existing reports remain unchanged.

begin;

alter table public.reports
  add column if not exists corrective_control_type text;

-- Keep the stored values predictable for analytics, exports, and future cloning.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_corrective_control_type_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_corrective_control_type_check
      check (
        corrective_control_type is null
        or corrective_control_type in (
          'elimination',
          'substitution',
          'engineering',
          'administrative',
          'ppe',
          'other'
        )
      );
  end if;
end
$$;

comment on column public.reports.corrective_control_type is
  'Optional hierarchy-of-controls classification for the active corrective-action plan.';

-- The existing restart RPC clears the active management workflow. This trigger makes
-- sure the new control classification is cleared at the same time without changing
-- the existing restart function itself.
create or replace function public.rbh_clear_corrective_control_type_on_restart()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.workflow_restart_count, 0) > coalesce(old.workflow_restart_count, 0) then
    new.corrective_control_type := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rbh_clear_corrective_control_type_on_restart_trg on public.reports;

create trigger rbh_clear_corrective_control_type_on_restart_trg
before update of workflow_restart_count on public.reports
for each row
execute function public.rbh_clear_corrective_control_type_on_restart();

commit;

-- Verification output
select
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'reports'
  and c.column_name = 'corrective_control_type';

select
  t.tgname as trigger_name
from pg_trigger t
join pg_class r on r.oid = t.tgrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname = 'reports'
  and t.tgname = 'rbh_clear_corrective_control_type_on_restart_trg'
  and not t.tgisinternal;
