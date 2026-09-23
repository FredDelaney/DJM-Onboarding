import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const text = (value: unknown, max: number) => {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const email =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const staffBands = new Set(["1-5", "6-15", "16-30", "31+"]);
const playerBands = new Set(["1-40", "41-100", "101-250", "251+"]);
const planKeys = new Set(["agency", "pro", "elite", "enterprise"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 32768) return reply({ error: "Invalid request" }, 400);

    const body = await req.json().catch(() => ({}));

    if (String(body?.company_website || "").trim()) {
      return reply({ ok: true });
    }

    const clientRequestId = String(body?.client_request_id || "").trim();
    const fullName = text(body?.full_name, 120);
    const requesterEmail = text(body?.email, 320)?.toLowerCase() || null;
    const agencyName = text(body?.agency_name, 160);
    const websiteUrl = text(body?.website_url, 500);
    const staffSize = text(body?.staff_size, 20);
    const playerCount = text(body?.player_count, 20);
    const priority = text(body?.priority, 2000);
    const requestedPlan = text(body?.requested_plan, 30)?.toLowerCase() || null;
    const sourceHost = text(body?.source_host, 255)?.toLowerCase() || null;
    const sourcePath = text(body?.source_path, 500);
    const referrer = text(body?.referrer, 1000);

    if (!uuid.test(clientRequestId)) {
      return reply({ error: "Unable to submit this request" }, 400);
    }
    if (!fullName || fullName.length < 2) {
      return reply({ error: "Enter your name" }, 400);
    }
    if (!requesterEmail || !email.test(requesterEmail)) {
      return reply({ error: "Enter a valid work email" }, 400);
    }
    if (!agencyName || agencyName.length < 2) {
      return reply({ error: "Enter your agency name" }, 400);
    }
    if (!staffSize || !staffBands.has(staffSize)) {
      return reply({ error: "Select your team size" }, 400);
    }
    if (!playerCount || !playerBands.has(playerCount)) {
      return reply({ error: "Select your represented-player range" }, 400);
    }
    if (requestedPlan && !planKeys.has(requestedPlan)) {
      return reply({ error: "Invalid plan selection" }, 400);
    }
    if (body?.consent !== true) {
      return reply({ error: "Consent is required so ReDream can respond to this enquiry" }, 400);
    }

    let normalizedWebsite: string | null = null;
    if (websiteUrl) {
      try {
        const parsed = new URL(websiteUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return reply({ error: "Enter a valid agency website" }, 400);
        }
        normalizedWebsite = parsed.toString().slice(0, 500);
      } catch {
        return reply({ error: "Enter a valid agency website" }, 400);
      }
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      return reply({ error: "Service unavailable" }, 503);
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const payload = {
      client_request_id: clientRequestId,
      full_name: fullName,
      email: requesterEmail,
      agency_name: agencyName,
      website_url: normalizedWebsite,
      staff_size: staffSize,
      player_count: playerCount,
      priority,
      requested_plan: requestedPlan,
      source_host: sourceHost,
      source_path: sourcePath,
      referrer,
      user_agent: text(req.headers.get("user-agent"), 500),
      consent_at: new Date().toISOString(),
    };

    const { error: insertError } = await admin
      .schema("platform")
      .from("demo_requests")
      .insert(payload);

    if (insertError && insertError.code !== "23505") {
      console.error("redream-demo-request insert", insertError.message);
      return reply({ error: "Unable to save the demo request" }, 500);
    }

    return reply({
      ok: true,
      request_received: true,
      truth_contract: {
        account: "No agency account, trial or subscription is created by this request.",
        contact: "The submitted details are recorded so ReDream Systems can respond to the enquiry.",
      },
    });
  } catch (error) {
    console.error(
      "redream-demo-request",
      error instanceof Error ? error.message : error,
    );
    return reply({ error: "Unable to save the demo request" }, 500);
  }
});
