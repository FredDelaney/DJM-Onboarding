'use client';
import type {ComponentType} from 'react';
import {usePlayerContext} from '@/components/PlayerShell';
function RefreshAccount(){const ctx=usePlayerContext();return <button type="button" onClick={()=>void ctx.refresh()}>Refresh fixture account</button>;}
import {useSearchParams} from 'next/navigation';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';
import Home from '@/app/home/page';
import Profile from '@/app/profile/page';
import Inbox from '@/app/inbox/page';
import Career from '@/app/career/page';
import CheckIn from '@/app/check-in/page';
import CV from '@/app/cv/page';
import Documents from '@/app/documents/page';
import Connections from '@/app/connections/page';
const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'tenant',slug:'example',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Example Agency'}};
const pages:Record<string,ComponentType>={home:Home,profile:Profile,inbox:Inbox,career:Career,'check-in':CheckIn,cv:CV,documents:Documents,connections:Connections};
export default function Page(){
 const params=useSearchParams(),Component=pages[params.get('view')||'home']||Home;
 return <TenantRuntimeProvider runtime={runtime}>{params.get('view')==='documents'?<RefreshAccount/>:null}<Component/></TenantRuntimeProvider>;
}
