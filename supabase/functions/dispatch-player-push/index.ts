import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function pushTag(item: any) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  if (payload.task_id) return `djm-task-${payload.task_id}`;
  if (payload.request_id) return `djm-request-${payload.request_id}`;
  if (payload.capture_id) return `djm-tell-${payload.capture_id}`;
  if (payload.player_id) return `djm-player-${payload.player_id}-${item.kind || "attention"}`;
  return `djm-${item.kind || item.id}`;
}

function pushUrgency(kind: string) {
  return ["player_message", "checkin_signal", "tell_djm_attention"].includes(kind) ? "high" : "normal";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 500, headers: cors });
  const db = createClient(url, service, { auth: { persistSession: false } });

  let authorised = false;
  const cronSecret = req.headers.get("x-djm-cron");
  if (cronSecret) {
    const { data: expected, error } = await db.rpc("get_push_scheduler_secret");
    if (!error && typeof expected === "string" && expected.length > 20 && cronSecret === expected) authorised = true;
  }
  if (!authorised) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data: { user }, error: userError } = await db.auth.getUser(token);
      if (!userError && user) {
        const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "admin") authorised = true;
      }
    }
  }
  if (!authorised) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { data: config, error: configError } = await db.rpc("get_web_push_config");
  const cfg = Array.isArray(config) ? config[0] : config;
  if (configError || !cfg?.public_key || !cfg?.private_key) {
    return new Response(JSON.stringify({ error: "Push configuration missing" }), { status: 500, headers: cors });
  }
  webpush.setVapidDetails(cfg.subject, cfg.public_key, cfg.private_key);

  const { data: items, error: itemsError } = await db.from("notification_outbox").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(50);
  if (itemsError) return new Response(JSON.stringify({ error: "Could not read outbox" }), { status: 500, headers: cors });

  let sent = 0, failed = 0, cancelled = 0;
  for (const item of items || []) {
    const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_secret").eq("user_id", item.user_id).eq("enabled", true);
    if (!subs?.length) {
      await db.from("notification_outbox").update({ status: "cancelled", attempts: (item.attempts || 0) + 1, last_error: "No active push subscription" }).eq("id", item.id);
      cancelled += 1;
      continue;
    }

    let delivered = 0;
    const errors: string[] = [];
    const tag = pushTag(item);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
          JSON.stringify({ title: item.title, body: item.body, url: item.url, tag, kind: item.kind, payload: item.payload || {} }),
          { TTL: item.kind === "player_message" ? 21600 : 3600, urgency: pushUrgency(item.kind || "") },
        );
        delivered += 1;
      } catch (error: any) {
        const code = error?.statusCode || error?.status;
        errors.push(`${code || "error"}: ${error?.message || "push failed"}`);
        if (code === 404 || code === 410) {
          await db.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }

    if (delivered > 0) {
      await db.from("notification_outbox").update({ status: "sent", attempts: (item.attempts || 0) + 1, last_error: errors.length ? errors.join(" | ") : null, sent_at: new Date().toISOString() }).eq("id", item.id);
      sent += 1;
    } else {
      await db.from("notification_outbox").update({ status: "failed", attempts: (item.attempts || 0) + 1, last_error: errors.join(" | ") || "Delivery failed" }).eq("id", item.id);
      failed += 1;
    }
  }

  return new Response(JSON.stringify({ processed: (items || []).length, sent, failed, cancelled }), { status: 200, headers: cors });
});
