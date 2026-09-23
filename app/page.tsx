import { headers } from 'next/headers';

import ReDreamPublicLanding from '@/components/ReDreamPublicLanding';
import TenantPlayerLanding from '@/components/TenantPlayerLanding';
import {
  shouldRenderReDreamPublicSite,
} from '@/lib/redream-public-host';
import { resolveTenantRuntime } from '@/lib/tenant-runtime';

export default async function Landing() {
  const requestHeaders = await headers();

  const hostname =
    requestHeaders.get('x-forwarded-host') ||
    requestHeaders.get('host');

  const runtime = await resolveTenantRuntime(hostname);

  const isReDreamPublicSite =
    !runtime.resolved &&
    shouldRenderReDreamPublicSite(
      hostname,
      process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT,
    );

  return isReDreamPublicSite
    ? <ReDreamPublicLanding />
    : <TenantPlayerLanding />;
}
