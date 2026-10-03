# RBH Supabase Source-Control Reference

This folder contains the Supabase SQL and Edge Function source currently needed to maintain the RBH Safety blueprint.

## Important

The live RBH Supabase project already has these changes applied through Step 11. Do **not** rerun every SQL file against production simply because it exists here. These files are checked in so the deployed database behavior is represented in GitHub and can later be consolidated into the sanitized TeamWorkt Safety master template.

This directory is **not yet the final from-zero customer migration set**. Older RBH production migrations and policies still need a dedicated consolidation/clone-readiness pass before the first customer deployment.

## Recent SQL source captured here

- `LANGUAGE_PREFERENCES_V1.sql`
- `PLATFORM_SITE_V1_METADATA.sql`
- `ACTION_ASSIGNMENT_EMAIL_BREVO_V1.sql`
- `RBH_STEP4_WORKFLOW_GUIDANCE_PREFERENCE_V1.sql`
- `RBH_STEP6_HIERARCHY_OF_CONTROLS_V1.sql`
- `RBH_STEP7_INVESTIGATOR_ASSIGNMENT_V1.sql`
- `RBH_STEP8_INVESTIGATOR_PERMISSIONS_MYWORK_V1.sql`
- `RBH_STEP9_VERIFIER_ASSIGNMENT_QUEUE_V1.sql`
- `RBH_STEP11_IN_APP_NOTIFICATION_CENTER_V1.sql`

## Edge Functions

Canonical source-control copies are under `supabase/functions/`:

- `notify-report/index.ts` - existing Brevo new-report notification function.
- `send-action-assignment-email/index.ts` - Step 10 V9 targeted Investigator / Action Owner / Verifier email routing.
- `translate-report/index.ts` - authenticated server-side report translation.

Secrets are configured in Supabase and are intentionally not stored in GitHub.

## Current next build

Step 12: notification acknowledgment and acknowledgment history.
