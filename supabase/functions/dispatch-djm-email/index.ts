import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("DJM_APP_URL") || "https://app.djmsports.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 500, headers: cors });
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let authorised = false;
  const cronSecret = req.headers.get("x-djm-cron");
  if (cronSecret) {
    const { data: expected } = await db.rpc("get_push_scheduler_secret");
    if (typeof expected === "string" && expected.length > 20 && cronSecret === expected) authorised = true;
  }
  if (!authorised) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const { data: { user } } = await db.auth.getUser(bearer);
      if (user) {
        const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "admin") authorised = true;
      }
    }
  }
  if (!authorised) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { data: config, error: configError } = await db.rpc("djm_email_delivery_config");
  if (configError || !config?.enabled || !config?.api_key || !config?.from_address) {
    return new Response(JSON.stringify({ configured: false, processed: 0, sent: 0, failed: 0 }), { status: 200, headers: cors });
  }
  if (config.provider !== "resend") {
    return new Response(JSON.stringify({ error: "Unsupported email provider" }), { status: 500, headers: cors });
  }

  const { data: items, error: itemError } = await db.from("email_outbox")
    .select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(25);
  if (itemError) return new Response(JSON.stringify({ error: "Could not read email outbox" }), { status: 500, headers: cors });

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const item of items || []) {
    const { data: userData, error: userError } = await db.auth.admin.getUserById(item.user_id);
    const email = userData?.user?.email;
    if (userError || !email) {
      await db.from("email_outbox").update({
        status: "cancelled",
        attempts: (item.attempts || 0) + 1,
        last_error: "No deliverable email address",
      }).eq("id", item.id);
      cancelled++;
      continue;
    }

    const path = String(item.url || "/home").startsWith("/") ? String(item.url || "/home") : "/home";
    const deepLink = `${APP_URL}${path}`;
    const title = String(item.title || "DJM update");
    const body = String(item.body || "Open DJM Player for the latest update.");
    const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#111827"><div style="max-width:560px;margin:0 auto;padding:32px 18px"><div style="background:#101827;border-radius:18px;padding:28px;color:#fff"><div style="font-size:12px;letter-spacing:.12em;font-weight:700;color:#f5e900">DJM PLAYER</div><h1 style="font-size:24px;line-height:1.2;margin:14px 0 10px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.6;color:#dbe2ee;margin:0 0 24px">${escapeHtml(body)}</p><a href="${escapeHtml(deepLink)}" style="display:inline-block;background:#f5e900;color:#111827;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 18px">Open DJM Player</a></div><p style="font-size:12px;line-height:1.5;color:#6b7280;margin:18px 8px">This reminder was generated from a dated DJM action. Manage reminder preferences inside DJM Player.</p></div></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from_address,
          to: [email],
          subject: title,
          text: `${body}\n\nOpen DJM Player: ${deepLink}`,
          html,
        }),
      });
      const responseText = await response.text();
      if (!response.ok) throw new Error(`Resend ${response.status}: ${responseText.slice(0, 300)}`);
      await db.from("email_outbox").update({
        status: "sent",
        attempts: (item.attempts || 0) + 1,
        last_error: null,
        sent_at: new Date().toISOString(),
      }).eq("id", item.id);
      sent++;
    } catch (error) {
      await db.from("email_outbox").update({
        status: "failed",
        attempts: (item.attempts || 0) + 1,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed",
      }).eq("id", item.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({
    configured: true,
    processed: (items || []).length,
    sent,
    failed,
    cancelled,
  }), { status: 200, headers: cors });
});
