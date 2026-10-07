'use client';
import {useCallback,useRef,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import CaptureSession from '@/components/CaptureSession';
import {supabase} from '@/lib/supabase';
import AiFullPage from '@/components/AiFullPage';
import AgencyPursuitRoom from '@/components/AgencyPursuitRoom';

export default function Page(){
 const params=useSearchParams(),reads=useRef<Record<string,number>>({});
 const scenario=params.get('scenario')||'normal';
 const [sessionReady,setSessionReady]=useState(false);
 useEffect(()=>{
  if(params.get('view')!=='session')return;
  const auth=supabase.auth as any,originalSession=auth.getSession,originalSubscribe=auth.onAuthStateChange;
  auth.getSession=async()=>{
   if(!(window as any).qaReadHealthy){
    if(scenario==='failed')throw new Error('Could not confirm your sign-in');
    if(scenario==='hung')return await new Promise(()=>{});
   }
   return {data:{session:scenario==='signed-out'?null:{user:{id:'fixture-user'}}},error:null};
  };
  auth.onAuthStateChange=(callback:any)=>{(window as any).qaAuthChanged=(session:any)=>callback('SIGNED_OUT',session);return {data:{subscription:{unsubscribe(){}}}};};
  setSessionReady(true);
  return()=>{auth.getSession=originalSession;auth.onAuthStateChange=originalSubscribe;delete (window as any).qaAuthChanged;};
 },[params,scenario]);
 const invoke=useCallback(async(name:string)=>{
  const attempt=reads.current[name]=(reads.current[name]||0)+1;
  if(name==='external_dossiers'&&!(window as any).qaReadHealthy){
   if(scenario==='failed')throw new Error('Connection temporarily unavailable');
   if(scenario==='hung')return await new Promise(()=>{});
  }
  if(name==='external_dossiers')return {dossiers:{items:[{player:{player_id:'player'},share_state:'share_safe'}]}};
  if(name==='pitch_readiness')return {readiness:{items:[{player_match_id:'match',player:{player_id:'player'},club:{organisation_id:'club'},career_gate:{state:'open_confirmed'}}]}};
  if(name==='pitch_execution')return {execution:{items:[]}};
  if(name==='pitch_responses')return {responses:{items:[]}};
  throw new Error('Unexpected fixture action '+name);
 },[scenario]);
 if(params.get('view')==='session')return sessionReady?<CaptureSession><p>Authenticated capture contents</p></CaptureSession>:null;
 if(params.get('view')==='capture')return <main style={{maxWidth:760,margin:'auto',padding:16}}><AiFullPage/></main>;
 return <AgencyPursuitRoom presentation="page" request={{key:'qa',playerMatchId:'match',playerId:'player',playerName:'Example Player',clubId:'club',clubName:'Example FC'}} role="owner" marketData={{}} invoke={invoke} onClose={()=>{}} onOpenAction={()=>{}} onOpenDeal={()=>{}} onApplied={()=>{}}/>;
}
