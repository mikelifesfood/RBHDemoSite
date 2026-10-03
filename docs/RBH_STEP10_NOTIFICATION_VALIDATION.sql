-- RBH Step 10 notification validation
select
  notification_type,
  recipient_email,
  provider,
  status,
  provider_message_id,
  error_message,
  created_at,
  sent_at
from public.report_notification_events
where notification_type in (
  'investigator_assignment',
  'action_assignment',
  'action_changes_requested',
  'verifier_assignment',
  'action_verification_requested'
)
order by created_at desc
limit 50;
