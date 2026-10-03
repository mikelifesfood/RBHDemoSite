-- RBH Safety Platform — Platform Site V1 Database Extension
-- Date: 2026-09-20
-- Run AFTER the multi-tenant foundation/security SQL that already succeeded.
--
-- FUNCTION-FREE by design:
--   * no PL/pgSQL
--   * no CREATE FUNCTION
--   * no dollar-quoted blocks
--
-- Adds business/account metadata used only by the standalone Platform Site.

alter table public.organizations
add column if not exists start_date date;

alter table public.organizations
add column if not exists subscription_status text not null default 'not_started';

alter table public.organizations
add column if not exists subscription_start_date date;

alter table public.organizations
add column if not exists renewal_date date;

alter table public.organizations
add column if not exists billing_email text;

alter table public.organizations
add column if not exists primary_admin_email text;

alter table public.organizations
add column if not exists employee_limit integer;

alter table public.organizations
add column if not exists legal_name text;

alter table public.organizations
add column if not exists license_number text;

alter table public.organizations
add column if not exists logo_url text;

alter table public.organizations
add column if not exists compliance_notice text;

alter table public.organizations
add column if not exists company_notes text;

alter table public.organizations
add column if not exists updated_at timestamptz not null default now();

create table if not exists public.organization_admin_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  email text not null,
  status text not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  notes text
);

drop index if exists public.organization_admin_invites_org_email_unique;

create unique index if not exists organization_admin_invites_org_email_unique
on public.organization_admin_invites (organization_id, email);

create index if not exists organization_admin_invites_org_idx
on public.organization_admin_invites (organization_id, status);

alter table public.organization_admin_invites enable row level security;

grant select, insert, update, delete
on public.organization_admin_invites
to authenticated;

drop policy if exists rbh_platform_admin_invites_select
on public.organization_admin_invites;

create policy rbh_platform_admin_invites_select
on public.organization_admin_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

drop policy if exists rbh_platform_admin_invites_insert
on public.organization_admin_invites;

create policy rbh_platform_admin_invites_insert
on public.organization_admin_invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

drop policy if exists rbh_platform_admin_invites_update
on public.organization_admin_invites;

create policy rbh_platform_admin_invites_update
on public.organization_admin_invites
for update
to authenticated
using (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

drop policy if exists rbh_platform_admin_invites_delete
on public.organization_admin_invites;

create policy rbh_platform_admin_invites_delete
on public.organization_admin_invites
for delete
to authenticated
using (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

-- Seed RBH business metadata only where it is currently blank.
update public.organizations
set
  primary_admin_email = coalesce(primary_admin_email, 'mikevignery@hotmail.com'),
  subscription_status = case
    when subscription_status is null
      or subscription_status = ''
      or subscription_status = 'not_started'
    then 'internal'
    else subscription_status
  end
where slug = 'rbh-insulation';

-- VALIDATION
select
  id,
  name,
  slug,
  status,
  plan,
  start_date,
  subscription_status,
  primary_admin_email
from public.organizations
order by created_at;

select
  to_regclass('public.organization_admin_invites') as admin_invites_table;
