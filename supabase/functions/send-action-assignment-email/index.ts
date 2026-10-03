// RBH Safety - Workflow Transactional Email (Brevo) V9
// Reuses the existing RBH Brevo project secrets and report_notification_events audit table.
// Supports:
//   investigator_assignment -> assigned Case Owner / Investigator
//   assignment              -> assigned corrective-action owner
//   changes_requested       -> assigned corrective-action owner
//   verifier_assignment     -> specifically assigned Verification Owner
//   verification_requested  -> specifically assigned Verification Owner when present;
//                              otherwise all active Admin + Safety Manager users in the organization
// Full incident details remain behind the authenticated RBH dashboard.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]!));
}

function titleCase(value: unknown) {
  const s = String(value || "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "Not set";
}

function dateOnly(value: unknown, lang = "en") {
  if (!value) return lang === "es" ? "No establecida" : "Not set";
  try {
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    }).format(d);
  } catch {
    return String(value);
  }
}

async function hashText(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function emailCopy(lang: string, data: any, logoUrl: string, notificationType = "assignment") {
  const spanish = lang === "es";
  const changesRequested = notificationType === "changes_requested";
  const verificationRequested = notificationType === "verification_requested";
  const investigatorAssigned = notificationType === "investigator_assignment";
  const verifierAssigned = notificationType === "verifier_assignment";

  let subject = "";
  let intro = "";
  let button = "";
  let footer = "";
  let eyebrow = "";

  if (investigatorAssigned) {
    subject = spanish
      ? `Investigación asignada — Reporte #${data.refNo}`
      : `Investigation assigned — Report #${data.refNo}`;
    intro = spanish
      ? "Se le ha asignado como responsable de la investigación de este reporte. Inicie sesión para revisar el registro y continuar los pasos de investigación que le correspondan."
      : "You have been assigned as the Case Owner / Investigator for this report. Sign in to review the record and continue the investigation steps assigned to you.";
    button = spanish ? "Abrir investigación asignada" : "Open assigned investigation";
    footer = spanish
      ? "Los detalles completos del incidente permanecen protegidos dentro de RBH Safety. Este correo es una notificación automática."
      : "Full incident details remain protected inside RBH Safety. This is an automated notification.";
    eyebrow = spanish ? "Investigación asignada" : "Investigation Assigned";
  } else if (verifierAssigned) {
    subject = spanish
      ? `Verificación asignada — Reporte #${data.refNo}`
      : `Verification assigned — Report #${data.refNo}`;
    intro = spanish
      ? "Se le ha asignado como responsable de verificar la acción correctiva de este reporte."
      : "You have been assigned as the Verification Owner for this report.";
    button = spanish ? "Abrir verificación asignada" : "Open assigned verification";
    footer = spanish
      ? "Inicie sesión en RBH Safety para revisar la nota de finalización y la evidencia, y luego verifique la acción o solicite cambios. Este correo es una notificación automática."
      : "Sign in to RBH Safety to review the completion note and evidence, then verify the action or request changes. This is an automated notification.";
    eyebrow = spanish ? "Verificación asignada" : "Verification Assigned";
  } else if (verificationRequested) {
    subject = spanish
      ? `Revisión requerida: acción correctiva lista para verificar — Reporte #${data.refNo}`
      : `Review needed: corrective action ready for verification — Report #${data.refNo}`;
    intro = data.specificVerifier
      ? (spanish
          ? "Se completó una acción correctiva y fue enviada para verificación. Usted es el responsable de verificación asignado."
          : "A corrective action has been completed and submitted for verification. You are the assigned Verification Owner.")
      : (spanish
          ? "Se completó una acción correctiva y fue enviada para verificación. Está esperando la revisión de un Administrador o Gerente de Seguridad."
          : "A corrective action has been completed and submitted for verification. It is waiting for an Admin or Safety Manager review.");
    button = spanish ? "Revisar acción correctiva" : "Review corrective action";
    footer = spanish
      ? "Inicie sesión en RBH Safety para revisar la nota de finalización y la evidencia, luego verifique la acción o solicite cambios. Este correo es una notificación automática."
      : "Sign in to RBH Safety to review the completion note and evidence, then verify the action or request changes. This is an automated notification.";
    eyebrow = spanish ? "Lista para verificación" : "Ready for Verification";
  } else if (changesRequested) {
    subject = spanish
      ? `Se necesita más evidencia: acción correctiva — Reporte #${data.refNo}`
      : `More evidence needed: corrective action — Report #${data.refNo}`;
    intro = spanish
      ? "Su acción correctiva fue revisada y se devolvió porque se necesita evidencia adicional o una actualización antes de poder verificarla."
      : "Your corrective action was reviewed and returned because additional evidence or an update is needed before it can be verified.";
    button = spanish ? "Abrir registro y actualizar" : "Open record and update";
    footer = spanish
      ? "Inicie sesión en RBH Safety para revisar la solicitud del revisor, agregar o reemplazar evidencia, actualizar el trabajo completado y volver a enviarlo para verificación. Este correo es una notificación automática."
      : "Sign in to RBH Safety to review the reviewer request, add or replace evidence, update the completed work, and resubmit it for verification. This is an automated notification.";
    eyebrow = spanish ? "Se necesita más evidencia" : "Additional Evidence Needed";
  } else {
    subject = spanish
      ? `Acción requerida: acción correctiva asignada — Reporte #${data.refNo}`
      : `Action required: corrective action assigned — Report #${data.refNo}`;
    intro = spanish
      ? "Se le ha asignado una acción correctiva en RBH Safety."
      : "You have been assigned a corrective action in RBH Safety.";
    button = spanish ? "Abrir registro asignado" : "Open assigned record";
    footer = spanish
      ? "Inicie sesión en RBH Safety para revisar el registro completo, agregar evidencia y completar el trabajo asignado. Este correo es una notificación automática."
      : "Sign in to RBH Safety to review the full record, add evidence, and complete the assigned work. This is an automated notification.";
    eyebrow = spanish ? "Acción correctiva asignada" : "Corrective Action Assigned";
  }

  const greeting = spanish ? `Hola ${data.name},` : `Hi ${data.name},`;
  const reportLabel = spanish ? "Reporte" : "Report";
  const actionLabel = spanish ? "Acción correctiva" : "Corrective action";
  const dueLabel = spanish ? "Fecha límite" : "Due date";
  const priorityLabel = spanish ? "Prioridad" : "Priority";
  const reviewerLabel = spanish ? "Lo que se necesita" : "What is needed";
  const submittedByLabel = spanish ? "Enviado por" : "Submitted by";
  const completionLabel = spanish ? "Trabajo completado" : "Completed work";
  const roleLabel = spanish ? "Responsabilidad" : "Responsibility";
  const responsibility = investigatorAssigned
    ? (spanish ? "Responsable de la investigación" : "Case Owner / Investigator")
    : verifierAssigned
      ? (spanish ? "Responsable de verificación" : "Verification Owner")
      : "";

  const text = [
    greeting, "", intro, "",
    `${reportLabel}: #${data.refNo}`,
    responsibility ? `${roleLabel}: ${responsibility}` : "",
    verificationRequested && data.submittedBy ? `${submittedByLabel}: ${data.submittedBy}` : "",
    data.correctiveAction ? `${actionLabel}: ${data.correctiveAction}` : "",
    verificationRequested && data.completionNote ? `${completionLabel}: ${data.completionNote}` : "",
    changesRequested && data.reviewerNote ? `${reviewerLabel}: ${data.reviewerNote}` : "",
    data.correctiveAction ? `${dueLabel}: ${data.dueDate}` : "",
    data.correctiveAction ? `${priorityLabel}: ${data.priority}` : "",
    "",
    data.recordUrl ? `${button}: ${data.recordUrl}` : "",
    "", footer,
  ].filter(Boolean).join("\n");

  const logoBlock = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="RBH Insulation" height="44" style="display:block;height:44px;width:auto;border:0">`
    : `<span style="color:#141414;font:800 20px system-ui,sans-serif">RBH <span style="color:#b01e28">Insulation</span></span>`;

  const cta = data.recordUrl
    ? `<div style="padding-top:4px"><a href="${esc(data.recordUrl)}" style="background:#b01e28;color:#ffffff;text-decoration:none;font:700 15px system-ui,sans-serif;padding:12px 22px;border-radius:8px;display:inline-block">${esc(button)} &rarr;</a></div>`
    : "";

  const reviewerBlock = changesRequested && data.reviewerNote
    ? `<div style="background:#fff3f3;border:1px solid #e6b9bd;border-left:4px solid #b01e28;border-radius:9px;padding:14px 16px;margin-bottom:18px">
        <div style="margin-bottom:6px;color:#7a1018;font:700 13px system-ui,sans-serif">${esc(reviewerLabel)}</div>
        <div style="color:#161616;font:400 14px/1.55 system-ui,sans-serif">${esc(data.reviewerNote).replace(/\n/g, "<br>")}</div>
      </div>`
    : "";

  const completionBlock = verificationRequested && data.completionNote
    ? `<div style="background:#f4f7fb;border:1px solid #dbe3ee;border-left:4px solid #285da8;border-radius:9px;padding:14px 16px;margin-bottom:18px">
        <div style="margin-bottom:6px;color:#204b87;font:700 13px system-ui,sans-serif">${esc(completionLabel)}</div>
        <div style="color:#161616;font:400 14px/1.55 system-ui,sans-serif">${esc(data.completionNote).replace(/\n/g, "<br>")}</div>
      </div>`
    : "";

  const responsibilityBlock = responsibility
    ? `<div style="margin-bottom:10px;color:#161616;font:400 14px system-ui,sans-serif"><strong>${esc(roleLabel)}:</strong> ${esc(responsibility)}</div>`
    : "";
  const actionBlock = data.correctiveAction
    ? `<div style="margin-bottom:10px;color:#161616;font:400 14px/1.5 system-ui,sans-serif"><strong>${esc(actionLabel)}:</strong><br>${esc(data.correctiveAction)}</div>
       <div style="margin-bottom:8px;color:#161616;font:400 14px system-ui,sans-serif"><strong>${esc(dueLabel)}:</strong> ${esc(data.dueDate)}</div>
       <div style="color:#161616;font:400 14px system-ui,sans-serif"><strong>${esc(priorityLabel)}:</strong> ${esc(data.priority)}</div>`
    : "";

  const html = `<div style="max-width:640px;margin:0 auto;border:1px solid #e5e1db;border-radius:12px;overflow:hidden;font-family:system-ui,sans-serif">
    <div style="background:#ffffff;border-bottom:3px solid #b01e28;padding:16px 20px">${logoBlock}
      <div style="margin-top:8px;font:700 12px system-ui,sans-serif;color:#6c6862;letter-spacing:.4px;text-transform:uppercase">${esc(eyebrow)}</div>
    </div>
    <div style="padding:20px">
      <p style="margin:0 0 12px;color:#161616;font:400 15px system-ui,sans-serif">${esc(greeting)}</p>
      <p style="margin:0 0 18px;color:#4d4944;font:400 14px/1.55 system-ui,sans-serif">${esc(intro)}</p>
      ${reviewerBlock}
      ${completionBlock}
      <div style="background:#f7f5f2;border:1px solid #e5e1db;border-radius:9px;padding:14px 16px;margin-bottom:18px">
        <div style="margin-bottom:10px;color:#161616;font:400 14px system-ui,sans-serif"><strong>${esc(reportLabel)}:</strong> #${esc(data.refNo)}</div>
        ${responsibilityBlock}
        ${verificationRequested && data.submittedBy ? `<div style="margin-bottom:10px;color:#161616;font:400 14px system-ui,sans-serif"><strong>${esc(submittedByLabel)}:</strong> ${esc(data.submittedBy)}</div>` : ""}
        ${actionBlock}
      </div>
      ${cta}
      <p style="margin:18px 0 0;color:#6c6862;font:400 12.5px/1.5 system-ui,sans-serif">${esc(footer)}</p>
    </div>
  </div>`;

  return { subject, html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ error: "AUTH_REQUIRED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
  const fromEmail = Deno.env.get("MAIL_FROM_EMAIL") ?? "";
  const fromName = Deno.env.get("MAIL_FROM_NAME") ?? "RBH Safety";
  const dashboardUrl = (Deno.env.get("DASHBOARD_URL") ?? "").trim();
  const logoUrl = (Deno.env.get("LOGO_URL") ?? "").trim();

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "SUPABASE_ENV_MISSING" }, 503);
  if (!brevoApiKey) return json({ error: "MISSING_BREVO_API_KEY" }, 503);
  if (!fromEmail) return json({ error: "MISSING_MAIL_FROM_EMAIL" }, 503);

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "INVALID_SESSION" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const reportId = String(body?.reportId || "").trim();
  const notificationType = String(body?.notificationType || "assignment").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return json({ error: "INVALID_REPORT_ID" }, 400);
  }
  if (!["investigator_assignment", "assignment", "changes_requested", "verifier_assignment", "verification_requested"].includes(notificationType)) {
    return json({ error: "INVALID_NOTIFICATION_TYPE" }, 400);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: callerError } = await service
    .from("profiles")
    .select("id,email,full_name,app_role,is_active,organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerError || !caller || caller.is_active === false) return json({ error: "ACTIVE_PROFILE_REQUIRED" }, 403);
  if (!["admin", "safety_manager", "supervisor"].includes(String(caller.app_role || ""))) return json({ error: "NOT_AUTHORIZED" }, 403);

  const { data: report, error: reportError } = await service
    .from("reports")
    .select("id,ref_no,status,corrective_action,investigator_user_id,assigned_user_id,verifier_user_id,responsible_person,due_date,priority,organization_id,reopen_count,workflow_restart_count,action_status,action_completed_at,action_completed_by,action_completion_note,action_verification_note")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError || !report) return json({ error: "REPORT_NOT_FOUND" }, 404);
  if (!caller.organization_id || String(caller.organization_id) !== String(report.organization_id)) return json({ error: "ORGANIZATION_MISMATCH" }, 403);
  if (notificationType !== "investigator_assignment" && !String(report.corrective_action || "").trim()) return json({ error: "ACTION_PLAN_INCOMPLETE" }, 409);

  const recordUrl = dashboardUrl
    ? `${dashboardUrl}${dashboardUrl.includes("?") ? "&" : "?"}report=${encodeURIComponent(report.id)}`
    : "";

  async function reserveEvent(recipient: any, eventKey: string, logType: string) {
    const { data: existing, error: existingError } = await service
      .from("report_notification_events")
      .select("id,status,created_at,provider_message_id")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existingError) throw new Error(`NOTIFICATION_LOG_UNAVAILABLE:${existingError.message}`);
    if (existing?.status === "sent") return { duplicate: true, eventId: existing.id, messageId: existing.provider_message_id || null };
    if (existing?.status === "sending") {
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) return { inProgress: true, eventId: existing.id };
    }
    if (existing?.id) {
      const { error } = await service.from("report_notification_events").update({
        status: "sending", provider: "brevo", error_message: null, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw new Error("NOTIFICATION_LOG_UPDATE_FAILED");
      return { eventId: existing.id };
    }
    const { data: created, error } = await service.from("report_notification_events").insert({
      organization_id: report.organization_id,
      report_id: report.id,
      notification_type: logType,
      recipient_user_id: recipient.id,
      recipient_email: String(recipient.email).trim(),
      event_key: eventKey,
      provider: "brevo",
      status: "sending",
    }).select("id").single();
    if (error) {
      if (String(error.code || "") === "23505") return { inProgress: true };
      throw new Error(`NOTIFICATION_LOG_INSERT_FAILED:${error.message}`);
    }
    return { eventId: created.id };
  }

  async function sendToRecipient(recipient: any, copy: any, eventId: string) {
    let providerData: any = null;
    try {
      const providerResp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey, "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: String(recipient.email).trim(), name: recipient.full_name || undefined }],
          subject: copy.subject,
          htmlContent: copy.html,
          textContent: copy.text,
          tags: [notificationType === "investigator_assignment" ? "rbh-investigator-assignment" : notificationType === "verifier_assignment" ? "rbh-verifier-assignment" : notificationType === "verification_requested" ? "rbh-action-verification-requested" : notificationType === "changes_requested" ? "rbh-action-changes-requested" : "rbh-action-assignment"],
        }),
      });
      providerData = await providerResp.json().catch(async () => ({ raw: await providerResp.text().catch(() => "") }));
      if (!providerResp.ok) {
        const detail = providerData?.message || providerData?.code || providerData?.raw || `BREVO_${providerResp.status}`;
        throw new Error(String(detail));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (eventId) await service.from("report_notification_events").update({
        status: "failed", error_message: message.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq("id", eventId);
      console.error("Brevo corrective-action notification error", message);
      return { sent: false, error: message };
    }

    const messageId = providerData?.messageId || providerData?.id || null;
    if (eventId) await service.from("report_notification_events").update({
      status: "sent", provider: "brevo", provider_message_id: messageId,
      sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString(),
    }).eq("id", eventId);
    return { sent: true, messageId };
  }

  // Verification-request notifications fan out dynamically to everyone who can verify.
  if (notificationType === "verification_requested") {
    if (String(report.action_status || "") !== "awaiting_verification") return json({ error: "ACTION_NOT_AWAITING_VERIFICATION" }, 409);
    if (!String(report.action_completion_note || "").trim()) return json({ error: "COMPLETION_NOTE_REQUIRED" }, 409);

    let recipients: any[] = [];
    let specificVerifier = false;
    if (report.verifier_user_id) {
      const { data: verifier, error: verifierError } = await service
        .from("profiles")
        .select("id,email,full_name,is_active,preferred_language,organization_id,app_role")
        .eq("id", report.verifier_user_id)
        .maybeSingle();
      if (verifierError) return json({ error: "VERIFIER_LOOKUP_FAILED", detail: verifierError.message }, 503);
      if (!verifier || verifier.is_active === false || !["admin", "safety_manager"].includes(String(verifier.app_role || ""))) {
        return json({ error: "ASSIGNED_VERIFIER_UNAVAILABLE" }, 409);
      }
      if (String(verifier.organization_id) !== String(report.organization_id)) return json({ error: "VERIFIER_ORGANIZATION_MISMATCH" }, 409);
      if (!String(verifier.email || "").trim()) return json({ ok: true, sent: false, skipped: true, reason: "NO_VERIFIER_EMAIL", recipientCount: 0 });
      recipients = [verifier];
      specificVerifier = true;
    } else {
      const { data: reviewers, error: reviewersError } = await service
        .from("profiles")
        .select("id,email,full_name,is_active,preferred_language,organization_id,app_role")
        .eq("organization_id", report.organization_id)
        .eq("is_active", true)
        .in("app_role", ["admin", "safety_manager"]);
      if (reviewersError) return json({ error: "REVIEWER_LOOKUP_FAILED", detail: reviewersError.message }, 503);
      recipients = (reviewers || []).filter((p: any) => String(p.email || "").trim());
      if (!recipients.length) return json({ ok: true, sent: false, skipped: true, reason: "NO_VERIFIER_EMAILS", recipientCount: 0 });
    }

    let submitterName = caller.full_name || caller.email || "RBH user";
    if (report.action_completed_by && String(report.action_completed_by) !== String(caller.id)) {
      const { data: completedBy } = await service.from("profiles").select("id,email,full_name").eq("id", report.action_completed_by).maybeSingle();
      if (completedBy) submitterName = completedBy.full_name || completedBy.email || submitterName;
    }

    let sentCount = 0, duplicateCount = 0, inProgressCount = 0, failedCount = 0;
    const failures: any[] = [];
    for (const recipient of recipients) {
      const fingerprintInput = [
        report.id, recipient.id, String(report.verifier_user_id || "shared"), String(report.action_completed_at || ""),
        String(report.action_completion_note || "").trim(), String(report.reopen_count || 0),
        String(report.workflow_restart_count || 0),
      ].join("|");
      const eventHash = (await hashText(fingerprintInput)).slice(0, 40);
      const eventKey = `action-verification-requested/${report.id}/${recipient.id}/${eventHash}`;
      try {
        const reservation = await reserveEvent(recipient, eventKey, "action_verification_requested");
        if (reservation.duplicate) { duplicateCount++; continue; }
        if (reservation.inProgress || !reservation.eventId) { inProgressCount++; continue; }
        const lang = String(recipient.preferred_language || "en").toLowerCase() === "es" ? "es" : "en";
        const copy = emailCopy(lang, {
          name: recipient.full_name || recipient.email,
          refNo: report.ref_no || String(report.id).slice(0, 8),
          specificVerifier,
          submittedBy: submitterName,
          correctiveAction: String(report.corrective_action).trim(),
          completionNote: String(report.action_completion_note || "").trim(),
          dueDate: dateOnly(report.due_date, lang),
          priority: titleCase(report.priority), recordUrl,
        }, logoUrl, notificationType);
        const sent = await sendToRecipient(recipient, copy, reservation.eventId);
        if (sent.sent) sentCount++; else { failedCount++; failures.push({ recipient: recipient.email, error: sent.error }); }
      } catch (err) {
        failedCount++;
        failures.push({ recipient: recipient.email, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return json({
      ok: failedCount === 0 || sentCount > 0 || duplicateCount > 0,
      sent: sentCount > 0,
      sentCount, duplicateCount, inProgressCount, failedCount,
      recipientCount: recipients.length,
      partial: failedCount > 0 && (sentCount > 0 || duplicateCount > 0),
      failures: failures.slice(0, 5),
    }, failedCount > 0 && sentCount === 0 && duplicateCount === 0 ? 502 : 200);
  }

  // Investigator assignment goes only to the specifically assigned investigator.
  if (notificationType === "investigator_assignment") {
    if (!["admin", "safety_manager"].includes(String(caller.app_role || ""))) return json({ error: "MANAGER_ROLE_REQUIRED" }, 403);
    if (!report.investigator_user_id) return json({ ok: true, sent: false, skipped: true, reason: "NO_INVESTIGATOR" });

    const { data: investigator, error: investigatorError } = await service
      .from("profiles")
      .select("id,email,full_name,is_active,preferred_language,organization_id,app_role")
      .eq("id", report.investigator_user_id)
      .maybeSingle();
    if (investigatorError || !investigator || investigator.is_active === false) return json({ error: "INVESTIGATOR_PROFILE_UNAVAILABLE" }, 409);
    if (!["admin", "safety_manager", "supervisor"].includes(String(investigator.app_role || ""))) return json({ error: "INVALID_INVESTIGATOR_ROLE" }, 409);
    if (String(investigator.organization_id) !== String(report.organization_id)) return json({ error: "INVESTIGATOR_ORGANIZATION_MISMATCH" }, 409);
    if (!String(investigator.email || "").trim()) return json({ ok: true, sent: false, skipped: true, reason: "NO_INVESTIGATOR_EMAIL" });

    const { data: investigatorAudit } = await service
      .from("report_audit")
      .select("created_at")
      .eq("report_id", report.id)
      .eq("field", "investigator_user_id")
      .eq("new_value", investigator.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fingerprintInput = [
      report.id, investigator.id, String(investigatorAudit?.created_at || ""),
      String(report.reopen_count || 0), String(report.workflow_restart_count || 0),
    ].join("|");
    const eventHash = (await hashText(fingerprintInput)).slice(0, 40);
    const eventKey = `investigator-assigned/${report.id}/${investigator.id}/${eventHash}`;

    let reservation;
    try { reservation = await reserveEvent(investigator, eventKey, "investigator_assignment"); }
    catch (err) { return json({ error: "NOTIFICATION_LOG_ERROR", detail: err instanceof Error ? err.message : String(err) }, 503); }
    if (reservation.duplicate) return json({ ok: true, sent: true, duplicate: true, messageId: reservation.messageId || null });
    if (reservation.inProgress || !reservation.eventId) return json({ ok: true, sent: false, skipped: true, reason: "SEND_ALREADY_IN_PROGRESS" });

    const lang = String(investigator.preferred_language || "en").toLowerCase() === "es" ? "es" : "en";
    const copy = emailCopy(lang, {
      name: investigator.full_name || investigator.email,
      refNo: report.ref_no || String(report.id).slice(0, 8),
      recordUrl,
    }, logoUrl, notificationType);
    const result = await sendToRecipient(investigator, copy, reservation.eventId);
    if (!result.sent) return json({ error: "EMAIL_SEND_FAILED", detail: result.error }, 502);
    return json({ ok: true, sent: true, recipient: investigator.email, messageId: result.messageId || null });
  }

  // Verifier assignment goes only to the specifically assigned Verification Owner.
  if (notificationType === "verifier_assignment") {
    if (!["admin", "safety_manager"].includes(String(caller.app_role || ""))) return json({ error: "MANAGER_ROLE_REQUIRED" }, 403);
    if (!report.verifier_user_id) return json({ ok: true, sent: false, skipped: true, reason: "NO_VERIFIER" });
    if (String(report.action_status || "") !== "awaiting_verification") return json({ error: "ACTION_NOT_AWAITING_VERIFICATION" }, 409);

    const { data: verifier, error: verifierError } = await service
      .from("profiles")
      .select("id,email,full_name,is_active,preferred_language,organization_id,app_role")
      .eq("id", report.verifier_user_id)
      .maybeSingle();
    if (verifierError || !verifier || verifier.is_active === false) return json({ error: "VERIFIER_PROFILE_UNAVAILABLE" }, 409);
    if (!["admin", "safety_manager"].includes(String(verifier.app_role || ""))) return json({ error: "INVALID_VERIFIER_ROLE" }, 409);
    if (String(verifier.organization_id) !== String(report.organization_id)) return json({ error: "VERIFIER_ORGANIZATION_MISMATCH" }, 409);
    if (!String(verifier.email || "").trim()) return json({ ok: true, sent: false, skipped: true, reason: "NO_VERIFIER_EMAIL" });

    const { data: verifierAudit } = await service
      .from("report_audit")
      .select("created_at")
      .eq("report_id", report.id)
      .eq("field", "verifier_user_id")
      .eq("new_value", verifier.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fingerprintInput = [
      report.id, verifier.id, String(verifierAudit?.created_at || ""),
      String(report.action_completed_at || ""), String(report.action_completion_note || "").trim(),
      String(report.reopen_count || 0), String(report.workflow_restart_count || 0),
    ].join("|");
    const eventHash = (await hashText(fingerprintInput)).slice(0, 40);
    const eventKey = `verifier-assigned/${report.id}/${verifier.id}/${eventHash}`;

    let reservation;
    try { reservation = await reserveEvent(verifier, eventKey, "verifier_assignment"); }
    catch (err) { return json({ error: "NOTIFICATION_LOG_ERROR", detail: err instanceof Error ? err.message : String(err) }, 503); }
    if (reservation.duplicate) return json({ ok: true, sent: true, duplicate: true, messageId: reservation.messageId || null });
    if (reservation.inProgress || !reservation.eventId) return json({ ok: true, sent: false, skipped: true, reason: "SEND_ALREADY_IN_PROGRESS" });

    const lang = String(verifier.preferred_language || "en").toLowerCase() === "es" ? "es" : "en";
    const copy = emailCopy(lang, {
      name: verifier.full_name || verifier.email,
      refNo: report.ref_no || String(report.id).slice(0, 8),
      correctiveAction: String(report.corrective_action || "").trim(),
      dueDate: dateOnly(report.due_date, lang),
      priority: titleCase(report.priority),
      recordUrl,
    }, logoUrl, notificationType);
    const result = await sendToRecipient(verifier, copy, reservation.eventId);
    if (!result.sent) return json({ error: "EMAIL_SEND_FAILED", detail: result.error }, 502);
    return json({ ok: true, sent: true, recipient: verifier.email, messageId: result.messageId || null });
  }

  // Assignment + changes-requested notifications go to the assigned dashboard user.
  if (!report.assigned_user_id) return json({ ok: true, sent: false, skipped: true, reason: "NO_DASHBOARD_ASSIGNEE" });
  if (notificationType === "changes_requested") {
    if (!["admin", "safety_manager"].includes(String(caller.app_role || ""))) return json({ error: "VERIFIER_ROLE_REQUIRED" }, 403);
    if (String(report.action_status || "") !== "changes_requested") return json({ error: "CHANGES_NOT_REQUESTED" }, 409);
    if (!String(report.action_verification_note || "").trim()) return json({ error: "REVIEWER_NOTE_REQUIRED" }, 409);
  }

  const { data: assignee, error: assigneeError } = await service
    .from("profiles")
    .select("id,email,full_name,is_active,preferred_language,organization_id")
    .eq("id", report.assigned_user_id)
    .maybeSingle();
  if (assigneeError || !assignee || assignee.is_active === false) return json({ error: "ASSIGNEE_PROFILE_UNAVAILABLE" }, 409);
  if (String(assignee.organization_id) !== String(report.organization_id)) return json({ error: "ASSIGNEE_ORGANIZATION_MISMATCH" }, 409);
  if (!String(assignee.email || "").trim()) return json({ ok: true, sent: false, skipped: true, reason: "NO_ASSIGNEE_EMAIL" });

  const fingerprintInput = notificationType === "changes_requested"
    ? [report.id, assignee.id, String(report.action_completed_at || ""), String(report.action_verification_note || "").trim(), String(report.reopen_count || 0), String(report.workflow_restart_count || 0)].join("|")
    : [report.id, assignee.id, String(report.corrective_action || "").trim(), String(report.due_date || ""), String(report.priority || ""), String(report.reopen_count || 0), String(report.workflow_restart_count || 0)].join("|");
  const eventHash = (await hashText(fingerprintInput)).slice(0, 40);
  const eventKey = notificationType === "changes_requested"
    ? `action-changes-requested/${report.id}/${assignee.id}/${eventHash}`
    : `action-assigned/${report.id}/${assignee.id}/${eventHash}`;
  const logType = notificationType === "changes_requested" ? "action_changes_requested" : "action_assignment";

  let reservation;
  try { reservation = await reserveEvent(assignee, eventKey, logType); }
  catch (err) { return json({ error: "NOTIFICATION_LOG_ERROR", detail: err instanceof Error ? err.message : String(err) }, 503); }
  if (reservation.duplicate) return json({ ok: true, sent: true, duplicate: true, messageId: reservation.messageId || null });
  if (reservation.inProgress || !reservation.eventId) return json({ ok: true, sent: false, skipped: true, reason: "SEND_ALREADY_IN_PROGRESS" });

  const lang = String(assignee.preferred_language || "en").toLowerCase() === "es" ? "es" : "en";
  const copy = emailCopy(lang, {
    name: assignee.full_name || assignee.email,
    refNo: report.ref_no || String(report.id).slice(0, 8),
    correctiveAction: String(report.corrective_action).trim(),
    reviewerNote: String(report.action_verification_note || "").trim(),
    dueDate: dateOnly(report.due_date, lang),
    priority: titleCase(report.priority), recordUrl,
  }, logoUrl, notificationType);
  const result = await sendToRecipient(assignee, copy, reservation.eventId);
  if (!result.sent) return json({ error: "EMAIL_SEND_FAILED", detail: result.error }, 502);
  return json({ ok: true, sent: true, recipient: assignee.email, messageId: result.messageId || null });
});
