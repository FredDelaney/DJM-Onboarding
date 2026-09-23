import ReDreamPublicLanding from '@/components/ReDreamPublicLanding';
import TenantPlayerLanding from '@/components/TenantPlayerLanding';

export default function Landing() {
  const isReDreamPublicSite = Boolean(
    process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT?.trim(),
  );

  return isReDreamPublicSite
    ? <ReDreamPublicLanding />
    : <TenantPlayerLanding />;
}
