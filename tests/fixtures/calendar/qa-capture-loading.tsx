import AiLauncher from '@/components/AiLauncher';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';

const runtime = {...UNRESOLVED_TENANT_RUNTIME, resolved: true, tenant_id: 'fixture-tenant', slug: 'qa-capture-loading'};

export default function Page() {
  return <TenantRuntimeProvider runtime={runtime}>
    <main style={{padding: 24}}><h1>Capture loading check</h1><AiLauncher navigation /></main>
  </TenantRuntimeProvider>;
}
