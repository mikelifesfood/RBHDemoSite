-- RBH STEP 8: Investigator permissions + My Work routing
-- Run AFTER RBH_STEP7_INVESTIGATOR_ASSIGNMENT_V1.
--
-- Goals:
--   1) Supervisor investigators can work Steps 1-3 on reports assigned through investigator_user_id.
--   2) Supervisor corrective-action owners can work Step 4 through assigned_user_id.
--   3) Supervisors cannot use direct API updates to cross those step boundaries.
--   4) Assigned investigators may add report notes, just like assigned corrective-action owners.
--   5) Existing Admin / Safety Manager access and tenant-boundary RLS remain intact.

begin;

-- Fail clearly if the required Step 7 field or Phase 2 role helpers are missing.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='reports'
      and column_name='investigator_user_id'
  ) then
    raise exception 'STEP_7_REQUIRED: public.reports.investigator_user_id is missing.';
  end if;

  if to_regprocedure('public.rbh_current_app_role()') is null then
    raise exception 'PHASE_2_REQUIRED: public.rbh_current_app_role() is missing.';
  end if;

  if to_regprocedure('public.rbh_current_user_active()') is null then
    raise exception 'PHASE_2_REQUIRED: public.rbh_current_user_active() is missing.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 1) REPORT UPDATE RLS
-- -----------------------------------------------------------------------------
-- Keep Admin/Safety Manager access unchanged.
-- Expand Supervisor row access from only corrective-action ownership to EITHER:
--   investigator_user_id = auth.uid()
--   assigned_user_id     = auth.uid()
--
-- The field-level trigger below then enforces which columns each assignment type
-- may actually change. Existing tenant restrictive policies continue to apply.

drop policy if exists rbh_phase2_reports_update_guard on public.reports;

create policy rbh_phase2_reports_update_guard
on public.reports
as restrictive
for update
to authenticated
using (
  public.rbh_current_user_active()
  and (
    public.rbh_current_app_role() in ('admin','safety_manager')
    or (
      public.rbh_current_app_role() = 'supervisor'
      and (
        investigator_user_id = auth.uid()
        or assigned_user_id = auth.uid()
      )
    )
  )
)
with check (
  public.rbh_current_user_active()
  and (
    public.rbh_current_app_role() in ('admin','safety_manager')
    or (
      public.rbh_current_app_role() = 'supervisor'
      and (
        investigator_user_id = auth.uid()
        or assigned_user_id = auth.uid()
      )
    )
  )
);

-- -----------------------------------------------------------------------------
-- 2) SERVER-SIDE STEP BOUNDARY FOR SUPERVISORS
-- -----------------------------------------------------------------------------
-- RLS decides WHICH report row a Supervisor can update.
-- This trigger decides WHICH workflow fields that Supervisor may update.
--
-- Investigator ownership (Steps 1-3):
--   - root cause
--   - corrective-action plan / control type / action owner / due date / priority
--   - normal workflow status/action-status transitions used by Steps 1-3
--
-- Corrective-action ownership (Step 4):
--   - completion note / completion metadata
--   - normal Step 4 action-status/status transitions
--
-- Verification, Cal/OSHA screening, closure, investigator reassignment, reopen/
-- restart controls, and other report fields remain manager-only.

create or replace function public.rbh_guard_supervisor_report_step_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_is_investigator boolean := false;
  v_is_action_owner boolean := false;
  v_changed text[] := array[]::text[];
  v_allowed text[] := array[]::text[];
  v_bad text[] := array[]::text[];
begin
  -- SQL editor / service-role maintenance has no end-user auth.uid().
  -- RLS still prevents ordinary anonymous browser updates.
  if v_uid is null then
    return new;
  end if;

  v_role := public.rbh_current_app_role();

  if v_role in ('admin','safety_manager') then
    return new;
  end if;

  if v_role <> 'supervisor' then
    raise exception 'REPORT_UPDATE_NOT_ALLOWED_FOR_ROLE';
  end if;

  v_is_investigator := old.investigator_user_id is not distinct from v_uid;
  v_is_action_owner := old.assigned_user_id is not distinct from v_uid;

  if not v_is_investigator and not v_is_action_owner then
    raise exception 'REPORT_NOT_ASSIGNED_TO_SUPERVISOR';
  end if;

  select coalesce(array_agg(x.key order by x.key), array[]::text[])
    into v_changed
  from (
    select n.key
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
  ) x;

  -- Common maintenance timestamp if the table has an automatic updated_at trigger.
  v_allowed := array['updated_at'];

  if v_is_investigator then
    v_allowed := v_allowed || array[
      'root_cause',
      'corrective_action',
      'corrective_control_type',
      'assigned_user_id',
      'due_date',
      'priority',
      'action_status',
      'status',
      'reopen_workflow_step'
    ];
  end if;

  if v_is_action_owner then
    v_allowed := v_allowed || array[
      'action_completion_note',
      'action_status',
      'action_completed_at',
      'action_completed_by',
      'status',
      'reopen_workflow_step'
    ];
  end if;

  select coalesce(array_agg(c order by c), array[]::text[])
    into v_bad
  from unnest(v_changed) c
  where not (c = any(v_allowed));

  if coalesce(array_length(v_bad,1),0) > 0 then
    raise exception 'SUPERVISOR_STEP_FIELD_RESTRICTED: %', array_to_string(v_bad, ', ');
  end if;

  -- Investigator workflow-status changes are limited to the states used by Steps 1-3.
  if v_is_investigator and not v_is_action_owner and new.status is distinct from old.status then
    if coalesce(new.status,'') not in ('under_review','assigned') then
      raise exception 'INVESTIGATOR_STATUS_TRANSITION_RESTRICTED';
    end if;
  end if;

  if v_is_investigator and not v_is_action_owner and new.action_status is distinct from old.action_status then
    if coalesce(new.action_status,'') not in ('not_started','in_progress') then
      raise exception 'INVESTIGATOR_ACTION_STATUS_RESTRICTED';
    end if;
  end if;

  -- Corrective-action owner transitions are limited to Step 4 states.
  if v_is_action_owner and new.status is distinct from old.status then
    if coalesce(new.status,'') <> 'corrective_action' then
      -- If the same Supervisor is also the investigator, an investigator transition
      -- may still be valid.
      if not (v_is_investigator and new.status in ('under_review','assigned')) then
        raise exception 'ACTION_OWNER_STATUS_TRANSITION_RESTRICTED';
      end if;
    end if;
  end if;

  if v_is_action_owner and new.action_status is distinct from old.action_status then
    if coalesce(new.action_status,'') not in ('not_started','in_progress','awaiting_verification') then
      if not (v_is_investigator and new.action_status in ('not_started','in_progress')) then
        raise exception 'ACTION_OWNER_ACTION_STATUS_RESTRICTED';
      end if;
    end if;
  end if;

  if new.action_completed_by is distinct from old.action_completed_by
     and v_is_action_owner
     and new.action_completed_by is not null
     and new.action_completed_by <> v_uid then
    raise exception 'ACTION_COMPLETED_BY_MUST_MATCH_CURRENT_USER';
  end if;

  return new;
end;
$$;

drop trigger if exists rbh_guard_supervisor_report_step_fields_trg on public.reports;

create trigger rbh_guard_supervisor_report_step_fields_trg
before update on public.reports
for each row
execute function public.rbh_guard_supervisor_report_step_fields();

-- Keep corrective-action assignment eligibility aligned with the browser dropdown.
-- Existing unchanged historical assignments are left alone; only a newly selected
-- owner is validated.
create or replace function public.rbh_validate_action_owner_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_active boolean;
begin
  if new.assigned_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.assigned_user_id is not distinct from old.assigned_user_id then
    return new;
  end if;

  select p.app_role, coalesce(p.is_active, true)
    into v_role, v_active
  from public.profiles p
  where p.id = new.assigned_user_id;

  if not found then
    raise exception 'Corrective-action owner must be an existing dashboard user.';
  end if;

  if not v_active then
    raise exception 'Corrective-action owner must be an active dashboard user.';
  end if;

  if v_role is null or v_role not in ('admin','safety_manager','supervisor') then
    raise exception 'Read Only users cannot be assigned corrective actions.';
  end if;

  return new;
end;
$$;

drop trigger if exists rbh_validate_action_owner_assignment_trg on public.reports;

create trigger rbh_validate_action_owner_assignment_trg
before insert or update of assigned_user_id on public.reports
for each row
execute function public.rbh_validate_action_owner_assignment();

-- -----------------------------------------------------------------------------
-- 3) NOTES
-- -----------------------------------------------------------------------------
-- Investigators and corrective-action owners may add operational notes to reports
-- assigned to them. Read Only remains unable to insert notes.

drop policy if exists rbh_phase2_notes_insert_guard on public.report_notes;

create policy rbh_phase2_notes_insert_guard
on public.report_notes
as restrictive
for insert
to authenticated
with check (
  public.rbh_current_user_active()
  and (
    public.rbh_current_app_role() in ('admin','safety_manager')
    or (
      public.rbh_current_app_role() = 'supervisor'
      and exists (
        select 1
        from public.reports r
        where r.id = report_id
          and (
            r.investigator_user_id = auth.uid()
            or r.assigned_user_id = auth.uid()
          )
      )
    )
  )
);

commit;

-- -----------------------------------------------------------------------------
-- READ-ONLY VERIFICATION OUTPUT
-- Copy/paste these results back into ChatGPT if anything differs from expected.
-- -----------------------------------------------------------------------------

select
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname='public'
  and tablename='reports'
  and policyname='rbh_phase2_reports_update_guard';

select
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname='public'
  and tablename='report_notes'
  and policyname='rbh_phase2_notes_insert_guard';

select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public'
  and c.relname='reports'
  and t.tgname in ('rbh_guard_supervisor_report_step_fields_trg','rbh_validate_action_owner_assignment_trg')
  and not t.tgisinternal
order by t.tgname;
