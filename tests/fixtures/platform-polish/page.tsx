'use client';
import type {ComponentType} from 'react';
import {useSearchParams} from 'next/navigation';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';
import AgencyOperatingWorkspace from '@/components/AgencyOperatingWorkspace';
import AgencyEntityIntelligenceDrawer from '@/components/AgencyEntityIntelligenceDrawer';
import AgencyClubAccountDrawer from '@/components/AgencyClubAccountDrawer';
import AgencyContactIntelligenceDrawer from '@/components/AgencyContactIntelligenceDrawer';
import AgencyNegotiationCommandRoom from '@/components/AgencyNegotiationCommandRoom';
import AgencyPlayerServiceReviewDrawer from '@/components/AgencyPlayerServiceReviewDrawer';
import AgencyOwnerCommandCentre from '@/components/AgencyOwnerCommandCentre';
import Home from '@/app/home/page';
import Profile from '@/app/profile/page';
import Inbox from '@/app/inbox/page';
import Career from '@/app/career/page';
import CheckIn from '@/app/check-in/page';
import CV from '@/app/cv/page';
import Documents from '@/app/documents/page';
import Connections from '@/app/connections/page';
import Settings from '@/app/(djm-os)/settings/page';
import SettingsProfile from '@/app/(djm-os)/settings/profile/page';
import Preferences from '@/app/(djm-os)/settings/preferences/page';
import Security from '@/app/(djm-os)/settings/security/page';
import Team from '@/app/(djm-os)/settings/team/page';
import Agency from '@/app/(djm-os)/settings/agency/page';
import Billing from '@/app/(djm-os)/settings/billing/page';
import SettingsConnections from '@/app/(djm-os)/settings/connections/page';
import PlayerExperience from '@/app/(djm-os)/settings/player-experience/page';
import Launch from '@/app/launch/page';
import PublicPrivacy from '@/app/privacy/ReDreamPublicPrivacy';
import PlayerWorkspaces from '@/app/player-workspaces/page';
import styles from '@/components/AgencyOperatingWorkspace.module.css';
import RemainingSurfaces from '@/tests/fixtures/platform-polish/remaining';
const playerPages:Record<string,ComponentType>={home:Home,profile:Profile,inbox:Inbox,career:Career,'check-in':CheckIn,cv:CV,documents:Documents,connections:Connections};
const settingsPages:Record<string,ComponentType>={settings:Settings,profile:SettingsProfile,preferences:Preferences,security:Security,team:Team,agency:Agency,billing:Billing,connections:SettingsConnections,'player-experience':PlayerExperience};
const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-platform-polish',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Example Agency'}};
const noop=()=>{};
const refresh=async()=>{};
const invoke=async(action:string)=> {
 if(action==='club_account')return {club:{club:{id:'club',name:'Example FC',country:'NZ'},summary:{},people:[],needs:[],deals:[]}};
 if(action==='deal_war_room')return {war_room:{available:true,deal:{id:'deal',title:'Example transfer',stage:'open'},next_control_fix:{},control:{}}};
 if(action==='player_review_pack')return {review_pack:{value_proof:{},meeting_focus:{},career_alignment:{}}};
 if(action==='player_service_statement')return {statement:{privacy_contract:{excluded:[]}}};
 if(action==='player_value_proof_history')return {history:{snapshots:[]}};
 if(action==='player_value_proof_delta')return {delta:{}};
 return {};
};
const rpc=async()=>({person:{id:'contact',full_name:'Example Director'},reach:{},employment:{organisation_name:'Example FC'},relationship_memory:{state:'recorded',best_route:{},routes:[]}});
export default function Page(){
 const params=useSearchParams(),suite=params.get('suite')||'agency',screen=params.get('screen')||'home';
 const Component=suite==='player'?playerPages[screen]:settingsPages[screen];
 let content;
 if(['marketing','account','presentation','capture','recruitment'].includes(suite))content=<RemainingSurfaces suite={suite} screen={screen}/>;
 else if(suite==='setup')content=<Launch/>;
 else if(suite==='misc')content=screen==='privacy'?<PublicPrivacy/>:<PlayerWorkspaces/>;
 else if(suite==='agency')content=<AgencyOperatingWorkspace/>;
 else if(suite==='player'||suite==='settings')content=Component?<Component/>:<p>Unknown fixture screen</p>;
 else content=<div className={styles.root}><main className={styles.main}>
  {screen==='deal'?<AgencyEntityIntelligenceDrawer presentation={params.get('drawer')==='1'?'drawer':'page'} request={{key:'deal',kind:'deal',entityId:'deal',title:'Example transfer'}} invoke={invoke as any} onClose={noop} onOpenAction={noop} onOpenCloseout={noop} onOpenNegotiation={noop} onOpenPlayerReview={noop}/>:null}
  {screen==='club'?<AgencyClubAccountDrawer presentation="page" request={{key:'club',organisationId:'club',title:'Example FC'}} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onClose={noop} onOpenAction={noop} onOpenDeal={noop} onOpenMarket={noop} onOpenPursuit={noop} onOpenPlayer={noop}/>:null}
  {screen==='contact'?<AgencyContactIntelligenceDrawer presentation="page" contact={{person_id:'contact',person:{full_name:'Example Director'}}} rpc={rpc as any} onClose={noop} onRefresh={refresh} onOpenClub={noop}/>:null}
  {screen==='negotiation'?<AgencyNegotiationCommandRoom presentation="page" request={{key:'negotiation',dealRoomId:'deal',title:'Example transfer'}} role="owner" invoke={invoke as any} onClose={noop} onOpenAction={noop} onApplied={refresh}/>:null}
  {screen==='review'?<AgencyPlayerServiceReviewDrawer presentation="page" request={{key:'review',playerId:'player',title:'Example Player'}} invoke={invoke as any} onClose={noop} onOpenAction={noop} onApplied={refresh}/>:null}
  {screen==='business'?<AgencyOwnerCommandCentre presentation="page" data={{}} onClose={noop} onOpenDeal={noop} onOpenAction={noop} onOpenHandoff={noop}/>:null}
 </main></div>;
 return <TenantRuntimeProvider runtime={runtime}>{content}</TenantRuntimeProvider>;
}
