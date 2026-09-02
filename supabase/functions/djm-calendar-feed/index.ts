import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("DJM_APP_URL") || "https://djm-player.vercel.app";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const icsEscape = (value: unknown) => String(value ?? "")
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,");

const icsDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const buildEvent = (input: { item_id: string; title: string; due_at: string; url: string; kind: string }) => {
  const start = new Date(input.due_at);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fullUrl = `${APP_URL}${input.url}`;
  return [
    "BEGIN:VEVENT",
    `UID:djm-${input.kind}-${input.item_id}@djmsports.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `DESCRIPTION:${icsEscape(`Open this item in DJM: ${fullUrl}`)}`,
    `URL:${icsEscape(fullUrl)}`,
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers });

  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return new Response("Calendar link is invalid", { status: 404, headers });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response("Calendar unavailable", { status: 503, headers });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: subscription, error: subscriptionError } = await db
    .from("calendar_subscriptions")
    .select("user_id,enabled")
    .eq("token", token)
    .maybeSingle();

  if (subscriptionError || !subscription?.enabled) {
    return new Response("Calendar link is invalid", { status: 404, headers });
  }

  const { data: items, error: itemError } = await db.rpc("djm_calendar_feed_items", {
    p_user_id: subscription.user_id,
  });

  if (itemError) {
    console.error("calendar item read failed", itemError.message);
    return new Response("Calendar unavailable", { status: 503, headers });
  }

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DJM Sports Management//DJM Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:DJM",
    "X-WR-CALDESC:Dated actions from DJM Player",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ...(items || []).map(buildEvent),
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="djm-calendar.ics"',
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
});
