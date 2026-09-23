import {
  normaliseTenantHostname,
} from './tenant-runtime';

const CANONICAL_REDREAM_HOSTS = new Set([
  'redreamsystems.com',
  'www.redreamsystems.com',
]);

const LOCAL_DEVELOPMENT_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
]);

const REDREAM_VERCEL_HOST =
  /^redream-systems(?:-[a-z0-9-]+)?\.vercel\.app$/;

export function isReDreamCanonicalHostname(
  rawHostname: string | null | undefined,
) {
  const hostname =
    normaliseTenantHostname(rawHostname);

  return Boolean(
    hostname &&
      CANONICAL_REDREAM_HOSTS.has(hostname),
  );
}

export function isReDreamVercelHostname(
  rawHostname: string | null | undefined,
) {
  const hostname =
    normaliseTenantHostname(rawHostname);

  return Boolean(
    hostname &&
      REDREAM_VERCEL_HOST.test(hostname),
  );
}

export function shouldRenderReDreamPublicSite(
  rawHostname: string | null | undefined,
  developmentFlag?: string | null,
) {
  const hostname =
    normaliseTenantHostname(rawHostname);

  if (!hostname) return false;

  if (
    CANONICAL_REDREAM_HOSTS.has(hostname) ||
    REDREAM_VERCEL_HOST.test(hostname)
  ) {
    return true;
  }

  return (
    LOCAL_DEVELOPMENT_HOSTS.has(hostname) &&
    Boolean(developmentFlag?.trim())
  );
}
