-- RBH Safety - Step 11: In-App Notification Center V1
-- Run in Supabase SQL Editor BEFORE deploying the Step 11 dashboard.
--
-- Purpose
--   * Durable, per-user in-app notification queue.
--   * Bell count represents ACTIVE notifications that have not yet been acknowledged.
--   * Opening a notification records viewed_at, but DOES NOT acknowledge it.
--   * Step 12 will add explicit acknowledgment controls/history.
--   * Stale work is resolved automatically when ownership or workflow state changes.
--
-- This migration does NOT backfill old events. It begins recording new events after deployment.

begin;

create table if not exists public.report_user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text
);

comment on table public.report_user_notifications is
  'Per-user RBH in-app notification queue. Email delivery remains separately logged in report_notification_events.';

comment on column public.report_user_notifications.viewed_at is
  'First time the recipient opened the notification. Viewing does not remove it from the active bell count.';

comment on column public.report_user_notifications.acknowledged_at is
  'Explicit recipient acknowledgment. Step 12 adds the user-facing acknowledgment action.';

comment on column public.report_user_notifications.resolved_at is
  'System resolution when the underlying work is no longer actionable for this recipient.';

create index if not exists report_user_notifications_recipient_active_idx
  on public.report_user_notifications (recipient_user_id, created_at desc)
  where acknowledged_at is null and resolved_at is null;

create index if not exists report_user_notifications_report_idx
  on public.report_user_notifications (report_id, created_at desc);

create index if not exists report_user_notifications_org_idx
  on public.report_user_notifications (organization_id, created_at desc);

alter table public.report_user_notifications enable row level security;

-- Browser users may only read their own queue. Writes happen through the trigger and
-- narrow RPCs, never by directly inserting/updating notification rows from dashboard.html.
revoke all on table public.report_user_notifications from public, anon, authenticated;
grant select on table public.report_user_notifications to authenticated;

drop policy if exists rbh_report_user_notifications_select_own
  on public.report_user_notifications;

create policy rbh_report_user_notifications_select_own
  on public.report_user_notifications
  for select
  to authenticated
  using (recipient_user_id = auth.uid());

-- Narrow RPC used when a recipient opens a notification.
create or replace function public.rbh_mark_notification_viewed(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.report_user_notifications n
     set viewed_at = coalesce(n.viewed_at, now())
   where n.id = p_notification_id
     and n.recipient_user_id = v_user;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.rbh_mark_notification_viewed(uuid) from public, anon;
grant execute on function public.rbh_mark_notification_viewed(uuid) to authenticated;

-- Server-side event producer. The function is SECURITY DEFINER because normal dashboard
-- users intentionally have no INSERT/UPDATE access to the notification table.
create or replace function public.rbh_emit_report_user_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_ref text := coalesce(nullif(trim(new.ref_no), ''), left(new.id::text, 8));
  v_report_label text := coalesce(nullif(trim(new.report_type), ''), 'safety report');
  v_now timestamptz := now();
  v_verifier_changed boolean := false;
begin
  -- New employee/field report: alert the active management review group in the same company.
  if tg_op = 'INSERT' then
    if new.organization_id is not null then
      insert into public.report_user_notifications (
        organization_id, recipient_user_id, report_id, notification_type, title, message
      )
      select
        new.organization_id,
        p.id,
        new.id,
        'new_report',
        'New safety report',
        'Report #' || v_ref || ' (' || v_report_label || ') is ready for review.'
      from public.profiles p
      where p.organization_id = new.organization_id
        and coalesce(p.is_active, true) = true
        and p.app_role in ('admin', 'safety_manager');
    end if;
    return new;
  end if;

  v_verifier_changed := new.verifier_user_id is distinct from old.verifier_user_id;

  -- Once review starts, the original new-report alert is no longer actionable.
  if old.status = 'new' and new.status is distinct from old.status then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'review_started')
     where report_id = new.id
       and notification_type = 'new_report'
       and acknowledged_at is null
       and resolved_at is null;
  end if;

  -- Investigator ownership changed. Supersede any prior active investigator alert.
  if new.investigator_user_id is distinct from old.investigator_user_id then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'investigator_reassigned')
     where report_id = new.id
       and notification_type = 'investigator_assignment'
       and acknowledged_at is null
       and resolved_at is null;

    if new.investigator_user_id is not null
       and new.status not in ('closed', 'no_action', 'duplicate') then
      insert into public.report_user_notifications (
        organization_id, recipient_user_id, report_id, notification_type, title, message
      ) values (
        new.organization_id,
        new.investigator_user_id,
        new.id,
        'investigator_assignment',
        'Investigation assigned',
        'You are the case owner / investigator for Report #' || v_ref || '.'
      );
    end if;
  end if;

  -- Completing Step 3 ends the investigation assignment as active work even though the
  -- historical investigator field remains on the report.
  if new.status = 'assigned' and old.status is distinct from new.status then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'investigation_handed_off')
     where report_id = new.id
       and notification_type = 'investigator_assignment'
       and acknowledged_at is null
       and resolved_at is null;
  end if;

  -- Corrective-action owner changed. Remove stale action/changes alerts, then notify the
  -- newly responsible owner.
  if new.assigned_user_id is distinct from old.assigned_user_id then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'action_owner_reassigned')
     where report_id = new.id
       and notification_type in ('action_assignment', 'changes_requested')
       and acknowledged_at is null
       and resolved_at is null;

    if new.assigned_user_id is not null
       and new.status not in ('closed', 'no_action', 'duplicate')
       and coalesce(new.action_status, 'not_started') not in ('awaiting_verification', 'verified') then
      insert into public.report_user_notifications (
        organization_id, recipient_user_id, report_id, notification_type, title, message
      ) values (
        new.organization_id,
        new.assigned_user_id,
        new.id,
        'action_assignment',
        'Corrective action assigned',
        'You own the corrective action for Report #' || v_ref || '.'
      );
    end if;
  end if;

  -- Changing the specific verification owner supersedes existing active verification alerts.
  if v_verifier_changed then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'verification_owner_changed')
     where report_id = new.id
       and notification_type in ('verifier_assignment', 'verification_requested')
       and acknowledged_at is null
       and resolved_at is null;
  end if;

  -- Workflow-state notifications and automatic stale-alert resolution.
  if new.action_status is distinct from old.action_status then
    -- Any transition out of active corrective-action work clears the original assignment alert.
    if new.action_status in ('awaiting_verification', 'verified') then
      update public.report_user_notifications
         set resolved_at = coalesce(resolved_at, v_now),
             resolution_reason = coalesce(resolution_reason, 'action_submitted')
       where report_id = new.id
         and notification_type = 'action_assignment'
         and acknowledged_at is null
         and resolved_at is null;
    end if;

    -- Leaving changes-requested clears that alert before a fresh verification request is made.
    if old.action_status = 'changes_requested' then
      update public.report_user_notifications
         set resolved_at = coalesce(resolved_at, v_now),
             resolution_reason = coalesce(resolution_reason, 'changes_resubmitted')
       where report_id = new.id
         and notification_type = 'changes_requested'
         and acknowledged_at is null
         and resolved_at is null;
    end if;

    -- Leaving awaiting-verification clears the prior verification request/assignment alert.
    if old.action_status = 'awaiting_verification' then
      update public.report_user_notifications
         set resolved_at = coalesce(resolved_at, v_now),
             resolution_reason = coalesce(resolution_reason, 'verification_completed_or_returned')
       where report_id = new.id
         and notification_type in ('verifier_assignment', 'verification_requested')
         and acknowledged_at is null
         and resolved_at is null;
    end if;

    if new.action_status = 'awaiting_verification' then
      -- Re-submission creates a fresh verification request. If a reviewer is assigned,
      -- target that one reviewer; otherwise notify the shared Admin/Safety Manager queue.
      if new.verifier_user_id is not null then
        insert into public.report_user_notifications (
          organization_id, recipient_user_id, report_id, notification_type, title, message
        ) values (
          new.organization_id,
          new.verifier_user_id,
          new.id,
          'verification_requested',
          'Verification requested',
          'Corrective action for Report #' || v_ref || ' is ready for your review.'
        );
      elsif new.organization_id is not null then
        insert into public.report_user_notifications (
          organization_id, recipient_user_id, report_id, notification_type, title, message
        )
        select
          new.organization_id,
          p.id,
          new.id,
          'verification_requested',
          'Verification requested',
          'Corrective action for Report #' || v_ref || ' is ready for review in the shared queue.'
        from public.profiles p
        where p.organization_id = new.organization_id
          and coalesce(p.is_active, true) = true
          and p.app_role in ('admin', 'safety_manager');
      end if;

    elsif new.action_status = 'changes_requested' then
      if new.assigned_user_id is not null then
        insert into public.report_user_notifications (
          organization_id, recipient_user_id, report_id, notification_type, title, message
        ) values (
          new.organization_id,
          new.assigned_user_id,
          new.id,
          'changes_requested',
          'Changes requested',
          'More work or evidence is needed for the corrective action on Report #' || v_ref || '.'
        );
      end if;
    end if;
  end if;

  -- A verifier assigned AFTER an action is already waiting gets a focused ownership alert.
  -- If the verifier is cleared, restore the shared queue alerts.
  if v_verifier_changed
     and new.action_status = 'awaiting_verification'
     and new.action_status is not distinct from old.action_status then
    if new.verifier_user_id is not null then
      insert into public.report_user_notifications (
        organization_id, recipient_user_id, report_id, notification_type, title, message
      ) values (
        new.organization_id,
        new.verifier_user_id,
        new.id,
        'verifier_assignment',
        'Verification assigned',
        'You are the verification owner for Report #' || v_ref || '.'
      );
    elsif new.organization_id is not null then
      insert into public.report_user_notifications (
        organization_id, recipient_user_id, report_id, notification_type, title, message
      )
      select
        new.organization_id,
        p.id,
        new.id,
        'verification_requested',
        'Verification requested',
        'Corrective action for Report #' || v_ref || ' is ready for review in the shared queue.'
      from public.profiles p
      where p.organization_id = new.organization_id
        and coalesce(p.is_active, true) = true
        and p.app_role in ('admin', 'safety_manager');
    end if;
  end if;

  -- Final/resolved report states should never leave actionable bell items behind.
  if new.status in ('closed', 'no_action', 'duplicate')
     and old.status is distinct from new.status then
    update public.report_user_notifications
       set resolved_at = coalesce(resolved_at, v_now),
           resolution_reason = coalesce(resolution_reason, 'report_resolved')
     where report_id = new.id
       and acknowledged_at is null
       and resolved_at is null;
  end if;

  return new;
end;
$$;

revoke all on function public.rbh_emit_report_user_notifications() from public, anon, authenticated;

-- AFTER trigger observes the final values after the Step 7/8/9 BEFORE guards have run.
drop trigger if exists rbh_emit_report_user_notifications_trg on public.reports;
create trigger rbh_emit_report_user_notifications_trg
after insert or update of
  status,
  investigator_user_id,
  assigned_user_id,
  verifier_user_id,
  action_status
on public.reports
for each row execute function public.rbh_emit_report_user_notifications();

commit;

-- -----------------------------------------------------------------------------
-- Validation (read only)
-- Expected:
--   table_name = report_user_notifications
--   policy_name = rbh_report_user_notifications_select_own
--   function_name = rbh_mark_notification_viewed
--   trigger_name = rbh_emit_report_user_notifications_trg
-- -----------------------------------------------------------------------------
select
  to_regclass('public.report_user_notifications') as table_name,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_user_notifications'
      and policyname = 'rbh_report_user_notifications_select_own'
  ) as own_select_policy,
  to_regprocedure('public.rbh_mark_notification_viewed(uuid)') as viewed_rpc;

select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'reports'
  and t.tgname = 'rbh_emit_report_user_notifications_trg'
  and not t.tgisinternal;
