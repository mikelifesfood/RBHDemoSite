-- RBH Safety - Action Assignment Email Brevo V1
-- Run in Supabase SQL Editor BEFORE deploying the Edge Function/dashboard update.
-- Purpose: durable notification audit/idempotency for corrective-action assignment emails.

begin;

create table if not exists public.report_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  notification_type text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  event_key text not null,
  provider text not null default 'brevo',
  provider_message_id text,
  status text not null default 'sending',
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint report_notification_events_status_check
    check (status in ('sending','sent','failed','skipped'))
);

create unique index if not exists report_notification_events_event_key_uidx
  on public.report_notification_events(event_key);

create index if not exists report_notification_events_report_idx
  on public.report_notification_events(report_id, created_at desc);

create index if not exists report_notification_events_org_idx
  on public.report_notification_events(organization_id, created_at desc);

alter table public.report_notification_events enable row level security;

-- Notification delivery history is server-side only. The Edge Function uses the
-- Supabase service-role secret, which bypasses RLS. Browser clients get no table access.
revoke all on table public.report_notification_events from anon;
revoke all on table public.report_notification_events from authenticated;

comment on table public.report_notification_events is
'RBH Safety server-side notification delivery log. Used to prevent duplicate transactional notifications and preserve delivery status.';

commit;

-- Validation
select
  to_regclass('public.report_notification_events') as notification_table,
  (select count(*) from public.report_notification_events) as existing_notification_rows;
