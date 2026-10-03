-- RBH Step 11 - In-App Notification Center test query
-- Read-only. Run after exercising the Step 11 test scenarios.

select
  n.notification_type,
  n.title,
  n.message,
  p.email as recipient_email,
  n.viewed_at,
  n.acknowledged_at,
  n.resolved_at,
  n.resolution_reason,
  n.created_at,
  r.ref_no
from public.report_user_notifications n
left join public.profiles p on p.id = n.recipient_user_id
left join public.reports r on r.id = n.report_id
order by n.created_at desc
limit 100;
