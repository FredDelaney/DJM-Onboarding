import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PRIVACY_NOTICE_VERSION = "2026-09-02";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  try {
    const { token, email, password, privacy_notice_version } = await req.json();

    const passwordValue = String(password || "");
    const strongPassword =
      passwordValue.length >= 12 &&
      /[a-z]/.test(passwordValue) &&
      /[A-Z]/.test(passwordValue) &&
      /\d/.test(passwordValue) &&
      /[^A-Za-z0-9]/.test(passwordValue);

    if (!token || !email || !strongPassword) {
      return new Response(JSON.stringify({
        error: "Use at least 12 characters with uppercase, lowercase, a number and a symbol",
      }), {
        status: 400,
        headers: cors,
      });
    }

    if (privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
      return new Response(JSON.stringify({
        error: "Please review the DJM Player Privacy Notice before continuing",
      }), {
        status: 400,
        headers: cors,
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invite, error: inviteError } = await admin
      .from("player_invites")
      .select("id,email,status,expires_at,player_id")
      .eq("token", token)
      .maybeSingle();

    if (
      inviteError ||
      !invite ||
      invite.status !== "pending" ||
      new Date(invite.expires_at).getTime() <= Date.now() ||
      invite.email.toLowerCase() !== String(email).toLowerCase()
    ) {
      return new Response(JSON.stringify({ error: "This DJM invitation is no longer valid" }), {
        status: 400,
        headers: cors,
      });
    }

    const { data: player } = await admin
      .from("players")
      .select("first_name,last_name,preferred_name")
      .eq("id", invite.player_id)
      .maybeSingle();

    const fullName =
      [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() ||
      player?.preferred_name?.trim() ||
      "DJM Player";

    const acknowledgedAt = new Date().toISOString();

    const { data, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password: passwordValue,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        invite_token: token,
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_acknowledged_at: acknowledgedAt,
      },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: cors,
      });
    }

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_id: data.user?.id || null,
      action: "privacy_notice_acknowledged",
      entity_type: "players",
      entity_id: invite.player_id,
      metadata: {
        version: PRIVACY_NOTICE_VERSION,
        acknowledged_at: acknowledgedAt,
      },
    });

    if (auditError) {
      console.error("privacy notice audit write failed", auditError.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id: data.user?.id,
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
    }), {
      status: 200,
      headers: cors,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unable to accept invitation",
      }),
      { status: 500, headers: cors },
    );
  }
});
