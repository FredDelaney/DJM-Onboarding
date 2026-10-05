import {useCallback,useRef} from 'react';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';

// Real profile and data panel. Only the API transport is replaced, with a
// session-persistent ledger so reload recovery exercises the real UI effects.
const initial=(scenario:string)=>({
 player:{id:'qa-data-'+scenario,first_name:'Dylan',last_name:'Gardiner',primary_position:'Centre back',
  current_club:scenario==='missing'?'':'Example FC II',current_league:scenario==='missing'?'':'Regional League',
  current_country:'NZ',current_season_label:scenario==='missing'?'':'2026/27',
  verification_status:'verified',verified_at:'2026-10-01T12:00:00Z',review_required_at:null,review_reason:null,
  contract_status:'Under contract',contract_expiry:'2027-06-30'},
 settings:{key_stats:scenario==='custom'?[{label:'Apps',value:'99'}]:[]},
 published:{published:true},career:[
  {id:'current',season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',country:'NZ',
   appearances:8,starts:5,minutes:450,goals:0,assists:null,source_provider:'manual',source_name:'Official league',
   source_url:'https://league.example/player',source_reviewed_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z'},
  {id:'senior',season_label:'2026/27',club_name:'Example FC',league:'Regional League',appearances:30,goals:10},
  {id:'history',season_label:'2025/26',club_name:'Example Reserves',league:'Regional League',appearances:21,goals:1,source_url:'javascript:alert(1)'}
 ],videos:[],documents:[],shares:[],deals:[],clubs:[],branding:{support_email:'agency@example.test'},secondary_ready:true,
 auto_key_stats:[{label:'Apps',value:'8'},{label:'Starts',value:'5'},{label:'Minutes',value:'450'},{label:'Goals',value:'0'}],
 auto_stats_meta:{source_url:'https://league.example/player'},
 job:null as any,completeAt:0,refreshes:0,saves:0,verifications:0,publishes:0,statusReads:0
});
export default function Page({scenario}:{scenario:string}){
 const state=useRef<any>(null);
 if(!state.current){
  const saved=typeof window!=='undefined'?sessionStorage.getItem('qa-player-data-'+scenario):null;
  state.current=saved?JSON.parse(saved):initial(scenario);
 }
 const invoke=useCallback(async(action:string,body:any={})=>{
  const s=state.current;
  const persist=()=>sessionStorage.setItem('qa-player-data-'+scenario,JSON.stringify(s));
  const finish=()=>{
   if(!s.job||!['queued','running'].includes(s.job.status)||Date.now()<s.completeAt)return;
   if(scenario==='failed'){
    s.job={...s.job,status:'failed',summary:{message:'The update could not confirm reliable new statistics. Recorded figures are still available.',checked_at:null}};
   }else{
    s.career[0]={...s.career[0],appearances:9,minutes:540,source_synced_at:new Date().toISOString(),source_reviewed_at:null,source_provider:'public_web_evidence',updated_at:new Date().toISOString()};
    s.auto_key_stats[0].value='9';s.auto_key_stats[2].value='540';
    s.player={...s.player,verification_status:'reviewing',verified_at:null,review_required_at:new Date().toISOString(),review_reason:'Career statistics changed'};
    s.published.published=false;
    s.job={...s.job,status:'applied',summary:{message:'Statistics updated. Review the recorded figures before verifying the player.',checked_at:new Date().toISOString(),changed_fields:['appearances','minutes']}};
   }
   persist();
  };
  if(action==='player_data_status'){s.statusReads++;persist();if(scenario==='offline'&&!sessionStorage.getItem('qa-player-data-connection-restored'))throw new Error('The connection was interrupted. Check progress to recover.');finish();return {job:structuredClone(s.job)};}
  if(action==='player_data_refresh'){
   if(!s.job||!['queued','running'].includes(s.job.status)){
    s.refreshes++;s.completeAt=Date.now()+4000;
    s.job={id:body.request_id,status:'running',context:{season_label:s.player.current_season_label,club_name:s.player.current_club,league:s.player.current_league}};
    persist();
   }
   return {job:structuredClone(s.job)};
  }
  if(action==='player_data_save'){
   if(scenario==='conflict')throw new Error('Recorded statistics changed while you were editing. Reload the data and review your corrections.');
   s.saves++;
   const values=body.values;
   const entry={...s.career[0],id:body.row_id||'new',...values,updated_at:new Date().toISOString(),source_reviewed_at:new Date().toISOString(),source_provider:'manual'};
   for(const key of ['appearances','starts','minutes','goals','assists'])entry[key]=values[key]===''?null:Number(values[key]);
   if(body.row_id)s.career[0]=entry;else s.career.unshift(entry);
   s.player={...s.player,current_season_label:values.season_label,current_club:values.club_name,current_league:values.league,
    verification_status:'reviewing',verified_at:null,review_required_at:new Date().toISOString(),review_reason:'Career statistics changed'};
   s.published.published=false;persist();return {ok:true};
  }
  if(action==='player_profile_save'){s.settings=body.settings;persist();return {ok:true};}
  if(action==='player_profile_verify'){
   s.verifications++;s.player={...s.player,verification_status:'verified',verified_at:new Date().toISOString(),review_required_at:null,review_reason:null};
   persist();return {ok:true};
  }
  if(action==='player_profile_publish'){s.publishes++;s.published.published=true;persist();return {ok:true};}
  if(action==='player_profile_core'||action==='player_profile'){
   finish();return {profile:structuredClone(s)};
  }
  throw new Error('Unexpected fixture action: '+action);
 },[scenario]);
 return <AgencyPlayerProfile playerId={'qa-data-'+scenario} backHref="/qa-command" role={scenario==='scout'?'scout':'owner'}
  fallbackAgency={{support_email:'agency@example.test'}} invoke={invoke} onOpenAction={()=>{}} onOpenIntelligence={()=>{}}/>;
}
export const getServerSideProps=async({query}:any)=>({props:{scenario:String(query.scenario||'normal')}});
