// supabase/functions/notify-report/index.ts
// Source-control copy of the existing RBH Brevo new-report notification function.
// This file mirrors the currently deployed function supplied during the Action Assignment Email work.
// No redeploy is required solely because this file is now present in GitHub.
//
// Emails the RBH safety team when a new report is inserted, via BREVO.
// Triggered by the reports_notify Postgres trigger (pg_net) on public.reports INSERT.
//
// Secrets (Edge Functions -> Manage secrets):
//   BREVO_API_KEY    - Brevo API key
//   MAIL_FROM_EMAIL  - a sender address VERIFIED in Brevo
//   MAIL_FROM_NAME   - display name, e.g. "RBH Safety"
//   NOTIFY_TO        - comma-separated recipients (bare emails, no names/brackets)
//   WEBHOOK_SECRET   - shared secret; must match the trigger's x-webhook-secret header
//   DASHBOARD_URL    - link to the dashboard
//   LOGO_URL         - public logo URL

const BREVO_API_KEY  = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("MAIL_FROM_EMAIL") ?? "";
const FROM_NAME      = Deno.env.get("MAIL_FROM_NAME") ?? "RBH Safety";
const NOTIFY_TO      = (Deno.env.get("NOTIFY_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const DASHBOARD_URL  = Deno.env.get("DASHBOARD_URL") ?? "";
const LOGO_URL       = Deno.env.get("LOGO_URL") ?? "";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function row(label: string, value?: string): string {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px;color:#6c6862;font:600 13px system-ui,sans-serif;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:6px 12px;color:#161616;font:400 14px system-ui,sans-serif">${esc(value).replace(/\n/g, "<br>")}</td></tr>`;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET)
      return new Response("Unauthorized", { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body?.type && body.type !== "INSERT") return new Response("ignored", { status: 200 });
    const rec = body?.record ?? {};
    const injury = rec.involves_injury === true || rec.involves_injury === "true";

    if (!BREVO_API_KEY) return new Response("Missing BREVO_API_KEY", { status: 500 });
    if (!FROM_EMAIL)    return new Response("Missing MAIL_FROM_EMAIL", { status: 500 });
    if (NOTIFY_TO.length === 0) return new Response("Missing NOTIFY_TO", { status: 500 });

    const urgent = /critical|serious/i.test(rec.potential_severity ?? "");
    const ref = rec.ref_no != null ? `#${rec.ref_no}` : "";
    const subject = `${injury ? "🚑 INJURY — " : ""}${urgent ? "⚠️ " : ""}[RBH Safety] ${rec.report_type ?? "New report"} ${ref}`.trim();
    const reporter = (rec.reporter_name ?? "").trim() || "Anonymous";
    const submitted = rec.created_at ? new Date(rec.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "";
    const langLabel = rec.language === "es" ? "Spanish" : rec.language === "en" ? "English" : (rec.language ?? "");

    const rowsHtml =
      row("Reference", ref) + row("Submitted", submitted) + row("Involves injury", injury ? "Yes" : "") + row("Type", rec.report_type) +
      row("Hazard", rec.hazard_category) + row("Potential severity", rec.potential_severity) +
      row("Description", rec.description) + row("Involved / witnesses", rec.people_involved) +
      row("Immediate action", rec.immediate_action) + row("Suggested fix", rec.suggested_fix) +
      row("Job site", rec.job_site) + row("Location on site", rec.site_location) +
      row("Reported by", reporter) + row("Role", rec.reporter_role) +
      row("Contact", rec.reporter_contact) + row("Form language", langLabel);

    const logoBlock = LOGO_URL
      ? `<img src="${esc(LOGO_URL)}" alt="RBH Insulation" height="44" style="display:block;height:44px;width:auto;border:0">`
      : `<span style="color:#141414;font:800 20px system-ui,sans-serif">RBH <span style="color:#b01e28">Insulation</span></span>`;

    const cta = DASHBOARD_URL
      ? `<div style="padding:4px 12px 8px"><a href="${esc(DASHBOARD_URL)}" style="background:#b01e28;color:#ffffff;text-decoration:none;font:700 15px system-ui,sans-serif;padding:12px 22px;border-radius:8px;display:inline-block">Open the dashboard &rarr;</a></div>`
      : "";

    const html = `<div style="max-width:640px;margin:0 auto;border:1px solid #e5e1db;border-radius:12px;overflow:hidden;font-family:system-ui,sans-serif">
      <div style="background:#ffffff;border-bottom:3px solid #b01e28;padding:16px 20px">${logoBlock}
        <div style="margin-top:8px;font:700 12px system-ui,sans-serif;color:#6c6862;letter-spacing:.4px;text-transform:uppercase">New Safety &amp; Near-Miss Report</div>
      </div>
      ${urgent ? `<div style="background:#b01e28;color:#fff;padding:8px 20px;font:700 13px system-ui,sans-serif">High potential severity &mdash; please review promptly</div>` : ""}
      ${injury ? `<div style="background:#7a1018;color:#fff;padding:10px 20px;font:700 13px system-ui,sans-serif">INJURY REPORTED &mdash; ensure this is handled per company procedure. A serious injury (inpatient hospitalization, amputation, loss of an eye, serious disfigurement, or death) must be reported to Cal/OSHA within 8 hours.</div>` : ""}
      <div style="padding:14px 8px">
        <table style="border-collapse:collapse;width:100%">${rowsHtml}</table>
        ${cta}
        <p style="margin:14px 12px 0;color:#6c6862;font:400 12.5px system-ui,sans-serif">Any photos submitted with this report are viewable in the dashboard. Automated notification from the RBH safety reporting form.</p>
      </div>
    </div>`;

    const text = [subject, "", injury && "*** INJURY REPORTED — a serious injury must be reported to Cal/OSHA within 8 hours. ***", submitted && `Submitted: ${submitted}`, rec.report_type && `Type: ${rec.report_type}`,
      rec.hazard_category && `Hazard: ${rec.hazard_category}`, rec.potential_severity && `Potential severity: ${rec.potential_severity}`,
      rec.description && `\nDescription:\n${rec.description}`, rec.people_involved && `\nInvolved/witnesses: ${rec.people_involved}`,
      rec.immediate_action && `Immediate action: ${rec.immediate_action}`, rec.suggested_fix && `Suggested fix: ${rec.suggested_fix}`,
      `\nReported by: ${reporter}`, rec.reporter_role && `Role: ${rec.reporter_role}`, rec.reporter_contact && `Contact: ${rec.reporter_contact}`,
      DASHBOARD_URL && `\nOpen the dashboard: ${DASHBOARD_URL}`
    ].filter(Boolean).join("\n");

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: NOTIFY_TO.map((email) => ({ email })),
        subject, htmlContent: html, textContent: text,
      }),
    });
    if (!resp.ok) { const d = await resp.text(); console.error("Brevo error", resp.status, d); return new Response(`Email failed: ${resp.status} ${d}`, { status: 502 }); }
    return new Response("ok", { status: 200 });
  } catch (e) { console.error(e); return new Response(`Error: ${e}`, { status: 500 }); }
});
