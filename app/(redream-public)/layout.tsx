import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { shouldRenderReDreamPublicSite } from '@/lib/redream-public-host';

export default async function ReDreamPublicLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const hostname = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');

  if (!shouldRenderReDreamPublicSite(hostname, process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT)) {
    notFound();
  }

  return children;
}
