-- RBH STEP 9: Optional verifier assignment + verification queue guardrails
-- Run AFTER RBH_STEP8_INVESTIGATOR_PERMISSIONS_MYWORK_V1.
--
-- Goals:
--   1) Add an optional verification owner separate from the investigator/action owner.
--   2) Restrict verifier choices to active Admin or Safety Manager accounts.
--   3) Keep unassigned verification in a shared Admin/Safety Manager queue.
--   4) If a verifier is assigned, only that Safety Manager may perform the verification
--      unless an Admin reassigns/overrides.
--   5) Preserve existing Supervisor step boundaries and customer/tenant RLS.

begin;

-- Fail clearly if Step 8 / role helpers are missing.
do $$
begin
  if to_regprocedure('public.rbh_current_app_role()') is null then
    raise exception 'PHASE_2_REQUIRED: public.rbh_current_app_role() is missing.';
  end if;

  if to_regprocedure('public.rbh_current_user_active()') is null then
    raise exception 'PHASE_2_REQUIRED: public.rbh_current_user_active() is missing.';
  end if;

  if to_regprocedure('public.rbh_guard_supervisor_report_step_fields()') is null then
    raise exception 'STEP_8_REQUIRED: public.rbh_guard_supervisor_report_step_fields() is missing.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 1) VERIFICATION OWNER FIELD
-- -----------------------------------------------------------------------------

alter table public.reports
  add column if not exists verifier_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_verifier_user_id_fkey'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_verifier_user_id_fkey
      foreign key (verifier_user_id)
      references public.profiles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists reports_verifier_user_id_idx
  on public.reports (verifier_user_id);

comment on column public.reports.verifier_user_id is
  'Optional Admin/Safety Manager responsible for Step 5 verification. Null means shared verification queue.';

-- -----------------------------------------------------------------------------
-- 2) ASSIGNMENT VALIDATION
-- -----------------------------------------------------------------------------
-- Browser controls are not the security boundary. A direct API update still must
-- choose an active Admin or Safety Manager.

create or replace function public.rbh_validate_verifier_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_active boolean;
begin
  if new.verifier_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.verifier_user_id is not distinct from old.verifier_user_id then
    return new;
  end if;

  select p.app_role, coalesce(p.is_active, true)
    into v_role, v_active
  from public.profiles p
  where p.id = new.verifier_user_id;

  if not found then
    raise exception 'Verification owner must be an existing dashboard user.';
  end if;

  if not v_active then
    raise exception 'Verification owner must be an active dashboard user.';
  end if;

  if v_role is null or v_role not in ('admin','safety_manager') then
    raise exception 'Verification owner must be an Admin or Safety Manager.';
  end if;

  return new;
end;
$$;

drop trigger if exists rbh_validate_verifier_assignment_trg on public.reports;

create trigger rbh_validate_verifier_assignment_trg
before insert or update of verifier_user_id on public.reports
for each row
execute function public.rbh_validate_verifier_assignment();

-- -----------------------------------------------------------------------------
-- 3) ENFORCE ASSIGNED VERIFICATION OWNERSHIP
-- -----------------------------------------------------------------------------
-- Admins retain override authority.
-- Safety Managers:
--   - may verify unassigned work,
--   - may verify work assigned to themselves,
--   - may reassign the verification owner,
--   - may NOT save a verification decision/note on work assigned to someone else.
--
-- Reassignment is deliberately allowed and remains visible in the audit trail.

create or replace function public.rbh_guard_verification_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_verification_action boolean := false;
begin
  -- SQL editor/service-role maintenance has no end-user auth.uid().
  if v_uid is null then
    return new;
  end if;

  v_role := public.rbh_current_app_role();

  if v_role = 'admin' then
    if new.action_verified_by is distinct from old.action_verified_by
       and new.action_verified_by is not null
       and new.action_verified_by <> v_uid then
      raise exception 'ACTION_VERIFIED_BY_MUST_MATCH_CURRENT_USER';
    end if;
    return new;
  end if;

  if v_role <> 'safety_manager' then
    -- Supervisor restrictions are enforced by the Step 8 field-boundary trigger.
    -- Read Only is blocked by RLS.
    return new;
  end if;

  v_verification_action :=
       new.action_verification_note is distinct from old.action_verification_note
    or new.action_verified_at is distinct from old.action_verified_at
    or new.action_verified_by is distinct from old.action_verified_by
    or (
      new.action_status is distinct from old.action_status
      and coalesce(new.action_status,'') in ('verified','changes_requested')
    );

  if v_verification_action
     and old.verifier_user_id is not null
     and old.verifier_user_id <> v_uid then
    raise exception 'VERIFICATION_ASSIGNED_TO_ANOTHER_REVIEWER';
  end if;

  if new.action_verified_by is distinct from old.action_verified_by
     and new.action_verified_by is not null
     and new.action_verified_by <> v_uid then
    raise exception 'ACTION_VERIFIED_BY_MUST_MATCH_CURRENT_USER';
  end if;

  return new;
end;
$$;

drop trigger if exists rbh_guard_verification_owner_trg on public.reports;

create trigger rbh_guard_verification_owner_trg
before update on public.reports
for each row
execute function public.rbh_guard_verification_owner();

-- -----------------------------------------------------------------------------
-- 4) TRUE WORKFLOW RESTART CLEARS CURRENT VERIFIER OWNERSHIP
-- -----------------------------------------------------------------------------
-- A normal reopen may keep the prior verifier visible for continuity. A true
-- Restart Workflow returns the active cycle to a clean beginning.

create or replace function public.rbh_clear_verifier_on_restart()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.workflow_restart_count, 0) > coalesce(old.workflow_restart_count, 0) then
    new.verifier_user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rbh_clear_verifier_on_restart_trg on public.reports;

create trigger rbh_clear_verifier_on_restart_trg
before update of workflow_restart_count on public.reports
for each row
execute function public.rbh_clear_verifier_on_restart();

commit;

-- -----------------------------------------------------------------------------
-- READ-ONLY VERIFICATION OUTPUT
-- Copy/paste these results back into ChatGPT if anything differs from expected.
-- -----------------------------------------------------------------------------

select
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema='public'
  and c.table_name='reports'
  and c.column_name='verifier_user_id';

select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid='public.reports'::regclass
  and con.conname='reports_verifier_user_id_fkey';

select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public'
  and c.relname='reports'
  and t.tgname in (
    'rbh_validate_verifier_assignment_trg',
    'rbh_guard_verification_owner_trg',
    'rbh_clear_verifier_on_restart_trg'
  )
  and not t.tgisinternal
order by t.tgname;
