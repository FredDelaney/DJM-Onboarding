'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import AgencyOperatingWorkspace from '@/components/AgencyOperatingWorkspace';
import AgencyClubAccountDrawer from '@/components/AgencyClubAccountDrawer';
import AgencyEntityIntelligenceDrawer from '@/components/AgencyEntityIntelligenceDrawer';
import {supabase} from '@/lib/supabase';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import AgencyMobileNavigation from '@/components/AgencyMobileNavigation';
import PeopleViewSwitcher from '@/components/PeopleViewSwitcher';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import AgencyNetworkWorkspace from '@/components/AgencyNetworkWorkspace';
import AgencyOpportunitiesWorkspace from '@/components/AgencyOpportunitiesWorkspace';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';
import AgencyActionDrawer,{type AgencyActionRequest} from '@/components/AgencyActionDrawer';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';
import styles from '@/components/AgencyOperatingWorkspace.module.css';
import {buildSearchItems,searchWorkspaceItems,filterArchivedSearchItems} from '@/lib/workspace-search';
const base='/workspace/qa-find-flow';
export default function Page(){
 const params=useSearchParams(),user=params.get('user')||'a',scenario=params.get('scenario')||'normal',tenant=params.get('tenant')||'a';
 const fixtureRole=params.get('role')||'owner';
 const fixtureOwner=params.get('owner')==='long'?'Alexandros Konstantinopoulos-MacDonald':'';
 const profileOwner=params.get('owner')==='missing'?null:fixtureOwner||'Example Agent';
 const scope='fixture-tenant-'+tenant+':fixture-user-'+user+':'+fixtureRole+':'+scenario,view=params.get('view')||'players',playerId=params.get('player')||'';
 const [briefPatch,setBriefPatch]=useState<Record<string,unknown>>({});
 const [created,setCreated]=useState(''),[otherDialog,setOtherDialog]=useState(false),reads=useRef<Record<string,number>>({});
 const [loaded,setLoaded]=useState(100);useEffect(()=>setLoaded(100),[user]);
 const [clubRequest,setClubRequest]=useState<any>(null),[dealRequest,setDealRequest]=useState<any>(null);
 const [actionRequest,setActionRequest]=useState<AgencyActionRequest|null>(null);
 useEffect(()=>{
  (window as any).qaSignIn=(email:string)=>supabase.auth.signInWithPassword({email,password:'fixture'});
  return()=>{delete (window as any).qaSignIn;};
 },[]);
 const finishLateDetail=useRef<any>(null);
 const savedProfileSettings=useRef<any>(null),fixtureVideos=useRef<any[]>([{id:'film',title:'Full match footage',url:'https://example.test/film',is_primary:true}]);
 const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
 const data=useMemo(()=>({
  directory:{items:Array.from({length:251},(_,i)=>({player_id:'qa-player-'+i,identity:{name:i===0?(user==='a'?'José Silva':'Other Account Player'):'Example Player '+i,current_club:'Example FC',primary_position:'Centre back',current_country:'NZ'},service:{},active_opportunities:0}))},
  recruitment:{items:[{id:'qa-target',full_name:'Recruitment Prospect',current_club:'Example FC',ui_stage:'identified'}]},
  accounts:{clubs:[{organisation_id:'qa-club',name:'Example FC',country:'NZ',league_name:'Regional League',access:{direct_score:80}}]},
  contacts:{items:[{person_id:'qa-contact',person:{full_name:'Dapo Director'},employment:{organisation_id:'qa-club',organisation_name:'Example FC',role_title:'Director'},relationship:{route_score:80}},{person_id:'qa-scout',person:{full_name:'Moses Scout'},employment:{organisation_name:'Other FC',role_title:'Scout'},relationship:{route_score:30}}]},
  market:{demand:{items:scenario==='need-review'?[
   {club_need_id:'qa-need',need:{title:'Centre back needed',position:'Centre back',preferred_foot:'Left',min_height_cm:185,transfer_type:'permanent',expires_at:'2099-06-30',min_age:18,max_age:26,level_requirements:'Senior first-team experience',nationality_preferences:['Portugal','New Zealand'],passport_requirements:'EU passport',registration_notes:'Before 30 June',source_person_id:'40000000-0000-4000-8000-000000000001',source_person_name:'Source Director',source_organisation_id:'30000000-0000-4000-8000-000000000003',source_organisation_name:'Source Agency',received_on:'2026-10-20',priority:4,updated_at:'2026-10-28T16:00:00.123456Z',salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:null,contract_months:12,contract_guaranteed:true,option_months:12,source_status:'reported',availability_notes:'Join quickly',raw_request:'Original striker request, €5,000 monthly, 12 + 12.',...briefPatch,profile_notes:'Build from the back. Review current full-match footage before progressing. '+ 'LongRequirement'.repeat(12)},club:{name:'Example FC',organisation_id:'qa-club'},candidate_coverage:{recorded_candidates:5,candidates:[{player_name:'First Recorded Player',player_match_id:'first-match',player_id:'first-player',career_gate_state:'review_evidence',career_gate_reason:'Review the recorded evidence.'},{player_name:'Chosen Player',player_match_id:'chosen-match',player_id:'chosen-player',career_gate_state:'hold_player_decision',career_gate_reason:'Confirm the player’s preference.'},{player_name:'Unlinked Candidate'}]}},
   {club_need_id:'unknown-need',need:{title:'Goalkeeper request'},club:{name:'Other FC'},candidate_coverage:{candidates:[]}},
   {club_need_id:'expired-need',need:{title:'Previous transfer window',expires_at:'2020-01-01'},club:{name:'Previous FC'},candidate_coverage:{recorded_candidates:1,candidates:[{player_name:'Previous Candidate',player_match_id:'previous-match'}]}}
  ]:[{club_need_id:'qa-need',need:{title:'Centre back needed',position:'Centre back'},club:{name:'Example FC'},candidate_coverage:{candidates:[]}}]},pursuits:{items:[]}},
  ...(scenario==='need-review'?{connected:{needs:[{club_need_id:'qa-need',source_person_name:'Source Director',latest_contact:{person_name:'Source Director',summary:'Asked for current full-match footage.',channel:'phone',owner_name:'Jesse Edge',owner_state:'active_staff'}}]}}:{}),
  deals:{portfolio:{deals:[{deal_room_id:'qa-deal',title:'Example transfer',organisation:'Example FC',stage:'open',primary_blocker:'Club requests current footage and confirmation of availability before the recruitment meeting.',next_control_fix:scenario==='deal-follow-through'?{instruction:'Assign one accountable deal owner.'}:undefined}]}}
 }),[user,scenario,briefPatch]);
 const invoke=useCallback(async(action:string,body:any={})=>{
  reads.current[action]=(reads.current[action]||0)+1;
  if(action==='club_request_options'){(window as any).qaSourceLookupCalls=((window as any).qaSourceLookupCalls||0)+1;const items=body.record_kind==='contact'?[{id:'40000000-0000-4000-8000-000000000001',name:'Source Director'}]:[{id:'30000000-0000-4000-8000-000000000003',name:'Source Agency'}];return {options:{items,selected:items.find(item=>item.id===body.selected_id)||null,has_more:false}};}
  if(scenario==='deal-follow-through'||scenario==='need-review')(window as any).qaOpportunityCalls=[...((window as any).qaOpportunityCalls||[]),action];
  if(action==='workspace_search'){
   if(scenario==='partial'&&reads.current[action]===1)throw new Error('Search temporarily unavailable');
   if(scenario==='hung'&&reads.current[action]===1)return await new Promise(()=>{});
   if(scenario==='stale'&&body.query==='jose')await new Promise(resolve=>setTimeout(resolve,700));
   const all=['players','recruitment','network','opportunities','deals'].flatMap(source=>buildSearchItems(source as any,source==='players'?data.directory:source==='recruitment'?data.recruitment:source==='opportunities'?data.market:source==='deals'?data.deals:data,base));
   all.push(...buildSearchItems('network',{accounts:{clubs:[{organisation_id:'beyond-club',name:'Beyond Summary Club'}]},contacts:{items:[{person_id:'beyond-contact',person:{full_name:'Beyond Summary Director'}}]}},base));
   all.push(...buildSearchItems('opportunities',{demand:{items:[{club_need_id:'beyond-need',need:{title:'Beyond Summary Need'},club:{name:'Beyond Summary Club'}}]}},base));
   all.push(...buildSearchItems('deals',{portfolio:{deals:[{deal_room_id:'beyond-deal',title:'Beyond Summary Deal'}]}},base));
   const matches=searchWorkspaceItems(filterArchivedSearchItems(all,[{entity_type:'player',entity_id:'qa-player-248'}]),body.query,10000);
   return {search:{items:matches.slice(0,30),total:matches.length,has_more:matches.length>30}};
  }
  if(action==='workspace_need_record'){
   if(scenario==='record-failure'&&reads.current[action]<=2)throw new Error('Exact opportunity temporarily unavailable');
   return {record:{available:body.club_need_id==='beyond-need',item:{club_need_id:body.club_need_id,need:{title:'Beyond Summary Need',position:'Centre back',status:'active'},club:{name:'Beyond Summary Club'},candidate_coverage:{recorded_candidates:1,candidates:[{player_name:'Recorded Candidate',player_match_id:'recorded-match'}]},next_action:{instruction:'Review the recorded candidate.'}}}};
  }
  if(scenario==='need-review'&&action==='scouting_mandate_prepare')return {result:{status:'needs_input',required_inputs:['next_action_text']}};
  if(action==='club_account')return {club:{club:{id:body.organisation_id,name:body.organisation_id==='beyond-club'?'Beyond Summary Club':'Example FC'},summary:{},people:[],needs:[],deals:[]}};
  if(scenario==='deal-follow-through'&&action==='deal_control_fix_prepare')return {result:{status:'needs_input',action_type:'assign_deal_owner',required_inputs:['owner_user_id'],owner_candidates:[{user_id:'qa-owner',name:'Agency Owner'}]}};
  if(action==='deal_war_room')return {war_room:{available:true,deal:{id:body.deal_room_id,title:scenario==='deal-follow-through'?'Example transfer':'Beyond Summary Deal',stage:'recorded'},next_control_fix:scenario==='deal-follow-through'?{instruction:'Assign one accountable deal owner.'}:{},control:{}}};
  if(action==='players_workspace'){const offset=Number(body.offset)||0;const active=data.directory.items.filter(player=>player.player_id!=='qa-player-248');const items=active.slice(offset,offset+100);return {players:{items,total:250,next_offset:offset+items.length,has_more:offset+items.length<250}};}
  if(action==='recruitment_board')return {recruitment:data.recruitment};
  if(action==='player_data_status')return {job:null};
  if(action==='player_context_status')return {review:null};
  if(action==='player_workspace')return {player:{identity:data.directory.items.find(p=>p.player_id===body.player_id)?.identity||{},service:{},agreements:[],documents:[],opportunities:[],deals:[],activity:[]}};
  if((action==='player_profile_core'||action==='player_profile')&&scenario.startsWith('populated'))return {profile:{
   player:{id:body.player_id,first_name:'José',last_name:'Silva',date_of_birth:'2002-04-19',primary_position:'Centre back',current_club:'Wellington Harbour Football Club',current_country:'New Zealand',current_league:'National League Championship',current_season_label:'2026/27',nationalities:['New Zealand','Portugal'],contract_status:'under_contract',contract_expiry:'2027-06-30',verified_at:'2026-10-10T12:00:00Z',verification_status:'verified',transfermarkt_url:'https://example.test/player',wyscout_url:'https://example.test/scouting'},
   career:Array.from({length:6},(_,i)=>({id:'season-'+i,season_label:i===0?'2026/27':String(2026-i)+'/'+String(27-i),club_name:i===0?'Wellington Harbour Football Club':'Harbour Development Football Club',league:'National League Championship',country:'New Zealand',appearances:24-i,starts:22-i,minutes:1980-i*110,goals:2,assists:0,source_name:'Official competition match reports',source_url:'https://example.test/competition',source_reviewed_at:'2026-10-10T12:00:00Z',updated_at:'2026-10-10T12:00:00Z'})),
   settings:savedProfileSettings.current||{intro_line:'A left-footed centre back with first-team experience in New Zealand.',why_review:'Comfortable building play from the back. Review the full-match footage and recorded season figures together.',career_summary:'Progressed from academy football into the first team.'},
   published:{published:true},videos:fixtureVideos.current,documents:[{id:'document',title:'Player CV'}],
   shares:[{id:'share-1',club_name:'North Coast Football Club Recruitment Department',view_count:3,last_viewed_at:'2026-10-11T12:00:00Z',active:true,token:'fixture-share-one',deal_title:'Summer recruitment discussion'},{id:'share-2',club_name:'Riverdale Athletic',view_count:0,active:true,token:'fixture-share-two'}],
   communication:{summary:{connected_items:3},items:[{capture_id:'activity-1',channel:'email',direction:'inbound',person_name:'Recruitment director',summary:'Requested full-match footage and current-season figures before the next recruitment meeting.',owner_name:profileOwner,occurred_at:'2026-10-11T12:00:00Z'}],open_followups:[{task_id:'followup-1',title:'Send reviewed footage and season evidence to North Coast FC',due_at:'2026-10-15T12:00:00Z',owner_name:profileOwner}]},
   deals:[],clubs:[],branding:{support_email:'qa@example.test',primary_color:scenario==='populated-light-brand'?'#FFFFFF':'#24143D',accent_color:'#8B5CF6'},secondary_ready:scenario!=='populated-late-detail',auto_key_stats:[]
  }};
  if(scenario==='populated-share'&&action==='create_options')return {options:{clubs:[{id:'qa-club',name:'QA Recipient FC'}]}};
  if(scenario==='populated-share'&&action==='player_profile_versions')return {versions:[{id:'qa-version',organisation_id:'qa-club',status:'approved',headline:'QA club profile',presentation:{display_name:'José Silva',primary_position:'Centre back',current_club:'Wellington Harbour Football Club',contract_expiry:'2027-06-30',hidden_sections:[]}}]};
  if(scenario==='populated-share'&&action==='player_profile_share_create'){
   (window as any).qaProfileShareCreates=((window as any).qaProfileShareCreates||0)+1;
   await new Promise(resolve=>setTimeout(resolve,300));
   if((window as any).qaProfileShareCreates===1)throw new Error('Could not create the private link. Try again.');
   return {share:{id:'qa-share-created',token:'60000000-0000-4000-8000-000000000001',club_name:'QA Recipient FC',active:true,view_count:0}};
  }
  if(action==='player_profile_detail')return await new Promise(resolve=>{finishLateDetail.current=resolve;(window as any).qaWaitingProfileDetail=true;});
  if(action==='player_profile_video_add'){fixtureVideos.current=[...fixtureVideos.current,{id:'added-film',title:body.title,url:body.url}];return {};}
  if(action==='player_profile_video_remove'){fixtureVideos.current=fixtureVideos.current.filter(video=>video.id!==body.video_id);return {};}
  if(action==='player_profile_save'){
   if(scenario==='populated-save-failure')throw new Error('Profile save temporarily unavailable');
   if(scenario==='populated-late-detail')finishLateDetail.current?.({detail:{secondary_ready:true,documents:[{id:'document',title:'Player CV'}],deals:[],clubs:[],branding:{support_email:'qa@example.test',primary_color:'#24143D',accent_color:'#8B5CF6'},shares:[{id:'late-share',club_name:'Late loaded club recruitment',view_count:1,active:false}],communication:{summary:{connected_items:1},items:[{capture_id:'late-activity',channel:'email',summary:'Progressive detail arrived during Save.'}],open_followups:[]}}});
   await new Promise(resolve=>setTimeout(resolve,300));
   savedProfileSettings.current=body.settings;(window as any).qaProfileSave=body.settings;return {};
  }
  if(action==='player_profile_core'||action==='player_profile')return {profile:{access:fixtureRole!=='owner'?{scope:'assigned',restricted:true}:undefined,player:{id:body.player_id,first_name:user==='a'?'José':'Other',last_name:'Silva',primary_position:'Centre back',current_club:'Example FC',current_country:'NZ',current_league:'Regional League',current_season_label:'2026/27',verification_status:'reviewing'},career:[],settings:{},published:{published:false},videos:[],documents:[],shares:[],deals:[],clubs:[],branding:{support_email:'qa@example.test'},secondary_ready:scenario!=='populated-late-detail',auto_key_stats:[]}};
  throw new Error('Unexpected fixture action '+action);
 },[data,user,scenario,fixtureRole,profileOwner]);
 const rpc=useCallback(async(name:string,args:any={})=>{
  if(scenario==='need-review'&&name==='redream_club_need_patch'){(window as any).qaBriefPatch=args.p_patch;if((window as any).qaBriefEditFails)throw new Error('Request update unavailable');if((window as any).qaBriefEditHangs)return new Promise(()=>{});setBriefPatch(current=>({...current,...args.p_patch}));return {ok:true,brief_version:1};}
  reads.current[name]=(reads.current[name]||0)+1;
  if(name==='redream_relationship_person')return {person:{id:args.p_person_id,full_name:'Beyond Summary Director'},reach:{},employment:{},relationship_memory:{state:'recorded',best_route:{},routes:[]}};
  if(name==='redream_entity_archives')return {items:[]};
  if(name==='redream_autopilot_relationships'){if(scenario==='partial'&&reads.current[name]===1)throw new Error('Network temporarily unavailable');return {accounts:data.accounts,contacts:data.contacts};}
  if(name==='redream_autopilot_market')return data.market;
  if(name==='redream_autopilot_deals')return data.deals;
  return {};
 },[data,scenario]);
 const navigate=(view:string)=>{const next=new URLSearchParams(params.toString());next.set('view',view);for(const key of ['player','profile','person','record','tab'])next.delete(key);window.history.pushState(null,'',base+'?'+next);};
 const navigateHref=(_view:string,href:string)=>{const next=new URL(href,location.origin);for(const key of ['user','scenario','tenant','role','width'])if(params.has(key))next.searchParams.set(key,params.get(key)!);window.history.pushState(null,'',next.pathname+next.search);};
 const refresh=useCallback(async()=>{},[]);
 const loadMore=async()=>{reads.current.pages=(reads.current.pages||0)+1;if(scenario==='page-failure'&&reads.current.pages===1)throw new Error('Next page unavailable');setLoaded(value=>Math.min(250,value+100));};
 const pageData={...data,directory:{items:data.directory.items.filter(player=>player.player_id!=='qa-player-248').slice(0,loaded),total:250,next_offset:loaded,has_more:loaded<250}};
 const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'fixture-tenant-'+tenant,slug:'qa-find-flow',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Example Agency'}};
 const [coordinator]=useState(()=>params.get('coordinator')==='1');
 if(coordinator)return <TenantRuntimeProvider runtime={runtime}><AgencyOperatingWorkspace/></TenantRuntimeProvider>;
 return <TenantRuntimeProvider runtime={runtime}><div className={styles.root} data-qa-ready={ready}>
  <aside className={styles.sidebar}><div className={styles.brand}>Example Agency</div><nav className={styles.nav} aria-label="Agency workspace">
   {['home','players','opportunities','network','calendar'].map(item=><Link key={item} href={base+'?view='+item} onClick={event=>{event.preventDefault();navigate(item);}}>{item==='opportunities'?<><span className={styles.navDesktopLabel}>Opportunities</span><span className={styles.navMobileLabel}>Market</span></>:<span>{item[0].toUpperCase()+item.slice(1)}</span>}</Link>)}
   <WorkspaceSearch compact className={styles.findButton} tenantId={runtime.tenant_id} userId={'fixture-user-'+user} cacheScope={scope} basePath={base} invoke={invoke as any} rpc={rpc as any} seed={{view,data}} onCreate={setCreated}/>
  </nav></aside>
  <main className={styles.main}>
   {['players','network'].includes(view)?<PeopleViewSwitcher basePath={base} view={view} onNavigate={navigateHref}/>:null}
   <div style={{display:'flex',gap:10,marginBottom:16}}><button type="button" data-qa-switch onClick={()=>{const next=new URLSearchParams(params.toString());next.set('user',user==='a'?'b':'a');window.history.replaceState(null,'',base+'?'+next);}}>Switch account</button><button type="button" data-qa-dialog onClick={()=>setOtherDialog(true)}>Open other dialog</button></div>
   <div className={params.get('profile')==='1'?styles.viewStage:undefined} key={scope+':'+view+':'+playerId+':'+(params.get('tab')||'')}>
    {view==='players'?(params.get('profile')==='1'&&playerId?<AgencyPlayerProfile playerId={playerId} cacheScope={scope} backHref={base+'?view=players'} workHref={base+'?view=players&player='+playerId} role={fixtureRole} fallbackAgency={{}} invoke={invoke as any} onOpenAction={()=>{}} onOpenIntelligence={()=>{}}/>:<AgencyPlayersWorkspace stateScope={scope} data={pageData} basePath={base} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onLoadMore={loadMore} onOpenAction={()=>{}}/>):null}
    {view==='network'?<AgencyNetworkWorkspace stateScope={scope} data={data} basePath={base} rpc={rpc as any} onRefresh={refresh} onCreate={()=>{}} onOpenAction={()=>{}} onOpenClubAccount={setClubRequest}/>:null}
    {view==='opportunities'?<AgencyOpportunitiesWorkspace invoke={invoke as any} data={{...data,opportunity_reads:{market:'ready',deals:'ready'}}} basePath={base} rpc={rpc as any} onRetry={()=>{}} onRefresh={refresh} onOpenAction={setActionRequest} onOpenPursuit={request=>{(window as any).qaOpenedOpportunity=request;}} onOpenIntelligence={setDealRequest}/>:null}
    {view==='home'||view==='calendar'?<h1>{view==='home'?'Home':'Calendar'}</h1>:null}
   </div>
   {clubRequest?<AgencyClubAccountDrawer key={scope+clubRequest.key} request={clubRequest} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onClose={()=>setClubRequest(null)} onOpenAction={()=>{}} onOpenDeal={()=>{}} onOpenMarket={()=>{}} onOpenPursuit={()=>{}} onOpenPlayer={()=>{}}/>:null}
   {dealRequest?<AgencyEntityIntelligenceDrawer key={scope+dealRequest.key} presentation={scenario==='deal-follow-through'?'page':undefined} request={dealRequest} invoke={invoke as any} onClose={()=>setDealRequest(null)} onOpenAction={setActionRequest} onOpenCloseout={()=>{}} onOpenNegotiation={()=>{}} onOpenPlayerReview={()=>{}}/>:null}
   {actionRequest?<AgencyActionDrawer key={actionRequest.key} request={actionRequest} invoke={invoke as any} onClose={()=>setActionRequest(null)} onApplied={refresh}/>:null}
   {created?<p role="status">Create {created}</p>:null}
   {otherDialog?<section role="dialog" aria-modal="true" aria-label="Other dialog"><button type="button" onClick={()=>setOtherDialog(false)}>Close other dialog</button></section>:null}
   <output data-qa-reads hidden>{JSON.stringify(reads.current)}</output>
  </main>
  <AgencyMobileNavigation basePath={base} view={view} canSeeBusiness search={{tenantId:runtime.tenant_id,userId:'fixture-user-'+user,cacheScope:scope,basePath:base,invoke:invoke as any,rpc:rpc as any,seed:{view,data},onCreate:setCreated}} onNavigate={navigateHref} onWarm={()=>{}} onConnections={()=>{}} onCaptureCompleted={refresh}/>
 </div></TenantRuntimeProvider>;
}
