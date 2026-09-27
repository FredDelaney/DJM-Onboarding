// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signatureValid(raw: string, supplied: string, secret: string) {
  if (!supplied.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(raw)),
  );
  const expected = "sha256=" +
    Array.from(digest).map((value) => value.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, supplied);
}

const at = (value: unknown, milliseconds = false) => {
  const numeric = Number(value || 0);
  if (!numeric) return null;
  return new Date(numeric * (milliseconds ? 1 : 1000)).toISOString();
};

function whatsappText(message: any) {
  if (message?.type === "text") return String(message?.text?.body || "").trim();
  if (message?.type === "button") return String(message?.button?.text || "").trim();
  if (message?.type === "interactive") {
    return String(
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      "",
    ).trim();
  }
  return "";
}

async function receive(
  admin: any,
  args: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc("redream_messaging_receive", args);
  if (error) throw error;
  return data;
}

async function kickCaptures(
  admin: any,
  supabaseUrl: string,
  captureIds: string[],
) {
  if (!captureIds.length) return;
  const { data: secret, error } = await admin.rpc("get_push_scheduler_secret");
  if (error || !secret) {
    console.error(JSON.stringify({
      operation: "redream_meta_worker_secret",
      status: "unavailable",
    }));
    return;
  }

  await Promise.allSettled(
    captureIds.map((captureId) =>
      fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/redream-ai-process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-djm-cron": String(secret),
          "x-region": "eu-west-1",
        },
        body: JSON.stringify({ capture_id: captureId, mode: "process" }),
      })
    ),
  );
}

Deno.serve(async (req) => {
  const verifyToken = String(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "");
  const appSecrets = [
    String(Deno.env.get("META_APP_SECRET") || "").trim(),
    String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim(),
  ].filter(Boolean);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && challenge && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const suppliedSignature = req.headers.get("x-hub-signature-256") || "";
  const verified = (
    await Promise.all(
      appSecrets.map((secret) =>
        signatureValid(raw, suppliedSignature, secret)
      ),
    )
  ).some(Boolean);

  if (!verified) {
    return new Response("Invalid signature", { status: 401 });
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const payload = JSON.parse(raw || "{}");
    const captures: string[] = [];
    let accepted = 0;

    if (payload?.object === "whatsapp_business_account") {
      for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
          const value = change?.value || {};
          const accountId = String(value?.metadata?.phone_number_id || "");
          const contacts = new Map(
            (value?.contacts || []).map((contact: any) => [
              String(contact?.wa_id || ""),
              String(contact?.profile?.name || ""),
            ]),
          );

          for (const message of value?.messages || []) {
            const from = String(message?.from || "");
            const messageId = String(message?.id || "");
            if (!accountId || !from || !messageId) continue;
            const result = await receive(admin, {
              p_provider: "whatsapp",
              p_external_account_id: accountId,
              p_external_thread_id: from,
              p_external_message_id: messageId,
              p_participant_external_id: from,
              p_participant_label: contacts.get(from) || null,
              p_message_text: whatsappText(message) || null,
              p_occurred_at: at(message?.timestamp),
              p_metadata: { message_type: message?.type || null },
            });
            accepted += result?.accepted ? 1 : 0;
            if (result?.capture_id) captures.push(String(result.capture_id));
          }
        }
      }
    } else if (payload?.object === "instagram") {
      for (const entry of payload?.entry || []) {
        const accountId = String(entry?.id || "");
        for (const event of entry?.messaging || []) {
          const message = event?.message || {};
          if (message?.is_echo) continue;
          const senderId = String(event?.sender?.id || "");
          const messageId = String(message?.mid || "");
          if (!accountId || !senderId || !messageId) continue;

          const result = await receive(admin, {
            p_provider: "instagram",
            p_external_account_id: accountId,
            p_external_thread_id: senderId,
            p_external_message_id: messageId,
            p_participant_external_id: senderId,
            p_participant_label: null,
            p_message_text: String(message?.text || "").trim() || null,
            p_occurred_at: at(event?.timestamp, true),
            p_metadata: {
              has_attachments: Array.isArray(message?.attachments) &&
                message.attachments.length > 0,
            },
          });
          accepted += result?.accepted ? 1 : 0;
          if (result?.capture_id) captures.push(String(result.capture_id));
        }
      }
    }

    if (captures.length) {
      EdgeRuntime.waitUntil(kickCaptures(admin, supabaseUrl, captures));
    }

    return json({ ok: true, accepted, captures: captures.length });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "redream_meta_webhook",
      status: "failed",
      error: error instanceof Error ? error.message : "webhook_processing_failed",
    }));
    return json({ error: "Webhook processing failed" }, 500);
  }
});
