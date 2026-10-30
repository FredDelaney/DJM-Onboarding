import {useCallback,useRef} from 'react';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';

// Real profile and data panel. Only the API transport is replaced, with a
// session-persistent ledger so reload recovery exercises the real UI effects.
const initial=(scenario:string)=>({
 access:(scenario==='staff-editor'||scenario==='details-staff')?{restricted:true,can_edit_statistics:true,can_review_player_details:true}:undefined,
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
 detailReview:null as any,detailsResearches:0,detailsDecisions:0,detailsReads:0,detailsTaskStatus:'open',detailsFinishedAt:0,
 review:null as any,reviewDecisions:0,job:null as any,completeAt:0,refreshes:0,saves:0,verifications:0,publishes:0,statusReads:0
});
const detailsReview=(status='needs_review')=>({
 id:'70000000-0000-4000-8000-000000000001',status,checked_at:'2026-10-24T12:00:00Z',reason:'QA synthetic source check',
 fields:([['current_club','Example FC II','Suggested FC'],['contract_expiry','2027-06-30','2028-06-30'],['nationalities',['New Zealand'],['New Zealand','Australia']],['height_cm',180,184]] as Array<[string,unknown,unknown]>).map(([field,before,suggested],i)=>({
  id:'80000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),field,before,suggested,decision:status==='applied'?'accepted':'pending',applied_value:status==='applied'?suggested:null,
  sources:[{title:'QA official league',url:'https://league.example/player'},{title:'QA club profile',url:'https://club.example/player'}]
 }))
});
export default function Page({scenario}:{scenario:string}){
 const state=useRef<any>(null);
 if(!state.current){
  const saved=typeof window!=='undefined'?sessionStorage.getItem('qa-player-data-'+scenario):null;
  state.current=saved?JSON.parse(saved):initial(scenario);
  if(!saved&&scenario.startsWith('details-')){
   Object.assign(state.current.player,{nationalities:['New Zealand'],height_cm:180,date_of_birth:'2000-01-01',preferred_foot:'Right'});
   state.current.detailReview=scenario==='details-research'?null:detailsReview(scenario==='details-running'?'running':scenario==='details-resolved'?'applied':'needs_review');
   if(scenario==='details-running')state.current.detailsFinishedAt=Date.now()+100;
   if(scenario==='details-resolved')for(const f of state.current.detailReview.fields)state.current.player[f.field]=f.applied_value;
  }
 }
 const invoke=useCallback(async(action:string,body:any={})=>{
  const s=state.current;
  const persist=()=>sessionStorage.setItem('qa-player-data-'+scenario,JSON.stringify(s));
  if(action==='player_context_status'){
   s.detailsReads++;persist();if(scenario==='details-retry'&&!s.detailsOnline)throw new Error('The connection was interrupted. Check progress to recover.');
   if(s.detailReview?.status==='running'&&Date.now()>=s.detailsFinishedAt){s.detailReview=detailsReview();persist();}
   return {ok:true,review:structuredClone(s.detailReview)};
  }
  if(action==='player_context_research'){
   if(!s.detailReview||!['running','needs_review'].includes(s.detailReview.status)){s.detailsResearches++;s.detailReview=detailsReview();persist();}
   return {ok:true,review:structuredClone(s.detailReview),proposal:{id:s.detailReview.id}};
  }
  if(action==='player_context_review'){
   if(body.review_id!==s.detailReview?.id)throw new Error('Wrong details review');s.detailsDecisions++;
   if(scenario==='details-conflict'&&!s.detailsConflictOnce){s.detailsConflictOnce=true;s.player.current_club='Colleague FC';persist();throw new Error('Player details changed. Check the record again.');}
   let changed=false;
   for(const decision of body.decisions){
    const f=s.detailReview.fields.find((f:any)=>f.id===decision.id);if(!f)throw new Error('Unknown suggestion');if(f.decision!=='pending')continue;
    const value=decision.decision==='edit'?decision.value:f.suggested;
    if(decision.decision!=='reject'){
     if(f.field==='nationalities'&&!Array.isArray(value))throw new Error('Nationalities must remain an array');
     if(f.field==='height_cm'&&typeof value!=='number')throw new Error('Height must remain a number');
     if(JSON.stringify(s.player[f.field])!==JSON.stringify(value)){s.player[f.field]=value;changed=true;}
    }
    f.decision=decision.decision==='reject'?'rejected':'accepted';f.applied_value=decision.decision==='reject'?null:value;
   }
   if(changed){s.player.verification_status='reviewing';s.player.verified_at=null;s.player.review_required_at=new Date().toISOString();s.player.review_reason='Reviewed player details changed';s.published.published=false;}
   s.detailReview.status=s.detailReview.fields.some((f:any)=>f.decision==='pending')?'needs_review':s.detailReview.fields.some((f:any)=>f.decision==='accepted')?'applied':'rejected';persist();
   if(scenario==='details-timeout')return new Promise(()=>{});
   if(scenario==='details-unconfirmed')throw new Error('The response was interrupted. Check progress before trying again.');
   return {ok:true,review_id:s.detailReview.id,review:structuredClone(s.detailReview)};
  }

  const finish=()=>{
   if(!s.job||!['queued','running'].includes(s.job.status)||Date.now()<s.completeAt)return;
   if(scenario==='rejected-repeat'){
    s.job={...s.job,status:'rejected',summary:{message:'This suggestion was already rejected. Recorded statistics are unchanged.',checked_at:null,changed_fields:[]}};
   }else if(scenario==='failed'){
    s.job={...s.job,status:'failed',summary:{message:'The update could not confirm reliable new statistics. Recorded figures are still available.',checked_at:null}};
   }else{
    s.review={id:'review-'+scenario,status:'needs_review',row_id:s.career[0].id,expected_updated_at:s.career[0].updated_at,
     checked_at:new Date().toISOString(),context:{season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',country:'NZ'},
     before:{appearances:8,starts:5,minutes:450,goals:0,assists:null},proposed:{appearances:9,starts:5,minutes:540,goals:0,assists:null},
     sources:[{url:'https://league.example/player',title:'Official league'},{url:'https://club.example/stats',title:'Club season record'}]};
    s.job={...s.job,status:'needs_review',summary:{message:'New figures are ready to review. Recorded statistics have not changed.',checked_at:null,changed_fields:[]}};
   }
   persist();
  };
  if(action==='player_data_status'){s.statusReads++;persist();if(scenario==='offline'&&!sessionStorage.getItem('qa-player-data-connection-restored'))throw new Error('The connection was interrupted. Check progress to recover.');finish();return {job:structuredClone(s.job),review:scenario==='scout'?null:structuredClone(s.review)};}
  if(action==='player_data_refresh'){
   if(!s.job||!['queued','running'].includes(s.job.status)){
    s.refreshes++;s.completeAt=Date.now()+4000;
    s.job={id:body.request_id,status:'running',context:{season_label:s.player.current_season_label,club_name:s.player.current_club,league:s.player.current_league}};
    persist();
   }
   return {job:structuredClone(s.job)};
  }
  if(action==='player_data_review'){
   s.reviewDecisions++;
   if(scenario==='review-conflict'){persist();throw new Error('player_stats_revision_conflict');}
   if(body.review_id!==s.review?.id)throw new Error('Wrong review');
   if(body.decision!=='reject'){
    const values=body.decision==='edit'?body.values:s.review.proposed;
    const entry={...s.career[0],...values,updated_at:new Date().toISOString(),source_reviewed_at:new Date().toISOString()};
    for(const key of ['appearances','starts','minutes','goals','assists'])entry[key]=values[key]===''||values[key]==null?null:Number(values[key]);
    s.career[0]=entry;s.auto_key_stats[0].value=String(entry.appearances);s.auto_key_stats[2].value=String(entry.minutes);
    s.player={...s.player,verification_status:'reviewing',verified_at:null,review_required_at:new Date().toISOString(),review_reason:'Career statistics changed'};
    s.published.published=false;
   }
   s.review={...s.review,status:body.decision==='reject'?'rejected':'accepted'};persist();
   if(scenario==='review-unconfirmed')throw new Error('The connection was interrupted. Reload player data before trying again.');
   return {ok:true,review_id:s.review.id,status:s.review.status};
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
   if(scenario==='details-reload-failed'&&s.detailsDecisions&&!s.detailsOnline)throw new Error('The recorded player could not reload.');
   finish();return {profile:structuredClone(s)};
  }
  throw new Error('Unexpected fixture action: '+action);
 },[scenario]);
 return <>{(scenario==='details-retry'||scenario==='details-reload-failed')?<button type="button" onClick={()=>{state.current.detailsOnline=true;sessionStorage.setItem('qa-player-data-'+scenario,JSON.stringify(state.current));}}>Restore fixture connection</button>:null}<AgencyPlayerProfile playerId={'qa-data-'+scenario} backHref="/qa-command" role={scenario==='scout'?'scout':(scenario==='staff-editor'||scenario==='details-staff')?'agent':'owner'}
  fallbackAgency={{support_email:'agency@example.test'}} invoke={invoke} onOpenAction={()=>{}} onOpenIntelligence={()=>{}}/></>;
}
export const getServerSideProps=async({query}:any)=>({props:{scenario:String(query.scenario||'normal')}});
