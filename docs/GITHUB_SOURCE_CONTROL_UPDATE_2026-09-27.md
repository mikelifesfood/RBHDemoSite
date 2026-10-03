# GitHub Source-Control Update - 2026-09-27

This package starts from `RBH-main (10).zip` and keeps the current Step 11A `dashboard.html` unchanged.

## Added to GitHub source control

### Supabase database scripts

- `supabase/ACTION_ASSIGNMENT_EMAIL_BREVO_V1.sql`
- `supabase/RBH_STEP4_WORKFLOW_GUIDANCE_PREFERENCE_V1.sql`
- `supabase/RBH_STEP6_HIERARCHY_OF_CONTROLS_V1.sql`
- `supabase/RBH_STEP7_INVESTIGATOR_ASSIGNMENT_V1.sql`
- `supabase/RBH_STEP8_INVESTIGATOR_PERMISSIONS_MYWORK_V1.sql`
- `supabase/RBH_STEP9_VERIFIER_ASSIGNMENT_QUEUE_V1.sql`
- `supabase/RBH_STEP11_IN_APP_NOTIFICATION_CENTER_V1.sql`

### Canonical Edge Function source

- `supabase/functions/notify-report/index.ts`
- `supabase/functions/send-action-assignment-email/index.ts`
- `supabase/functions/translate-report/index.ts`
- `supabase/functions/README.md`

### Documentation / validation

- `supabase/README.md`
- `docs/TeamWorkt_RBH_Buildout_Handoff_Step11A_2026-09-27.txt`
- `docs/RBH_STEP10_NOTIFICATION_VALIDATION.sql`
- `docs/RBH_STEP11_NOTIFICATION_TEST_QUERY.sql`
- `docs/GITHUB_SOURCE_CONTROL_UPDATE_2026-09-27.md`

### Updated

- `README.md` now reflects the current live RBH architecture instead of the obsolete early draft description.

## Runtime behavior

No frontend runtime code was changed in this packaging pass. The existing `dashboard.html` was verified byte-for-byte against the accepted Step 11A dashboard before packaging.

## Important limitation

This is a source-control completeness update for the recent build work, **not** the final clone-ready Supabase migration bundle. The older production schema/RLS/Storage history still needs consolidation during the dedicated clone-readiness/security phase.
