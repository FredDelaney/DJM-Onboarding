export type TenantFeatureRuntime = {
  enabled: boolean;
};

export type TenantRuntime = {
  resolved: boolean;
  tenant_id: string | null;
  slug: string;
  tenant_type: string;
  runtime_version: number;
  branding: {
    display_name: string;
    short_name: string | null;
    portal_name: string | null;
    logo_asset: string | null;
    compact_logo_asset: string | null;
    light_logo_asset: string | null;
    favicon_asset: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    support_email: string | null;
    website_url: string | null;
    phone: string | null;
  };
  domain: {
    hostname: string | null;
    domain_type: string | null;
  };
  plan: {
    key: string | null;
    name: string | null;
    rank: number;
    limits: Record<string, unknown>;
  };
  settings: {
    locale: string;
    timezone: string;
    default_currency: string;
  };
  features: Record<string, TenantFeatureRuntime>;
};

export const UNRESOLVED_TENANT_RUNTIME: TenantRuntime = {
  resolved: false,
  tenant_id: null,
  slug: 'unresolved',
  tenant_type: 'unknown',
  runtime_version: 0,
  branding: {
    display_name: 'Workspace',
    short_name: null,
    portal_name: null,
    logo_asset: null,
    compact_logo_asset: null,
    light_logo_asset: null,
    favicon_asset: null,
    primary_color: '#111827',
    secondary_color: '#FFFFFF',
    accent_color: '#64748B',
    support_email: null,
    website_url: null,
    phone: null,
  },
  domain: {
    hostname: null,
    domain_type: null,
  },
  plan: {
    key: null,
    name: null,
    rank: 0,
    limits: {},
  },
  settings: {
    locale: 'en-GB',
    timezone: 'UTC',
    default_currency: 'EUR',
  },
  features: {},
};

export function isTenantFeatureEnabled(
  runtime: TenantRuntime,
  featureKey: string,
) {
  return (
    runtime.resolved &&
    runtime.features[featureKey]?.enabled ===
      true
  );
}

function asRecord(value: unknown): Record<string, any> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function cleanString(
  value: unknown,
  fallback: string | null = null,
) {
  const text =
    typeof value === 'string'
      ? value.trim()
      : '';

  return text || fallback;
}

function cleanColour(
  value: unknown,
  fallback: string,
) {
  const colour =
    typeof value === 'string'
      ? value.trim()
      : '';

  return /^#[0-9a-f]{6}$/i.test(colour)
    ? colour.toUpperCase()
    : fallback;
}

export function normaliseTenantHostname(
  value: string | null | undefined,
) {
  let hostname = String(value || '')
    .split(',')[0]
    ?.trim()
    .toLowerCase() || '';

  if (!hostname) return null;

  if (hostname.includes('://')) {
    try {
      hostname = new URL(hostname).hostname.toLowerCase();
    } catch {
      return null;
    }
  } else if (hostname.startsWith('[')) {
    const closing = hostname.indexOf(']');

    if (closing > 0) {
      hostname = hostname.slice(1, closing);
    }
  } else {
    hostname = hostname.replace(/:\d+$/, '');
  }

  hostname = hostname.replace(/\.$/, '');

  if (
    !hostname ||
    hostname.length > 253 ||
    !/^[a-z0-9.-]+$/.test(hostname)
  ) {
    return null;
  }

  return hostname;
}

function fallbackRuntime(
  hostname: string | null,
): TenantRuntime {
  return {
    ...UNRESOLVED_TENANT_RUNTIME,
    branding: {
      ...UNRESOLVED_TENANT_RUNTIME.branding,
    },
    domain: {
      ...UNRESOLVED_TENANT_RUNTIME.domain,
      hostname,
    },
    plan: {
      ...UNRESOLVED_TENANT_RUNTIME.plan,
      limits: {},
    },
    settings: {
      ...UNRESOLVED_TENANT_RUNTIME.settings,
    },
    features: {},
  };
}

const TRUSTED_DJM_HOSTNAMES = new Set([
  'app.djmsports.com',
  'djm-player.vercel.app',
  'djm-player-jesseedge10-8415s-projects.vercel.app',
]);

function trustedDjmOutageRuntime(
  hostname: string,
): TenantRuntime | null {
  if (!TRUSTED_DJM_HOSTNAMES.has(hostname)) {
    return null;
  }

  return {
    resolved: true,
    tenant_id: null,
    slug: 'djm-sports-management',
    tenant_type: 'sports_management',
    runtime_version: 0,
    branding: {
      display_name: 'DJM Sports Management',
      short_name: 'DJM',
      portal_name: 'DJM Player',
      logo_asset: null,
      compact_logo_asset: null,
      light_logo_asset: null,
      favicon_asset: null,
      primary_color: '#061F3A',
      secondary_color: '#FFFFFF',
      accent_color: '#F5E900',
      support_email: null,
      website_url: 'https://www.djmsports.com',
      phone: null,
    },
    domain: {
      hostname,
      domain_type:
        hostname === 'app.djmsports.com'
          ? 'custom'
          : 'platform_subdomain',
    },
    plan: {
      key: null,
      name: null,
      rank: 0,
      limits: {},
    },
    settings: {
      locale: 'en-GB',
      timezone: 'Europe/Rome',
      default_currency: 'EUR',
    },
    features: {},
  };
}

function coerceRuntime(
  payload: unknown,
  hostname: string,
): TenantRuntime {
  const source = asRecord(payload);

  if (source.resolved !== true) {
    return fallbackRuntime(hostname);
  }

  const slug = cleanString(source.slug);

  if (!slug) {
    return fallbackRuntime(hostname);
  }

  const branding = asRecord(source.branding);
  const domain = asRecord(source.domain);
  const plan = asRecord(source.plan);
  const settings = asRecord(source.settings);
  const featureSource = asRecord(source.features);

  const features: Record<string, TenantFeatureRuntime> = {};

  for (const [key, value] of Object.entries(featureSource)) {
    const feature = asRecord(value);

    features[key] = {
      enabled: feature.enabled === true,
    };
  }

  return {
    resolved: true,
    tenant_id:
      cleanString(source.tenant_id),
    slug,
    tenant_type:
      cleanString(source.tenant_type) ||
      'agency',
    runtime_version:
      Number(source.runtime_version || 0),
    branding: {
      display_name:
        cleanString(branding.display_name) ||
        'Agency',
      short_name:
        cleanString(branding.short_name),
      portal_name:
        cleanString(branding.portal_name),
      logo_asset:
        cleanString(branding.logo_asset),
      compact_logo_asset:
        cleanString(branding.compact_logo_asset),
      light_logo_asset:
        cleanString(branding.light_logo_asset),
      favicon_asset:
        cleanString(branding.favicon_asset),
      primary_color:
        cleanColour(
          branding.primary_color,
          '#111827',
        ),
      secondary_color:
        cleanColour(
          branding.secondary_color,
          '#FFFFFF',
        ),
      accent_color:
        cleanColour(
          branding.accent_color,
          '#64748B',
        ),
      support_email:
        cleanString(branding.support_email),
      website_url:
        cleanString(branding.website_url),
      phone:
        cleanString(branding.phone),
    },
    domain: {
      hostname:
        cleanString(domain.hostname) ||
        hostname,
      domain_type:
        cleanString(domain.domain_type),
    },
    plan: {
      key:
        cleanString(plan.key),
      name:
        cleanString(plan.name),
      rank:
        Number(plan.rank || 0),
      limits:
        asRecord(plan.limits),
    },
    settings: {
      locale:
        cleanString(settings.locale) ||
        'en-GB',
      timezone:
        cleanString(settings.timezone) ||
        'UTC',
      default_currency:
        cleanString(settings.default_currency) ||
        'EUR',
    },
    features,
  };
}

export async function resolveTenantRuntime(
  rawHostname: string | null | undefined,
): Promise<TenantRuntime> {
  const hostname =
    normaliseTenantHostname(rawHostname);

  if (!hostname) {
    return fallbackRuntime(null);
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const publishableKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    return fallbackRuntime(hostname);
  }

  const endpoint = new URL(
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/platform-tenant-runtime`,
  );

  endpoint.searchParams.set(
    'hostname',
    hostname,
  );

  const requestHeaders: Record<string, string> = {};

  if (publishableKey) {
    requestHeaders.apikey = publishableKey;
  }

  const retryDelays = [0, 150, 500];

  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs),
      );
    }

    try {
      const response = await fetch(endpoint, {
        headers: requestHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });

      if (response.ok) {
        const payload = await response.json();

        return coerceRuntime(
          payload,
          hostname,
        );
      }

      if (response.status < 500) {
        return fallbackRuntime(hostname);
      }
    } catch {
      // Retry transient network and upstream failures.
    }
  }

  return (
    trustedDjmOutageRuntime(hostname) ||
    fallbackRuntime(hostname)
  );
}
