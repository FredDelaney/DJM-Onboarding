import { headers } from 'next/headers';

import ReDreamPublicLanding from '@/components/ReDreamPublicLanding';
import TenantPlayerLanding from '@/components/TenantPlayerLanding';
import { resolveTenantRuntime } from '@/lib/tenant-runtime';

export default async function Landing() {
  const requestHeaders = await headers();

  const hostname =
    requestHeaders.get('x-forwarded-host') ||
    requestHeaders.get('host');

  const runtime = await resolveTenantRuntime(hostname);

  const isReDreamPublicSite =
    Boolean(
      process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT?.trim(),
    ) && !runtime.resolved;

  return isReDreamPublicSite
    ? <ReDreamPublicLanding />
    : <TenantPlayerLanding />;
}
