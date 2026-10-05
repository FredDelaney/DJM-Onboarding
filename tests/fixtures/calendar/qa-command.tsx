import { SearchParamsContext, PathParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import AgencyOperatingWorkspace from '@/components/AgencyOperatingWorkspace';
import { TenantRuntimeProvider } from '@/components/TenantRuntimeProvider';
import { UNRESOLVED_TENANT_RUNTIME } from '@/lib/tenant-runtime';
import { supabase } from '@/lib/supabase';

// Non-deployed fixture: exercise the real workspace with external API responses.
if (typeof window !== 'undefined') {
  const session = {user:{id:'qa-user'}};
  supabase.auth.getSession = (async () => ({data:{session},error:null})) as any;
  supabase.auth.onAuthStateChange = ((callback: any) => {
    (window as any).endFixtureSession = () => callback('SIGNED_OUT',null);
    return {data:{subscription:{unsubscribe(){}}}};
  }) as any;
}

const runtime = {...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'qa-tenant',slug:'qa'};
export default function Page() {
  return <SearchParamsContext.Provider value={new URLSearchParams()}><PathParamsContext.Provider value={{}}><TenantRuntimeProvider runtime={runtime}><AgencyOperatingWorkspace/></TenantRuntimeProvider></PathParamsContext.Provider></SearchParamsContext.Provider>;
}
