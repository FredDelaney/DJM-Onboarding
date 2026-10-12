'use client';
import {usePathname, useSearchParams} from 'next/navigation';
import SignIn from '@/app/sign-in/page';
import ForgotPassword from '@/app/forgot-password/page';
import ResetPassword from '@/app/reset-password/page';
import PlayerInvite from '@/app/join/[token]/page';
import StaffInvite from '@/app/workspace/join/[token]/page';
import Onboarding from '@/app/onboarding/page';
import PublicPlayerProfile from '@/app/p/[slug]/page';
import ClubShare from '@/app/s/[token]/page';
import AiFullPage from '@/components/AiFullPage';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import styles from '@/components/AgencyOperatingWorkspace.module.css';

const account = {'sign-in':SignIn,forgot:ForgotPassword,reset:ResetPassword,'player-invite':PlayerInvite,'staff-invite':StaffInvite,'onboarding-1':Onboarding,'onboarding-2':Onboarding,'onboarding-3':Onboarding,'onboarding-4':Onboarding};
const target = {id:'00000000-0000-4000-8000-000000000091',full_name:'Example Recruitment Player',primary_position:'CB',current_club:'Example FC',current_country:'NZ',ui_stage:'evaluation',next_action_at:'2026-10-10T10:00:00Z',last_interaction:{summary:'Review current footage with the scouting team'}};
const invoke=async(action:string)=>action==='recruitment_target'?{recruitment:{target,interactions:[{id:'interaction',summary:'Example scouting conversation',channel:'email',created_at:'2026-10-07T10:00:00Z'}]}}:{};
const rpc=async()=>({});
const noop=()=>{};
const refresh=async()=>{};

export default function RemainingSurfaces({suite,screen}:{suite:string;screen:string}){
 const path=usePathname(),params=useSearchParams();
 if(suite==='account'){
  const Component=account[screen as keyof typeof account];
  return Component?<Component/>:<p>Unknown account fixture</p>;
 }
 if(suite==='presentation')return screen==='profile'?<PublicPlayerProfile/>:<ClubShare/>;
 if(suite==='capture')return <main style={{maxWidth:760,margin:'0 auto',padding:'24px 16px'}}><h1>Capture</h1><AiFullPage key={params.toString()}/></main>;
 if(suite==='recruitment')return <div className={styles.root}><main className={styles.main} style={{gridColumn:'1 / -1'}}><h1>Recruitment</h1><AgencyPlayersWorkspace data={{directory:{items:[]},recruitment:{items:[target]}}} basePath={path} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onOpenAction={noop} canManageRecords canCreateRecords/></main></div>;
 return <p>Unknown remaining fixture</p>;
}
