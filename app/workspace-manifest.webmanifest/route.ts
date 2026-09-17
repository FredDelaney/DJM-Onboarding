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
      'Content-Type':
        'application/manifest+json; charset=utf-8',
      'Cache-Control':
        'private, no-store, max-age=0',
    },
  });

export async function GET() {
  const requestHeaders =
    await headers();

  const hostname =
    requestHeaders.get(
      'x-forwarded-host',
    ) ||
    requestHeaders.get('host');

  const runtime =
    await resolveTenantRuntime(
      hostname,
    );

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

  const displayName =
    runtime.branding.portal_name ||
    runtime.branding.short_name ||
    runtime.branding.display_name;

  const shortName =
    runtime.branding.short_name ||
    runtime.branding.portal_name ||
    runtime.branding.display_name;

  const manifest:
    Record<string, unknown> = {
      name: displayName,
      short_name: shortName,
      description:
        `Private career app by ${runtime.branding.display_name}`,
      start_url: '/home',
      scope: '/',
      display: 'standalone',
      orientation:
        'portrait-primary',
      background_color:
        runtime.branding
          .secondary_color ||
        '#FFFFFF',
      theme_color:
        runtime.branding
          .primary_color ||
        '#111827',
      categories: [
        'sports',
        'business',
      ],
    };

  const iconAsset =
    runtime.branding
      .favicon_asset;

  if (iconAsset) {
    const iconBundle =
      iconAsset.startsWith('/')
        ? iconAsset.match(
            /^(.*\/)?icon-512\.png$/,
          )
        : null;

    if (iconBundle) {
      const iconBase =
        iconBundle[1] || '/';

      manifest.icons = [
        {
          src:
            `${iconBase}icon-192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: iconAsset,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src:
            `${iconBase}icon-maskable-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ];
    } else {
      manifest.icons = [
        {
          src: iconAsset,
          purpose: 'any',
        },
      ];
    }
  }

  return json(manifest);
}
