import {useCallback,useEffect,useRef,useState} from 'react';
import AgencyPursuitRoom from '@/components/AgencyPursuitRoom';
import AgencyActionDrawer,{type AgencyActionRequest} from '@/components/AgencyActionDrawer';

export default function Page(){
 const [ready,setReady]=useState(false),[open,setOpen]=useState(true),[action,setAction]=useState<AgencyActionRequest|null>(null);
 const preparationCalls=useRef(0);
 const [presentation,setPresentation]=useState<'page'|'drawer'>('page');
 useEffect(()=>{setPresentation(new URLSearchParams(location.search).get('presentation')==='drawer'?'drawer':'page');setReady(true);},[]);
 const invoke=useCallback(async(name:string)=>{
  if(name==='external_dossiers')return {dossiers:{items:[{player:{player_id:'player'},share_state:'share_safe'}]}};
  if(name==='pursuit_salary_review')return {review:{version:1,player_match_id:'match',player_id:'player',club_id:'club',can_proceed:true,state:'open_recorded_salary',message:'Confirmed base salary fits the recorded budget.',comparison:{version:1,fingerprint:'a'.repeat(32),state:'minimum_within_budget',player_minimum:'4000',player_target:'4500',player_currency:'EUR',player_period:'monthly',player_tax_basis:'net',club_budget:'5000',club_currency:'EUR',club_period:'monthly',club_tax_basis:'net',source_status:'confirmed',club_source_status:'confirmed',missing:[]}}};
  if(name==='pitch_readiness')return {readiness:{items:[{player_match_id:'match',player:{player_id:'player'},club:{organisation_id:'club'},career_gate:{state:'open_confirmed'}}]}};
  if(name==='pitch_execution')return {execution:{items:[{player_id:'player',organisation_id:'club',share_id:'share',deal_owner_user_id:'owner',deal_owner_name:'Agency Owner',opportunity_id:'deal'}]}};
  if(name==='pitch_responses')return {responses:{items:[]}};
  if(name==='pitch_detail')return {pitch:{id:'share',active:true,sent_at:'2026-10-01T12:00:00Z',opportunity_id:'deal'}};
  if(name==='deal_step_prepare'){
   if(++preparationCalls.current===1)await new Promise<void>(resolve=>{(window as any).qaReleaseActionPreparation=()=>{delete (window as any).qaReleaseActionPreparation;resolve();};});
   return {result:{status:'needs_input',action_type:'set_deal_next_action',required_inputs:['next_action_text','next_action_at'],reminder_owner_name:'Agency Owner'}};
  }
  throw new Error('Unexpected fixture mutation '+name);
 },[]);
 return <main data-qa-ready={ready}><p>Opportunity list</p>{open?<AgencyPursuitRoom presentation={presentation} request={{key:'qa',playerMatchId:'match',playerId:'player',playerName:'Example Player',clubId:'club',clubName:'Example FC'}} role="owner" marketData={{}} invoke={invoke} onClose={()=>setOpen(false)} onOpenAction={setAction} onOpenDeal={()=>{}} onApplied={()=>{}}/>:null}{action?<AgencyActionDrawer request={action} invoke={invoke} onClose={()=>setAction(null)} onApplied={()=>{}}/>:null}</main>;
}
