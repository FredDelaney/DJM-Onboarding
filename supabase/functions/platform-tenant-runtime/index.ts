import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control":
        status === 200
          ? "public, max-age=60, stale-while-revalidate=300"
          : "no-store",
    },
  });

function normaliseHostname(value: unknown) {
  let hostname =
    String(value || "")
      .split(",")[0]
      ?.trim()
      .toLowerCase() || "";

  if (!hostname) return null;

  if (hostname.includes("://")) {
    try {
      hostname =
        new URL(hostname)
          .hostname
          .toLowerCase();
    } catch {
      return null;
    }
  } else if (
    hostname.startsWith("[")
  ) {
    const closing =
      hostname.indexOf("]");

    hostname =
      closing > 0
        ? hostname.slice(
            1,
            closing,
          )
        : hostname;
  } else {
    hostname =
      hostname.replace(
        /:\d+$/,
        "",
      );
  }

  hostname =
    hostname.replace(/\.$/, "");

  if (
    !hostname ||
    hostname.length > 253
  ) {
    return null;
  }

  if (
    !/^[a-z0-9.-]+$/.test(
      hostname,
    )
  ) {
    return null;
  }

  return hostname;
}

function safeColour(
  value: unknown,
  fallback: string,
) {
  const candidate =
    String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(
    candidate,
  )
    ? candidate.toUpperCase()
    : fallback;
}

function safeText(value: unknown) {
  const text =
    String(value || "").trim();

  return text
    ? text.slice(0, 500)
    : null;
}

function safeAsset(value: unknown) {
  const text = safeText(value);

  if (!text) return null;

  if (text.startsWith("/")) {
    return text;
  }

  try {
    const url = new URL(text);

    return url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeObject(
  value: unknown,
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<
        string,
        unknown
      >
    : {};
}

function safeFeatures(
  value: unknown,
) {
  const source =
    safeObject(value);

  const output: Record<
    string,
    { enabled: boolean }
  > = {};

  for (
    const [key, item]
    of Object.entries(source)
  ) {
    if (
      !/^[a-z0-9_:-]{1,120}$/i.test(
        key,
      )
    ) {
      continue;
    }

    const feature =
      safeObject(item);

    output[key] = {
      enabled:
        feature.enabled === true,
    };
  }

  return output;
}

Deno.serve(async (request) => {
  if (
    request.method === "OPTIONS"
  ) {
    return new Response(
      "ok",
      { headers: cors },
    );
  }

  if (request.method !== "GET") {
    return json(
      {
        error:
          "Method not allowed",
      },
      405,
    );
  }

  const requestUrl =
    new URL(request.url);

  const hostname =
    normaliseHostname(
      requestUrl.searchParams.get(
        "hostname",
      ),
    );

  if (!hostname) {
    return json(
      {
        error:
          "A valid hostname is required",
      },
      400,
    );
  }

  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    );

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return json(
      {
        error:
          "Server configuration is incomplete",
      },
      500,
    );
  }

  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data,
    error,
  } = await admin.rpc(
    "platform_server_tenant_context",
    {
      p_hostname: hostname,
    },
  );

  if (error) {
    console.error(
      JSON.stringify({
        operation:
          "platform_tenant_runtime",
        hostname,
        error: error.message,
      }),
    );

    return json(
      {
        error:
          "Tenant runtime could not be resolved",
      },
      500,
    );
  }

  if (
    !data ||
    data.status !== "active"
  ) {
    return json(
      {
        resolved: false,
        hostname,
      },
      404,
    );
  }

  const branding =
    safeObject(data.branding);

  const plan =
    safeObject(data.plan);

  const settings =
    safeObject(data.settings);

  const domain =
    safeObject(data.domain);

  return json({
    resolved: true,
    slug:
      safeText(data.slug),
    tenant_type:
      safeText(
        data.tenant_type,
      ),
    runtime_version:
      Number(
        data.runtime_version ||
        0,
      ),
    branding: {
      display_name:
        safeText(
          branding.display_name,
        ) || "Agency",
      short_name:
        safeText(
          branding.short_name,
        ),
      portal_name:
        safeText(
          branding.portal_name,
        ),
      logo_asset:
        safeAsset(
          branding.logo_asset,
        ),
      compact_logo_asset:
        safeAsset(
          branding.compact_logo_asset,
        ),
      light_logo_asset:
        safeAsset(
          branding.light_logo_asset,
        ),
      favicon_asset:
        safeAsset(
          branding.favicon_asset,
        ),
      primary_color:
        safeColour(
          branding.primary_color,
          "#061F3A",
        ),
      secondary_color:
        safeColour(
          branding.secondary_color,
          "#FFFFFF",
        ),
      accent_color:
        safeColour(
          branding.accent_color,
          "#F5E900",
        ),
      support_email:
        safeText(
          branding.support_email,
        ),
      website_url:
        safeAsset(
          branding.website_url,
        ),
      phone:
        safeText(
          branding.phone,
        ),
    },
    domain: {
      hostname:
        safeText(
          domain.hostname,
        ) || hostname,
      domain_type:
        safeText(
          domain.domain_type,
        ),
    },
    plan: {
      key:
        safeText(plan.key),
      name:
        safeText(plan.name),
      rank:
        Number(plan.rank || 0),
      limits:
        safeObject(
          plan.limits,
        ),
    },
    settings: {
      locale:
        safeText(
          settings.locale,
        ) || "en-GB",
      timezone:
        safeText(
          settings.timezone,
        ) || "Europe/Rome",
      default_currency:
        safeText(
          settings.default_currency,
        ) || "EUR",
    },
    features:
      safeFeatures(
        data.features,
      ),
  });
});
