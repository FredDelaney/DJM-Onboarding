// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (
  body: unknown,
  status = 200,
) =>
  new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...cors,
        "Content-Type":
          "application/json",
      },
    },
  );

const providerFromPath = (
  pathname: string,
) => {
  const match =
    pathname.match(
      /\/redream-provider-oauth\/(google|microsoft)\/callback\/?$/,
    );

  return match?.[1] || null;
};

const functionBase = (
  url: URL,
) => {
  const marker =
    "/redream-provider-oauth";

  const index =
    url.pathname.indexOf(
      marker,
    );

  if (index < 0) {
    throw new Error(
      "OAuth callback path is unavailable",
    );
  }

  return (
    url.origin +
    url.pathname.slice(
      0,
      index + marker.length,
    )
  );
};

const providerConfig = (
  provider: string,
) => {
  if (provider === "google") {
    return {
      clientId:
        Deno.env.get(
          "GOOGLE_OAUTH_CLIENT_ID",
        ) || "",
      clientSecret:
        Deno.env.get(
          "GOOGLE_OAUTH_CLIENT_SECRET",
        ) || "",
    };
  }

  return {
    clientId:
      Deno.env.get(
        "MICROSOFT_OAUTH_CLIENT_ID",
      ) || "",
    clientSecret:
      Deno.env.get(
        "MICROSOFT_OAUTH_CLIENT_SECRET",
      ) || "",
  };
};

const scopesFor = (
  provider: string,
  capabilities: string[],
) => {
  const requested =
    new Set(capabilities);

  if (provider === "google") {
    const scopes = [
      "openid",
      "email",
      "profile",
    ];

    if (
      requested.has("calendar")
    ) {
      scopes.push(
        "https://www.googleapis.com/auth/calendar.events.readonly",
      );
    }

    if (
      requested.has("contacts")
    ) {
      scopes.push(
        "https://www.googleapis.com/auth/contacts.readonly",
      );
    }

    if (
      requested.has("email")
    ) {
      scopes.push(
        "https://www.googleapis.com/auth/gmail.readonly",
      );
    }

    return scopes;
  }

  const scopes = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
  ];

  if (
    requested.has("calendar")
  ) {
    scopes.push(
      "Calendars.Read",
    );
  }

  if (
    requested.has("contacts")
  ) {
    scopes.push(
      "Contacts.Read",
    );
  }

  if (
    requested.has("email")
  ) {
    scopes.push(
      "Mail.Read",
    );
  }

  return scopes;
};

const redirectWithStatus = (
  returnTo: string,
  provider: string,
  status: "connected" | "error",
) => {
  const target =
    new URL(returnTo);

  target.searchParams.set(
    "connections",
    "1",
  );

  target.searchParams.set(
    "connection_provider",
    provider,
  );

  target.searchParams.set(
    "connection_status",
    status,
  );

  return Response.redirect(
    target,
    303,
  );
};

const tokenExchange = async (
  provider: string,
  code: string,
  redirectUri: string,
  requestedScopes: string[],
) => {
  const config =
    providerConfig(provider);

  if (
    !config.clientId ||
    !config.clientSecret
  ) {
    throw new Error(
      `${provider} OAuth is not configured`,
    );
  }

  const body =
    new URLSearchParams({
      client_id:
        config.clientId,
      client_secret:
        config.clientSecret,
      code,
      redirect_uri:
        redirectUri,
      grant_type:
        "authorization_code",
    });

  const url =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  if (
    provider === "microsoft"
  ) {
    body.set(
      "scope",
      requestedScopes.join(" "),
    );
  }

  const response =
    await fetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body,
      },
    );

  const payload =
    await response.json();

  if (
    !response.ok ||
    !payload?.access_token
  ) {
    throw new Error(
      "Provider token exchange failed",
    );
  }

  return payload;
};

const providerProfile = async (
  provider: string,
  accessToken: string,
) => {
  const url =
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName";

  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    );

  const profile =
    await response.json();

  if (
    !response.ok ||
    !profile
  ) {
    throw new Error(
      "Provider profile could not be read",
    );
  }

  if (provider === "google") {
    return {
      id:
        String(
          profile.sub || "",
        ),
      email:
        String(
          profile.email || "",
        ),
      name:
        String(
          profile.name ||
            profile.email ||
            "Google account",
        ),
    };
  }

  return {
    id:
      String(
        profile.id || "",
      ),
    email:
      String(
        profile.mail ||
          profile.userPrincipalName ||
          "",
      ),
    name:
      String(
        profile.displayName ||
          profile.mail ||
          profile.userPrincipalName ||
          "Microsoft account",
      ),
  };
};

Deno.serve(
  async (req: Request) => {
    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        { headers: cors },
      );
    }

    const url =
      new URL(req.url);

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      );

    const serviceKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    const anonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY",
      );

    if (
      !supabaseUrl ||
      !serviceKey ||
      !anonKey
    ) {
      return json(
        {
          error:
            "Server configuration is incomplete",
        },
        503,
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        serviceKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    const callbackProvider =
      providerFromPath(
        url.pathname,
      );

    if (
      callbackProvider &&
      req.method === "GET"
    ) {
      const state =
        url.searchParams.get(
          "state",
        ) || "";

      if (!state) {
        return json(
          {
            error:
              "OAuth state is missing",
          },
          400,
        );
      }

      const {
        data: context,
        error: consumeError,
      } =
        await admin.rpc(
          "redream_provider_oauth_consume",
          {
            p_state:
              state,
            p_provider:
              callbackProvider,
          },
        );

      if (
        consumeError ||
        !context?.return_to
      ) {
        return json(
          {
            error:
              "This connection request has expired. Reopen ReDream and try again.",
          },
          400,
        );
      }

      if (
        url.searchParams.get(
          "error",
        )
      ) {
        return redirectWithStatus(
          context.return_to,
          callbackProvider,
          "error",
        );
      }

      const code =
        url.searchParams.get(
          "code",
        ) || "";

      if (!code) {
        return redirectWithStatus(
          context.return_to,
          callbackProvider,
          "error",
        );
      }

      try {
        const redirectUri =
          `${functionBase(url)}/${callbackProvider}/callback`;

        const requestedScopes =
          scopesFor(
            callbackProvider,
            context.capabilities || [],
          );

        const tokens =
          await tokenExchange(
            callbackProvider,
            code,
            redirectUri,
            requestedScopes,
          );

        const profile =
          await providerProfile(
            callbackProvider,
            tokens.access_token,
          );

        if (!profile.id) {
          throw new Error(
            "Provider account identity is missing",
          );
        }

        const scopes =
          String(
            tokens.scope || "",
          )
            .split(/\s+/)
            .map(
              (value) =>
                value.trim(),
            )
            .filter(Boolean);

        const {
          error: storeError,
        } =
          await admin.rpc(
            "redream_provider_connection_store",
            {
              p_tenant_id:
                context.tenant_id,
              p_user_id:
                context.user_id,
              p_provider:
                callbackProvider,
              p_external_account_id:
                profile.id,
              p_email:
                profile.email ||
                null,
              p_display_label:
                profile.name ||
                null,
              p_capabilities:
                context.capabilities ||
                [],
              p_scopes:
                scopes,
              p_refresh_token:
                tokens.refresh_token ||
                null,
              p_metadata: {
                token_type:
                  tokens.token_type ||
                  null,
              },
            },
          );

        if (storeError) {
          throw storeError;
        }

        return redirectWithStatus(
          context.return_to,
          callbackProvider,
          "connected",
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            operation:
              "redream_provider_oauth_callback",
            provider:
              callbackProvider,
            error:
              error instanceof Error
                ? error.message
                : "Provider connection failed",
          }),
        );

        return redirectWithStatus(
          context.return_to,
          callbackProvider,
          "error",
        );
      }
    }

    if (req.method !== "POST") {
      return json(
        {
          error:
            "Method not allowed",
        },
        405,
      );
    }

    const authHeader =
      req.headers.get(
        "Authorization",
      ) || "";

    const token =
      authHeader.replace(
        /^Bearer\s+/i,
        "",
      );

    if (!token) {
      return json(
        {
          error:
            "Sign in before connecting an account.",
        },
        401,
      );
    }

    const {
      data: authData,
      error: authError,
    } =
      await admin.auth.getUser(
        token,
      );

    if (
      authError ||
      !authData?.user
    ) {
      return json(
        {
          error:
            "Sign in before connecting an account.",
        },
        401,
      );
    }

    let body: any = {};

    try {
      body =
        await req.json();
    } catch {
      return json(
        {
          error:
            "Invalid request",
        },
        400,
      );
    }

    if (
      body?.action !== "start"
    ) {
      return json(
        {
          error:
            "Unsupported action",
        },
        400,
      );
    }

    const provider =
      String(
        body?.provider || "",
      )
        .trim()
        .toLowerCase();

    if (
      provider !== "google" &&
      provider !== "microsoft"
    ) {
      return json(
        {
          error:
            "Unsupported provider",
        },
        400,
      );
    }

    const workspaceSlug =
      String(
        body?.workspace_slug || "",
      ).trim();

    if (!workspaceSlug) {
      return json(
        {
          error:
            "Workspace is required",
        },
        400,
      );
    }

    const config =
      providerConfig(provider);

    if (
      !config.clientId ||
      !config.clientSecret
    ) {
      return json(
        {
          error:
            `${provider === "google" ? "Google" : "Microsoft"} connection is not configured yet.`,
        },
        503,
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
              "x-redream-workspace":
                workspaceSlug,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    const capabilities =
      Array.isArray(
        body?.capabilities,
      )
        ? body.capabilities
            .map(
              (value: unknown) =>
                String(value)
                  .trim()
                  .toLowerCase(),
            )
            .filter(Boolean)
        : [
            "calendar",
            "contacts",
          ];

    const {
      data: start,
      error: startError,
    } =
      await userClient.rpc(
        "redream_provider_oauth_begin",
        {
          p_provider:
            provider,
          p_capabilities:
            capabilities,
          p_return_to:
            String(
              body?.return_to ||
                "",
            ),
        },
      );

    if (
      startError ||
      !start?.state
    ) {
      return json(
        {
          error:
            startError?.message ||
            "Connection could not be started.",
        },
        403,
      );
    }

    const redirectUri =
      `${functionBase(url)}/${provider}/callback`;

    const scopes =
      scopesFor(
        provider,
        start.capabilities ||
          capabilities,
      );

    let authorizationUrl:
      URL;

    if (provider === "google") {
      authorizationUrl =
        new URL(
          "https://accounts.google.com/o/oauth2/v2/auth",
        );

      authorizationUrl.searchParams.set(
        "access_type",
        "offline",
      );

      authorizationUrl.searchParams.set(
        "include_granted_scopes",
        "true",
      );

      authorizationUrl.searchParams.set(
        "prompt",
        "consent",
      );
    } else {
      authorizationUrl =
        new URL(
          "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        );

      authorizationUrl.searchParams.set(
        "response_mode",
        "query",
      );

      authorizationUrl.searchParams.set(
        "prompt",
        "select_account",
      );
    }

    authorizationUrl.searchParams.set(
      "client_id",
      config.clientId,
    );

    authorizationUrl.searchParams.set(
      "redirect_uri",
      redirectUri,
    );

    authorizationUrl.searchParams.set(
      "response_type",
      "code",
    );

    authorizationUrl.searchParams.set(
      "scope",
      scopes.join(" "),
    );

    authorizationUrl.searchParams.set(
      "state",
      start.state,
    );

    return json({
      authorization_url:
        authorizationUrl.toString(),
      provider,
      capabilities:
        start.capabilities ||
        capabilities,
    });
  },
);
