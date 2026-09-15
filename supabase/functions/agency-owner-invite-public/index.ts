import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const tokenPattern = /^[0-9a-f]{64}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPassword = (value: string) => value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16384) return reply({ error: "Invalid request" }, 400);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "preflight").trim().toLowerCase();
    const token = String(body?.token || "").trim();
    if (!tokenPattern.test(token)) return reply({ invite: null }, 200);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Service unavailable" }, 500);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: invite, error: inviteError } = await admin.rpc("platform_server_public_owner_invite_preflight", { p_token: token });
    if (inviteError) {
      console.error("agency-owner-invite-public preflight", inviteError.message);
      return reply({ error: "Unable to validate invitation" }, 500);
    }
    if (!invite) return reply({ invite: null }, 200);

    if (action === "preflight") return reply({ invite });
    if (action !== "register") return reply({ error: "Unknown action" }, 400);

    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const fullName = String(body?.full_name || "").trim().replace(/\s+/g, " ");
    if (!emailPattern.test(email) || email !== String(invite.email || "").toLowerCase()) return reply({ error: "Invitation email does not match" }, 400);
    if (!strongPassword(password)) return reply({ error: "Use at least 12 characters with uppercase, lowercase, a number and a symbol" }, 400);
    if (fullName.length < 2 || fullName.length > 120) return reply({ error: "Enter your full name" }, 400);

    const { data: existingId, error: existingError } = await admin.rpc("platform_server_find_auth_user_by_email", { p_email: email });
    if (existingError) throw existingError;
    if (existingId) return reply({ error: "An account already exists for this email. Sign in to accept the agency invitation.", account_exists: true }, 409);

    let createdUserId: string | null = null;
    try {
      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          invitation_kind: "agency_owner",
          invited_tenant_id: invite?.tenant?.id || null,
        },
      });
      if (userError || !userData.user) return reply({ error: userError?.message || "Unable to create account" }, 400);
      createdUserId = userData.user.id;

      const { data: completion, error: completionError } = await admin.rpc("platform_server_complete_owner_invite", {
        p_token: token,
        p_email: email,
        p_user_id: createdUserId,
        p_accepted_at: new Date().toISOString(),
      });
      if (completionError) throw completionError;
      createdUserId = null;
      return reply({ ok: true, account_created: true, workspace: completion });
    } catch (error) {
      if (createdUserId) {
        const cleanup = await admin.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) console.error("agency owner orphan cleanup", cleanup.error.message);
      }
      throw error;
    }
  } catch (error) {
    console.error("agency-owner-invite-public", error);
    return reply({ error: "Unable to complete agency invitation" }, 500);
  }
});
