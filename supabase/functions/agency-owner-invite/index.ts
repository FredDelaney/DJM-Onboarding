import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const tokenPattern = /^[0-9a-f]{64}$/i;

export default { fetch: async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { data: ctx, error: contextError } = await createSupabaseContext(req, { auth: "user" });
  if (contextError || !ctx) return reply({ error: contextError?.message || "Unauthorized" }, contextError?.status || 401);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!tokenPattern.test(token)) return reply({ error: "Invalid invitation" }, 400);

    const claims = (ctx.userClaims || {}) as Record<string, unknown>;
    const userId = String(claims.id || claims.sub || "");
    const claimEmail = String(claims.email || "").trim().toLowerCase();
    if (!userId) return reply({ error: "Authenticated user identity missing" }, 401);

    const { data: invite, error: inviteError } = await ctx.supabaseAdmin.rpc("platform_server_public_owner_invite_preflight", { p_token: token });
    if (inviteError) throw inviteError;
    if (!invite) return reply({ error: "This invitation is no longer valid" }, 400);

    const inviteEmail = String(invite.email || "").trim().toLowerCase();
    let email = claimEmail;
    if (!email) {
      const { data: userData, error: userError } = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
      if (userError) throw userError;
      email = String(userData?.user?.email || "").trim().toLowerCase();
    }
    if (!email || email !== inviteEmail) return reply({ error: "Sign in with the email address that received this invitation" }, 403);

    const { data: completion, error: completionError } = await ctx.supabaseAdmin.rpc("platform_server_complete_owner_invite", {
      p_token: token,
      p_email: email,
      p_user_id: userId,
      p_accepted_at: new Date().toISOString(),
    });
    if (completionError) throw completionError;

    return reply({ ok: true, account_created: false, workspace: completion });
  } catch (error) {
    console.error("agency-owner-invite", error);
    const message = error instanceof Error ? error.message : "Unable to accept agency invitation";
    return reply({ error: message }, 500);
  }
}};
