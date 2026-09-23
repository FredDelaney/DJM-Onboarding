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
  TenantRouteGate,
} from '../components/TenantRouteGate';

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

  if (runtime.resolved) {
    const title =
      runtime.branding.portal_name ||
      runtime.branding.short_name ||
      runtime.branding.display_name;

    const description =
      `Private career app by ${runtime.branding.display_name}`;

    const favicon =
      runtime.branding.favicon_asset;

    const iconBundle =
      favicon?.startsWith('/')
        ? favicon.match(
            /^(.*\/)?icon-512\.png$/,
          )
        : null;

    const iconBase =
      iconBundle
        ? iconBundle[1] || '/'
        : null;

    const icons = favicon
      ? iconBase
        ? {
            icon: [
              {
                url: `${iconBase}icon-192.png`,
                sizes: '192x192',
                type: 'image/png',
              },
              {
                url: favicon,
                sizes: '512x512',
                type: 'image/png',
              },
            ],
            apple:
              `${iconBase}apple-touch-icon.png`,
          }
        : {
            icon: favicon,
            apple: favicon,
          }
      : undefined;

    return {
      title,
      description,
      manifest: '/workspace-manifest.webmanifest',
      icons,
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

  const isReDreamPublicSite = Boolean(
    process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT?.trim(),
  );

  if (isReDreamPublicSite) {
    return {
      metadataBase: new URL('https://redreamsystems.com'),
      title: 'ReDream | Operating system for football agencies',
      description:
        'ReDream connects player service, club demand, relationships, deals, negotiation, follow-up and commission control in one operating system for football agencies.',
      alternates: {
        canonical: '/',
      },
      robots: {
        index: true,
        follow: true,
      },
      openGraph: {
        type: 'website',
        url: '/',
        title: 'ReDream | Operating system for football agencies',
        description:
          'Run player service, market work, relationships, deals and agency revenue from one controlled operating system.',
        siteName: 'ReDream Systems',
      },
    };
  }

  return {
    title: 'Workspace unavailable',
    description:
      'This domain is not connected to an active workspace.',
    robots: {
      index: false,
      follow: false,
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
          {runtime.resolved ? (
            children
          ) : (
            <TenantRouteGate
              fallback={
                <main
                  className="tenant-unresolved-shell"
                  role="main"
                >
                  <section
                    className="tenant-unresolved-card"
                    aria-labelledby="tenant-unresolved-title"
                  >
                    <p className="tenant-unresolved-eyebrow">
                      Private workspace
                    </p>

                    <h1 id="tenant-unresolved-title">
                      Workspace unavailable
                    </h1>

                    <p>
                      This domain is not connected to an
                      active workspace.
                    </p>

                    <p className="tenant-unresolved-help">
                      Check the address or contact the
                      organisation that sent you this link.
                    </p>
                  </section>
                </main>
              }
            >
              {children}
            </TenantRouteGate>
          )}
        </TenantRuntimeProvider>
      </body>
    </html>
  );
}
