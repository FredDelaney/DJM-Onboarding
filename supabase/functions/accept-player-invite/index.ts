import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let createdUserId: string | null = null;

  try {
    const {
      token,
      email,
      password,
      privacy_notice_version,
      privacy_acknowledged,
    } = await req.json();

    const tokenValue = String(token || "").trim();
    const emailValue = String(email || "")
      .trim()
      .toLowerCase();
    const passwordValue = String(password || "");
    const noticeVersion = String(privacy_notice_version || "").trim();
    const strongPassword =
      passwordValue.length >= 12 &&
      /[a-z]/.test(passwordValue) &&
      /[A-Z]/.test(passwordValue) &&
      /\d/.test(passwordValue) &&
      /[^A-Za-z0-9]/.test(passwordValue);

    if (!tokenValue || !emailValue || !strongPassword) {
      return reply(
        {
          error:
            "Use at least 12 characters with uppercase, lowercase, a number and a symbol",
        },
        400,
      );
    }

    if (!noticeVersion || privacy_acknowledged !== true) {
      return reply(
        {
          error:
            "Please review and accept the current Privacy Notice before continuing",
        },
        400,
      );
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: preflight, error: preflightError } = await admin.rpc(
      "platform_server_public_invite_preflight",
      { p_token: tokenValue },
    );
    if (preflightError) throw preflightError;

    if (!preflight?.valid || preflight?.email?.toLowerCase() !== emailValue) {
      return reply({ error: "This invitation is no longer valid" }, 400);
    }

    if (!preflight?.can_activate || preflight?.privacy?.ready !== true) {
      return reply(
        {
          error:
            "This agency must finish its privacy setup before player access can be activated",
          privacy_not_ready: true,
        },
        409,
      );
    }

    const expectedNoticeVersion = String(
      preflight?.privacy?.noticeVersion || "",
    ).trim();

    if (!expectedNoticeVersion || noticeVersion !== expectedNoticeVersion) {
      return reply(
        {
          error:
            "The Privacy Notice changed before activation. Please review the current notice and try again.",
          privacy_notice_changed: true,
        },
        409,
      );
    }

    const { data: invite, error: inviteError } = await admin
      .from("player_invites")
      .select("id,email,status,expires_at,player_id")
      .eq("token", tokenValue)
      .maybeSingle();

    if (
      inviteError ||
      !invite ||
      invite.status !== "pending" ||
      new Date(invite.expires_at).getTime() <= Date.now() ||
      invite.email.toLowerCase() !== emailValue
    ) {
      return reply({ error: "This invitation is no longer valid" }, 400);
    }

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id,tenant_id,first_name,last_name,preferred_name,user_id")
      .eq("id", invite.player_id)
      .maybeSingle();

    if (playerError || !player) {
      return reply({ error: "The invited player record is unavailable" }, 400);
    }

    if (player.user_id) {
      return reply(
        {
          error:
            "This player account is already linked. Please sign in instead.",
        },
        409,
      );
    }

    const { data: recover, error: recoverError } = await admin.rpc(
      "platform_server_recoverable_invite_auth_user",
      { p_token: tokenValue, p_email: emailValue },
    );
    if (recoverError) throw recoverError;

    let userId: string | null = recover?.recoverable
      ? String(recover.user_id || "")
      : null;

    if (!userId) {
      const fullName =
        [player.first_name, player.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        player.preferred_name?.trim() ||
        "Player";

      const acknowledgedAt = new Date().toISOString();
      const { data: userData, error: userError } =
        await admin.auth.admin.createUser({
          email: emailValue,
          password: passwordValue,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            invite_token: tokenValue,
            invited_player_id: player.id,
            invited_tenant_id: player.tenant_id,
            privacy_notice_version: expectedNoticeVersion,
            privacy_notice_controller:
              preflight?.privacy?.controllerName || null,
            privacy_notice_url: preflight?.privacy?.noticeUrl || null,
            privacy_acknowledged: true,
            privacy_notice_acknowledged_at: acknowledgedAt,
          },
        });

      if (userError || !userData.user) {
        return reply(
          { error: userError?.message || "Unable to create player account" },
          400,
        );
      }

      userId = userData.user.id;
      createdUserId = userId;
    }

    const acceptedAt = new Date().toISOString();
    const { data: completion, error: completionError } = await admin.rpc(
      "platform_server_complete_player_invite_acceptance",
      {
        p_token: tokenValue,
        p_email: emailValue,
        p_user_id: userId,
        p_notice_version: expectedNoticeVersion,
        p_accepted_at: acceptedAt,
      },
    );

    if (completionError) {
      if (createdUserId) {
        const cleanup = await admin.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) {
          console.error("orphan auth cleanup failed", cleanup.error.message);
        }
        createdUserId = null;
      }

      return reply(
        {
          error:
            "Unable to finish player account setup. No partial player account has been retained.",
        },
        500,
      );
    }

    createdUserId = null;

    return reply({
      ok: true,
      user_id: userId,
      tenant_id: completion?.tenant_id,
      player_id: completion?.player_id,
      privacy_notice_version: expectedNoticeVersion,
      privacy_notice_mode: completion?.privacy_notice_mode || null,
      recovered_existing_invite_account: Boolean(recover?.recoverable),
    });
  } catch (e) {
    console.error("accept-player-invite", e);
    return reply(
      { error: e instanceof Error ? e.message : "Unable to accept invitation" },
      500,
    );
  }
});
