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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 4096) return reply({ error: "Invalid request" }, 400);

    const body = await req.json().catch(() => null);
    const slug = String(body?.slug || "").trim().toLowerCase();

    if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
      return reply({ data: null }, 200);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const profileResult = await admin
      .from("player_public_profiles")
      .select("*")
      .eq("public_slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data) return reply({ data: null }, 200);

    const playerResult = await admin
      .from("players")
      .select("id,tenant_id,verification_status,verified_at")
      .eq("id", profileResult.data.player_id)
      .maybeSingle();

    if (playerResult.error) throw playerResult.error;

    const player = playerResult.data;
    if (
      !player ||
      player.verification_status !== "verified" ||
      !player.verified_at
    ) {
      return reply({ data: null }, 200);
    }

    const brandingResult = await admin
      .schema("platform")
      .from("tenant_branding")
      .select(
        "display_name,short_name,portal_name,logo_asset,compact_logo_asset,light_logo_asset,primary_color,secondary_color,accent_color,support_email,website_url,phone",
      )
      .eq("tenant_id", player.tenant_id)
      .maybeSingle();

    if (brandingResult.error) throw brandingResult.error;

    return reply({
      data: {
        profile: profileResult.data,
        agency: brandingResult.data || null,
      },
    });
  } catch (error) {
    console.error("player-profile-public", error);
    return reply({ error: "Unable to load Player Profile" }, 500);
  }
});
