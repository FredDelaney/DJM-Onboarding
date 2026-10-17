import AgencyActionDrawer from '@/components/AgencyActionDrawer';
import { platformInvoke } from '@/lib/platform-client';

export default function Page() {
  return <AgencyActionDrawer request={{key:'career-player',eyebrow:'Career plan',title:'Dylan Gardiner',instruction:'Review the career plan.',label:'Review career plan',action:'career_strategy_action_prepare',payload:{player_id:'qa-career-player'}}} invoke={(action,body)=>platformInvoke('agency-os',{action,tenant_id:'qa-tenant',...body})} onClose={()=>{}} onApplied={()=>{}} />;
}
