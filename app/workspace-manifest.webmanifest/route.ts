import { headers } from 'next/headers';

import { resolveTenantRuntime } from '@/lib/tenant-runtime';

export const dynamic = 'force-dynamic';

const json = (
  body: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });

export async function GET() {
  const requestHeaders = await headers();
  const hostname =
    requestHeaders.get('x-forwarded-host') ||
    requestHeaders.get('host');

  const runtime = await resolveTenantRuntime(hostname);

  if (!runtime.resolved) {
    return json(
      {
        name: 'Workspace',
        short_name: 'Workspace',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#111827',
        background_color: '#FFFFFF',
      },
      404,
    );
  }

  const isDjm = runtime.slug === 'djm-sports-management';
  const displayName =
    runtime.branding.portal_name ||
    runtime.branding.short_name ||
    runtime.branding.display_name;
  const shortName =
    runtime.branding.short_name ||
    runtime.branding.portal_name ||
    runtime.branding.display_name;

  const manifest: Record<string, unknown> = {
    name: displayName,
    short_name: shortName,
    description: isDjm
      ? 'Private career app by DJM Sports Management'
      : `Private player and agency workspace by ${runtime.branding.display_name}`,
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color:
      runtime.branding.secondary_color || '#FFFFFF',
    theme_color:
      runtime.branding.primary_color || '#111827',
    categories: ['sports', 'business'],
  };

  if (isDjm) {
    manifest.icons = [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ];
  }

  return json(manifest);
}
