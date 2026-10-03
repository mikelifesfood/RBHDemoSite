# RBH Insulation Safety Application

RBH is the current live blueprint for the TeamWorkt Safety product. The repository contains the public employee reporting form, authenticated management dashboard, platform/admin pages, Supabase database reference scripts, and source-control copies of the deployed Supabase Edge Functions.

## Current build status

Current dashboard baseline: **Step 11A - In-App Notification Center with red gradient alert button** (2026-09-27).

The working management flow is:

1. Review
2. Investigation
3. Action Plan
4. Complete Action
5. Verification
6. Close

Current ownership model:

- Case Owner / Investigator: Steps 1-3
- Corrective Action Owner: Step 4
- Verification Owner: Step 5 when specifically assigned; otherwise shared Admin/Safety Manager queue
- Closure: Admin / Safety Manager

The application also includes regulatory screening/timer behavior, hierarchy-of-controls tagging, corrective-action evidence, audit/activity history, PDF/CSV output, English/Spanish viewer preferences, Brevo transactional email notifications, and database-backed in-app notifications.

## Main application files

- `index.html` - public employee safety reporting form
- `dashboard.html` - authenticated RBH management dashboard
- `platform/index.html` - platform/admin interface retained from the current RBH build
- `logo.png` - RBH logo asset

Historical copies such as `dashboard_old.html`, `dashboard_09182026_v1.html`, and `index_old.html` are retained only as prior references and are not the current source of truth.

## Supabase source control

See `supabase/README.md`.

Recent database changes and canonical Edge Function source are now captured under `supabase/` so the GitHub repository more accurately represents what is deployed in RBH.

**Important:** The current SQL collection is not yet the final clean, from-zero customer migration set. A dedicated production-security and clone-readiness phase will consolidate the schema, RLS, Storage policies, functions, triggers, Auth configuration, secrets checklist, backup/retention controls, and customer isolation requirements into a sanitized TeamWorkt Safety master template.

## Current deployed Edge Functions represented in this repo

- `supabase/functions/notify-report/index.ts`
- `supabase/functions/send-action-assignment-email/index.ts`
- `supabase/functions/translate-report/index.ts`

Secrets stay in Supabase and must never be committed to GitHub.

## Deployment context

The current RBH frontend is hosted through GitHub Pages. There is no current Cloudflare or Vercel deployment attached to this RBH build.

Current dashboard URL:

`https://mikelifesfood.github.io/RBH/dashboard.html`

## Continuation handoff

The latest build handoff is stored at:

`docs/TeamWorkt_RBH_Buildout_Handoff_Step11A_2026-09-27.txt`

The next planned build step is **Step 12 - Notification Acknowledgment + Acknowledgment History**.
