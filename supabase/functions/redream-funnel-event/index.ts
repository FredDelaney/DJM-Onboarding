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

const events = new Set([
  "page_view",
  "section_view",
  "scenario_select",
  "scenario_run",
  "scenario_complete",
  "product_mode",
  "cta_click",
  "demo_open",
  "demo_step_2",
  "demo_submit",
]);

const scenarios = new Set(["club", "player", "deal", "relationship"]);

const allowedHost = (host: string) =>
  host === "redreamsystems.com" ||
  host === "www.redreamsystems.com" ||
  host.endsWith(".vercel.app") ||
  host === "localhost" ||
  host === "127.0.0.1";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 8192) return reply({ error: "Invalid request" }, 400);

    const body = await req.json().catch(() => ({}));
    const clientEventId = text(body?.client_event_id, 40);
    const sessionId = text(body?.session_id, 40);
    const eventName = text(body?.event_name, 60);
    const sourceHost = text(body?.source_host, 255)?.toLowerCase() || "";
    const scenarioKind = text(body?.scenario_kind, 40)?.toLowerCase() || null;

    if (
      !clientEventId ||
      !sessionId ||
      !uuid.test(clientEventId) ||
      !uuid.test(sessionId) ||
      !eventName ||
      !events.has(eventName)
    ) {
      return reply({ error: "Invalid event" }, 400);
    }

    if (!allowedHost(sourceHost)) {
      return reply({ ok: true, ignored: true });
    }

    const origin = text(req.headers.get("origin"), 500);
    if (origin) {
      try {
        if (!allowedHost(new URL(origin).hostname.toLowerCase())) {
          return reply({ ok: true, ignored: true });
        }
      } catch {
        return reply({ ok: true, ignored: true });
      }
    }

    if (scenarioKind && !scenarios.has(scenarioKind)) {
      return reply({ error: "Invalid scenario" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Service unavailable" }, 503);

    const admin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const { error } = await admin.rpc("platform_server_create_funnel_event", {
      p_input: {
        client_event_id: clientEventId,
        session_id: sessionId,
        event_name: eventName,
        section_key: text(body?.section_key, 80),
        scenario_kind: scenarioKind,
        cta_key: text(body?.cta_key, 120),
        source_host: sourceHost,
        source_path: text(body?.source_path, 500),
        referrer: text(body?.referrer, 1000),
        utm_source: text(body?.utm_source, 160),
        utm_medium: text(body?.utm_medium, 160),
        utm_campaign: text(body?.utm_campaign, 160),
        utm_content: text(body?.utm_content, 160),
        utm_term: text(body?.utm_term, 160),
        metadata: {
          mode: text(metadata?.mode, 80),
          plan: text(metadata?.plan, 80),
          variant: text(metadata?.variant, 80),
        },
      },
    });

    if (error) {
      console.error("redream-funnel-event insert", error.message);
      return reply({ error: "Unable to record event" }, 500);
    }

    return reply({ ok: true });
  } catch (error) {
    console.error(
      "redream-funnel-event",
      error instanceof Error ? error.message : error,
    );
    return reply({ error: "Unable to record event" }, 500);
  }
});
