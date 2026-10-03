# Supabase Edge Functions

These files are source-control copies of the Edge Functions used by the current RBH Safety build.

## `notify-report`

New-report email notification through Brevo. Current RBH deployment is triggered from Postgres/pg_net and uses environment secrets including `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `NOTIFY_TO`, `WEBHOOK_SECRET`, `DASHBOARD_URL`, and `LOGO_URL`.

## `send-action-assignment-email`

Authenticated transactional workflow notifications through Brevo. Current Step 10 V9 supports Investigator assignment, Corrective Action assignment, changes requested, Verification Owner assignment, and verification requests. Recipient routing is resolved from the report assignment and organization profiles.

## `translate-report`

Authenticated translation function used for viewer-language report/PDF presentation. Original report content remains unchanged.

Do not commit secret values here. Deploy/update functions through the Supabase dashboard unless the project later adopts an automated deployment process.
