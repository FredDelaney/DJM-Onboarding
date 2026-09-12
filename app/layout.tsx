import './globals.css';
import './admin-polish.css';
import './player-21.css';
import './dossier.css';
import './club-share.css';
import './profile-21.css';
import './ux-smooth.css';
import './player-premium.css';
import './player-nav-contrast-fix.css';
import './(djm-os)/djm-os.css';
import './workspace-nav.css';
import './responsive-polish.css';
import './iphone-qa.css';
import './djm-os-ux-overhaul.css';
import './djm-global-beauty.css';
import './staff-mobile-layout-fix.css';
import './djm-os-v3.css';
import './tenant-theme.css';

import type {
  Metadata,
  Viewport,
} from 'next';
import { headers } from 'next/headers';

import {
  cache,
  type CSSProperties,
} from 'react';

import {
  TenantRuntimeProvider,
} from '../components/TenantRuntimeProvider';

import {
  resolveTenantRuntime,
} from '../lib/tenant-runtime';

const getRequestTenantRuntime = cache(
  async () => {
    const requestHeaders = await headers();

    const hostname =
      requestHeaders.get(
        'x-forwarded-host',
      ) ||
      requestHeaders.get('host');

    return resolveTenantRuntime(
      hostname,
    );
  },
);

export async function generateMetadata():
  Promise<Metadata> {
  const runtime =
    await getRequestTenantRuntime();

  const isDjm =
    runtime.slug ===
    'djm-sports-management';

  const title =
    runtime.branding.portal_name ||
    runtime.branding.short_name ||
    runtime.branding.display_name;

  const description = isDjm
    ? 'Private career app by DJM Sports Management'
    : `Private player and agency platform by ${runtime.branding.display_name}`;

  const favicon =
    runtime.branding.favicon_asset;

  return {
    title,
    description,
    manifest: '/manifest.webmanifest',
    icons: favicon
      ? {
          icon: favicon,
          apple: favicon,
        }
      : {
          icon: [
            {
              url: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              url: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
          apple:
            '/apple-touch-icon.png',
        },
    appleWebApp: {
      capable: true,
      title,
      statusBarStyle:
        'black-translucent',
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export async function generateViewport():
  Promise<Viewport> {
  const runtime =
    await getRequestTenantRuntime();

  return {
    themeColor:
      runtime.branding.primary_color,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtime =
    await getRequestTenantRuntime();

  const tenantStyle = {
    '--tenant-primary':
      runtime.branding.primary_color,
    '--tenant-secondary':
      runtime.branding.secondary_color,
    '--tenant-accent':
      runtime.branding.accent_color,
  } as CSSProperties;

  return (
    <html
      lang={
        runtime.settings.locale ||
        'en-GB'
      }
      data-scroll-behavior="smooth"
      data-tenant={runtime.slug}
      data-tenant-plan={
        runtime.plan.key || 'unknown'
      }
      data-tenant-resolved={
        runtime.resolved
          ? 'true'
          : 'false'
      }
      style={tenantStyle}
    >
      <body>
        <TenantRuntimeProvider
          runtime={runtime}
        >
          {children}
        </TenantRuntimeProvider>
      </body>
    </html>
  );
}
