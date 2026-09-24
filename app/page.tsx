import { headers } from 'next/headers';
import type { Metadata } from 'next';

import ReDreamPublicLanding from '@/components/ReDreamPublicLanding';
import TenantPlayerLanding from '@/components/TenantPlayerLanding';
import { shouldRenderReDreamPublicSite } from '@/lib/redream-public-host';
import { resolveTenantRuntime } from '@/lib/tenant-runtime';

async function publicRequestState() {
  const requestHeaders = await headers();
  const hostname = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');
  const runtime = await resolveTenantRuntime(hostname);
  const isReDreamPublicSite =
    !runtime.resolved &&
    shouldRenderReDreamPublicSite(
      hostname,
      process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT,
    );

  return { runtime, isReDreamPublicSite };
}

export async function generateMetadata(): Promise<Metadata> {
  const { isReDreamPublicSite } = await publicRequestState();
  if (!isReDreamPublicSite) return {};

  const title = 'ReDream | Software for football agencies';
  const description =
    'ReDream keeps players, club requests, relationships, follow-ups and deals connected so your agency knows what needs attention and what to do next.';

  return {
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      url: '/',
      title,
      description,
      siteName: 'ReDream Systems',
      images: [
        {
          url: '/brand/redream-og.jpg',
          width: 1200,
          height: 630,
          alt: 'ReDream Systems',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/brand/redream-og.jpg'],
    },
  };
}

export default async function Landing() {
  const { runtime, isReDreamPublicSite } = await publicRequestState();

  return isReDreamPublicSite
    ? <ReDreamPublicLanding />
    : <TenantPlayerLanding />;
}
