import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: cors,
  });

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const safeColour = (value: unknown, fallback: string) => {
  const candidate = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate)
    ? candidate.toUpperCase()
    : fallback;
};

const safeHostname = (value: unknown) => {
  const hostname = String(value || "").trim().toLowerCase();
  if (!hostname || hostname.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  return hostname;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !service) {
    return json({ error: "Service unavailable" }, 500);
  }

  const db = createClient(url, service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const suppliedSecret = req.headers.get("x-djm-cron") || "";
  const { data: expectedSecret, error: secretError } = await db.rpc(
    "get_push_scheduler_secret",
  );

  if (
    secretError ||
    !expectedSecret ||
    !suppliedSecret ||
    suppliedSecret !== expectedSecret
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: config, error: configError } = await db.rpc(
    "djm_email_delivery_config",
  );

  if (
    configError ||
    !config?.enabled ||
    !config?.api_key ||
    !config?.from_address
  ) {
    return json({
      configured: false,
      processed: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    });
  }

  if (config.provider !== "resend") {
    return json({ error: "Unsupported email provider" }, 500);
  }

  const { data: items, error: itemError } = await db
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25);

  if (itemError) {
    return json({ error: "Could not read email outbox" }, 500);
  }

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const item of items || []) {
    if (!item.tenant_id) {
      await db
        .from("email_outbox")
        .update({
          status: "cancelled",
          attempts: (item.attempts || 0) + 1,
          last_error: "Missing tenant scope",
        })
        .eq("id", item.id);
      cancelled++;
      continue;
    }

    const { data: tenantContext, error: tenantError } = await db.rpc(
      "platform_server_email_tenant_context",
      { p_tenant_id: item.tenant_id },
    );

    const hostname = safeHostname(
      tenantContext?.domain?.hostname,
    );

    if (tenantError || !tenantContext || !hostname) {
      await db
        .from("email_outbox")
        .update({
          status: "cancelled",
          attempts: (item.attempts || 0) + 1,
          last_error: "Tenant email context unavailable",
        })
        .eq("id", item.id);
      cancelled++;
      continue;
    }

    const branding = tenantContext.branding || {};
    const displayName =
      String(branding.displayName || "Agency").trim() || "Agency";
    const portalName =
      String(
        branding.portalName ||
          branding.shortName ||
          displayName,
      ).trim() || displayName;

    const primary = safeColour(
      branding.primaryColor,
      "#111827",
    );
    const secondary = safeColour(
      branding.secondaryColor,
      "#FFFFFF",
    );
    const accent = safeColour(
      branding.accentColor,
      "#64748B",
    );

    const { data: userData, error: userError } =
      await db.auth.admin.getUserById(item.user_id);
    const email = userData?.user?.email;

    if (userError || !email) {
      await db
        .from("email_outbox")
        .update({
          status: "cancelled",
          attempts: (item.attempts || 0) + 1,
          last_error: "No deliverable email address",
        })
        .eq("id", item.id);
      cancelled++;
      continue;
    }

    const path = String(item.url || "/home").startsWith("/")
      ? String(item.url || "/home")
      : "/home";
    const deepLink = `https://${hostname}${path}`;
    const title = String(item.title || `${portalName} update`);
    const body = String(
      item.body || `Open ${portalName} for the latest update.`,
    );

    const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#111827"><div style="max-width:560px;margin:0 auto;padding:32px 18px"><div style="background:${escapeHtml(primary)};border-radius:18px;padding:28px;color:${escapeHtml(secondary)}"><div style="font-size:12px;letter-spacing:.12em;font-weight:700;color:${escapeHtml(accent)}">${escapeHtml(portalName.toUpperCase())}</div><h1 style="font-size:24px;line-height:1.2;margin:14px 0 10px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.6;opacity:.86;margin:0 0 24px">${escapeHtml(body)}</p><a href="${escapeHtml(deepLink)}" style="display:inline-block;background:${escapeHtml(accent)};color:${escapeHtml(primary)};text-decoration:none;font-weight:700;border-radius:999px;padding:12px 18px">Open ${escapeHtml(portalName)}</a></div><p style="font-size:12px;line-height:1.5;color:#6b7280;margin:18px 8px">This message was sent from ${escapeHtml(displayName)}. Manage reminder preferences inside ${escapeHtml(portalName)}.</p></div></body></html>`;

    try {
      const payload: Record<string, unknown> = {
        from: config.from_address,
        to: [email],
        subject: title,
        text: `${body}\n\nOpen ${portalName}: ${deepLink}`,
        html,
      };

      const supportEmail = String(
        branding.supportEmail || "",
      ).trim();

      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
        payload.reply_to = supportEmail;
      }

      const response = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Resend ${response.status}: ${responseText.slice(0, 300)}`,
        );
      }

      await db
        .from("email_outbox")
        .update({
          status: "sent",
          attempts: (item.attempts || 0) + 1,
          last_error: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      sent++;
    } catch (error) {
      await db
        .from("email_outbox")
        .update({
          status: "failed",
          attempts: (item.attempts || 0) + 1,
          last_error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Email delivery failed",
        })
        .eq("id", item.id);
      failed++;
    }
  }

  return json({
    configured: true,
    processed: (items || []).length,
    sent,
    failed,
    cancelled,
  });
});
