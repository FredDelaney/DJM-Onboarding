// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const expired = (value: unknown) => {
  const milliseconds = Date.parse(String(value || ""));
  return Number.isFinite(milliseconds) && milliseconds <= Date.now();
};

const reconnectError = (payload: any, status: number) => {
  const code = Number(payload?.error?.code || 0);
  const type = String(payload?.error?.type || "").toLowerCase();
  const message = String(
    payload?.error?.message ||
      payload?.error_description ||
      payload?.error ||
      "",
  ).toLowerCase();

  return (
    status === 401 ||
    code === 190 ||
    type.includes("oauthexception") ||
    message.includes("expired") ||
    message.includes("invalid token") ||
    message.includes("invalid oauth")
  );
};

async function markError(
  admin: any,
  target: any,
  message: string,
  reconnect: boolean,
) {
  await admin.rpc(
    "platform_server_messaging_maintenance_error",
    {
      p_tenant_id: target.tenant_id,
      p_user_id: target.user_id,
      p_provider: target.provider,
      p_error: message,
      p_reconnect_required: reconnect,
    },
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const serviceKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suppliedCron =
    req.headers.get("x-redream-cron") ||
    req.headers.get("x-djm-cron") ||
    "";

  const { data: expectedSecret, error: secretError } =
    await admin.rpc("get_push_scheduler_secret");

  if (
    secretError ||
    !expectedSecret ||
    suppliedCron !== expectedSecret
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: targetPayload, error: targetError } =
    await admin.rpc(
      "platform_server_messaging_maintenance_targets",
      { p_limit: 20 },
    );

  if (targetError) {
    return json({ error: "Maintenance targets could not be loaded" }, 500);
  }

  const targets = Array.isArray(targetPayload?.targets)
    ? targetPayload.targets
    : [];

  let refreshed = 0;
  let reconnectRequired = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      const { data: secretData, error: connectionError } =
        await admin.rpc(
          "platform_server_messaging_secret",
          {
            p_tenant_id: target.tenant_id,
            p_user_id: target.user_id,
            p_provider: target.provider,
          },
        );

      if (connectionError || !secretData?.access_token) {
        failed += 1;
        await markError(
          admin,
          target,
          "Messaging access token is unavailable.",
          true,
        );
        reconnectRequired += 1;
        continue;
      }

      if (expired(secretData.token_expires_at)) {
        await markError(
          admin,
          target,
          "Instagram access has expired. Reconnect Instagram.",
          true,
        );
        reconnectRequired += 1;
        continue;
      }

      const refreshUrl = new URL(
        "https://graph.instagram.com/refresh_access_token",
      );
      refreshUrl.searchParams.set(
        "grant_type",
        "ig_refresh_token",
      );
      refreshUrl.searchParams.set(
        "access_token",
        String(secretData.access_token),
      );

      const response = await fetch(refreshUrl);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.access_token) {
        const needsReconnect = reconnectError(
          payload,
          response.status,
        );

        console.error(JSON.stringify({
          operation: "redream_instagram_token_refresh",
          status: response.status,
          provider_error_code: String(payload?.error?.code || ""),
          reconnect_required: needsReconnect,
        }));

        await markError(
          admin,
          target,
          needsReconnect
            ? "Instagram access needs to be reconnected."
            : "Instagram token refresh did not complete.",
          needsReconnect,
        );

        if (needsReconnect) {
          reconnectRequired += 1;
        } else {
          failed += 1;
        }
        continue;
      }

      const expiresIn = Number(payload?.expires_in || 0);
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        failed += 1;
        await markError(
          admin,
          target,
          "Instagram token refresh returned no expiry.",
          false,
        );
        continue;
      }

      const expiresAt = new Date(
        Date.now() + expiresIn * 1000,
      ).toISOString();

      const { error: storeError } = await admin.rpc(
        "platform_server_messaging_refresh_store",
        {
          p_tenant_id: target.tenant_id,
          p_user_id: target.user_id,
          p_provider: "instagram",
          p_access_token: String(payload.access_token),
          p_token_expires_at: expiresAt,
        },
      );

      if (storeError) throw storeError;

      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        operation: "redream_messaging_maintenance_target",
        provider: String(target?.provider || ""),
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "messaging_maintenance_failed",
      }));
    }
  }

  return json({
    ok: true,
    checked: targets.length,
    refreshed,
    reconnect_required: reconnectRequired,
    failed,
  });
});
