// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-redream-workspace",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const graphVersion = () =>
  String(Deno.env.get("META_GRAPH_VERSION") || "v26.0").trim();

const canonicalCallback = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/$/, "")}/functions/v1/redream-meta-connect/instagram/callback`;

const safeReturn = (raw: string, status: string, provider: string) => {
  const target = new URL(raw);
  target.searchParams.set("connections", "1");
  target.searchParams.set("connection_status", status);
  target.searchParams.set("connection_provider", provider);
  return target.toString();
};

async function authenticatedContext(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
  anonKey: string,
  workspaceSlug: string,
) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("authentication_required");

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("authentication_required");

  const client = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-redream-workspace": workspaceSlug,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: context, error: contextError } = await client.rpc(
    "redream_messaging_connect_context",
  );
  if (contextError || !context?.tenant_id) throw new Error("workspace_access_denied");

  return { admin, client, context, token };
}

async function exchangeWhatsAppCode(code: string) {
  const appId = String(Deno.env.get("META_APP_ID") || "").trim();
  const appSecret = String(Deno.env.get("META_APP_SECRET") || "").trim();
  if (!appId || !appSecret) throw new Error("meta_not_configured");

  const tokenUrl = new URL(
    `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
  );
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", code);

  const response = await fetch(tokenUrl);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    console.error(JSON.stringify({
      operation: "redream_meta_whatsapp_token_exchange",
      status: response.status,
      provider_error: String(payload?.error?.type || payload?.error || ""),
      provider_error_code: String(payload?.error?.code || ""),
    }));
    throw new Error("meta_token_exchange_failed");
  }
  return payload;
}

async function subscribeWhatsApp(
  wabaId: string,
  accessToken: string,
) {
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(wabaId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    console.error(JSON.stringify({
      operation: "redream_meta_whatsapp_subscribe",
      status: response.status,
      provider_error_code: String(payload?.error?.code || ""),
    }));
    throw new Error("meta_webhook_subscription_failed");
  }
}

async function whatsappLabel(
  phoneNumberId: string,
  accessToken: string,
) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(phoneNumberId)}`,
  );
  url.searchParams.set("fields", "display_phone_number,verified_name");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return phoneNumberId;
  const payload = await response.json().catch(() => ({}));
  return String(
    payload?.verified_name ||
      payload?.display_phone_number ||
      phoneNumberId,
  );
}

async function instagramCallback(req: Request) {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  const appId = String(Deno.env.get("INSTAGRAM_APP_ID") || "").trim();
  const appSecret = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim();
  if (!supabaseUrl || !serviceKey || !appId || !appSecret) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") || "").replace(/#_$/, "").trim();
  const state = String(url.searchParams.get("state") || "").trim();
  if (!code || !state) return json({ error: "Instagram connection was cancelled" }, 400);

  let stateData: any = null;
  try {
    const { data, error } = await admin.rpc("redream_messaging_oauth_consume", {
      p_state: state,
      p_provider: "instagram",
    });
    if (error || !data?.return_to) throw error || new Error("invalid_oauth_state");
    stateData = data;

    const callback = canonicalCallback(supabaseUrl);
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: callback,
      code,
    });

    const shortResponse = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      },
    );
    const shortPayload = await shortResponse.json().catch(() => ({}));
    if (!shortResponse.ok || !shortPayload?.access_token) {
      console.error(JSON.stringify({
        operation: "redream_instagram_short_token",
        status: shortResponse.status,
        provider_error: String(shortPayload?.error_type || shortPayload?.error || ""),
      }));
      throw new Error("instagram_token_exchange_failed");
    }

    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", shortPayload.access_token);
    const longResponse = await fetch(longUrl);
    const longPayload = await longResponse.json().catch(() => ({}));
    const accessToken =
      longResponse.ok && longPayload?.access_token
        ? String(longPayload.access_token)
        : String(shortPayload.access_token);
    const expiresIn = Number(longPayload?.expires_in || 3600);

    const profileUrl = new URL(
      `https://graph.instagram.com/${graphVersion()}/me`,
    );
    profileUrl.searchParams.set("fields", "id,username,name,account_type");
    profileUrl.searchParams.set("access_token", accessToken);
    const profileResponse = await fetch(profileUrl);
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !profile?.id) {
      throw new Error("instagram_profile_lookup_failed");
    }

    const subscribeUrl = new URL(
      `https://graph.instagram.com/${graphVersion()}/${encodeURIComponent(profile.id)}/subscribed_apps`,
    );
    subscribeUrl.searchParams.set(
      "subscribed_fields",
      "messages,messaging_postbacks",
    );
    subscribeUrl.searchParams.set("access_token", accessToken);
    const subscribeResponse = await fetch(subscribeUrl, { method: "POST" });
    const subscribePayload = await subscribeResponse.json().catch(() => ({}));
    if (!subscribeResponse.ok || subscribePayload?.success === false) {
      console.error(JSON.stringify({
        operation: "redream_instagram_subscribe",
        status: subscribeResponse.status,
        provider_error_code: String(subscribePayload?.error?.code || ""),
      }));
      throw new Error("instagram_webhook_subscription_failed");
    }

    const expiresAt = new Date(Date.now() + Math.max(60, expiresIn) * 1000)
      .toISOString();

    const { error: storeError } = await admin.rpc(
      "redream_messaging_connection_store",
      {
        p_tenant_id: stateData.tenant_id,
        p_user_id: stateData.user_id,
        p_provider: "instagram",
        p_external_account_id: String(profile.id),
        p_external_business_id: null,
        p_display_label: String(profile.username || profile.name || "Instagram"),
        p_access_token: accessToken,
        p_scopes: [
          "instagram_business_basic",
          "instagram_business_manage_messages",
        ],
        p_token_expires_at: expiresAt,
        p_metadata: {
          account_type: profile.account_type || null,
          webhook_fields: ["messages", "messaging_postbacks"],
        },
      },
    );
    if (storeError) throw storeError;

    return Response.redirect(
      safeReturn(stateData.return_to, "connected", "instagram"),
      302,
    );
  } catch (error) {
    console.error(JSON.stringify({
      operation: "redream_instagram_connect",
      status: "failed",
      error: error instanceof Error ? error.message : "instagram_connection_failed",
    }));
    if (stateData?.return_to) {
      return Response.redirect(
        safeReturn(stateData.return_to, "error", "instagram"),
        302,
      );
    }
    return json({ error: "Instagram connection did not complete" }, 400);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/instagram/callback")) {
    return instagramCallback(req);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const workspaceSlug = String(body?.workspace_slug || "").trim();
    if (!workspaceSlug) return json({ error: "workspace_slug is required" }, 400);

    const { admin, client, context } = await authenticatedContext(
      req,
      supabaseUrl,
      serviceKey,
      anonKey,
      workspaceSlug,
    );

    if (action === "config") {
      return json({
        ok: true,
        whatsapp_ready: Boolean(
          String(Deno.env.get("META_APP_ID") || "").trim() &&
          String(Deno.env.get("META_APP_SECRET") || "").trim() &&
          String(Deno.env.get("META_WHATSAPP_CONFIG_ID") || "").trim() &&
          String(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "").trim()
        ),
        instagram_ready: Boolean(
          String(Deno.env.get("INSTAGRAM_APP_ID") || "").trim() &&
          String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim() &&
          String(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "").trim()
        ),
      });
    }

    if (action === "whatsapp_config") {
      const appId = String(Deno.env.get("META_APP_ID") || "").trim();
      const configId = String(
        Deno.env.get("META_WHATSAPP_CONFIG_ID") || "",
      ).trim();
      return json({
        ok: true,
        ready: Boolean(
          appId &&
          configId &&
          String(Deno.env.get("META_APP_SECRET") || "").trim() &&
          String(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "").trim()
        ),
        app_id: appId || null,
        config_id: configId || null,
        graph_version: graphVersion(),
      });
    }

    if (action === "whatsapp_finish") {
      const code = String(body?.code || "").trim();
      const wabaId = String(body?.waba_id || "").trim();
      const phoneNumberId = String(body?.phone_number_id || "").trim();
      if (!code || !wabaId || !phoneNumberId) {
        return json({ error: "WhatsApp signup did not return all required details" }, 400);
      }

      const tokenPayload = await exchangeWhatsAppCode(code);
      const accessToken = String(tokenPayload.access_token);
      await subscribeWhatsApp(wabaId, accessToken);
      const displayLabel = await whatsappLabel(phoneNumberId, accessToken);

      const expiresIn = Number(tokenPayload?.expires_in || 0);
      const expiresAt = expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      const { error: storeError } = await admin.rpc(
        "redream_messaging_connection_store",
        {
          p_tenant_id: context.tenant_id,
          p_user_id: context.user_id,
          p_provider: "whatsapp",
          p_external_account_id: phoneNumberId,
          p_external_business_id: wabaId,
          p_display_label: displayLabel,
          p_access_token: accessToken,
          p_scopes: [
            "whatsapp_business_management",
            "whatsapp_business_messaging",
          ],
          p_token_expires_at: expiresAt,
          p_metadata: {
            waba_id: wabaId,
            webhook_subscribed: true,
          },
        },
      );
      if (storeError) throw storeError;

      return json({ ok: true, provider: "whatsapp", status: "connected" });
    }

    if (action === "instagram_start") {
      const appId = String(Deno.env.get("INSTAGRAM_APP_ID") || "").trim();
      const appSecret = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim();
      if (!appId || !appSecret) {
        return json({
          ok: false,
          ready: false,
          error: "Instagram connection needs Meta app setup first.",
        }, 409);
      }

      const returnTo = String(body?.return_to || "").trim();
      const { data: started, error: startError } = await client.rpc(
        "redream_messaging_oauth_begin",
        {
          p_provider: "instagram",
          p_return_to: returnTo,
        },
      );
      if (startError || !started?.state) throw startError || new Error("oauth_start_failed");

      const callback = canonicalCallback(supabaseUrl);
      const authUrl = new URL("https://www.instagram.com/oauth/authorize");
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", callback);
      authUrl.searchParams.set(
        "scope",
        "instagram_business_basic,instagram_business_manage_messages",
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", started.state);
      authUrl.searchParams.set("enable_fb_login", "0");
      authUrl.searchParams.set("force_authentication", "1");

      return json({
        ok: true,
        ready: true,
        authorization_url: authUrl.toString(),
      });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error(JSON.stringify({
      operation: "redream_meta_connect",
      status: "failed",
      error: error instanceof Error ? error.message : "meta_connection_failed",
    }));
    return json({ error: "Connection could not be completed" }, 500);
  }
});
