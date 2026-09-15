import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16384) return reply({ error: "Invalid request" }, 400);

    const { data: ctx, error: contextError } = await createSupabaseContext(req, {
      auth: "user",
    });
    if (contextError || !ctx) {
      return reply(
        { error: contextError?.message || "Unauthorized" },
        contextError?.status || 401,
      );
    }

    try {
      const claims = (ctx.userClaims || {}) as Record<string, unknown>;
      const userId = String(claims.id || claims.sub || "");
      if (!userId) return reply({ error: "Authenticated user identity missing" }, 401);

      const body = await req.json().catch(() => ({}));
      const action = text(body?.action).toLowerCase() || "get";
      const tenantId = text(body?.tenant_id);
      if (!uuidPattern.test(tenantId)) return reply({ error: "Valid tenant_id is required" }, 400);

      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await ctx.supabaseAdmin.rpc(name, args);
        if (error) throw error;
        return data;
      };

      if (action === "get") {
        const privacy = await rpc("platform_server_owner_privacy_profile", {
          p_tenant_id: tenantId,
          p_user_id: userId,
        });
        return reply({ ok: true, privacy });
      }

      if (action === "update") {
        const controllerName = text(body?.controller_name);
        const privacyNoticeUrl = text(body?.privacy_notice_url);
        const noticeVersion = text(body?.notice_version);
        if (!controllerName || !privacyNoticeUrl || !noticeVersion) {
          return reply(
            {
              error:
                "controller_name, privacy_notice_url and notice_version are required",
            },
            400,
          );
        }

        const privacy = await rpc("platform_server_owner_update_privacy_profile", {
          p_tenant_id: tenantId,
          p_user_id: userId,
          p_controller_name: controllerName,
          p_privacy_contact_email: text(body?.privacy_contact_email) || null,
          p_privacy_notice_url: privacyNoticeUrl,
          p_notice_version: noticeVersion,
          p_effective_at: text(body?.effective_at) || null,
        });

        return reply({ ok: true, privacy });
      }

      return reply({ error: "Unknown action" }, 400);
    } catch (error) {
      const record =
        error && typeof error === "object"
          ? (error as Record<string, unknown>)
          : {};
      const message =
        error instanceof Error
          ? error.message
          : text(record.message) ||
            text(record.details) ||
            text(record.hint) ||
            "Privacy profile request failed";
      console.error("agency-privacy", error);
      return reply({ error: message }, 500);
    }
  },
};
