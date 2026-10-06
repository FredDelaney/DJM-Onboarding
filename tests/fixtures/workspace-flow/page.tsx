'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import AgencyOperatingWorkspace from '@/components/AgencyOperatingWorkspace';
import AgencyClubAccountDrawer from '@/components/AgencyClubAccountDrawer';
import AgencyEntityIntelligenceDrawer from '@/components/AgencyEntityIntelligenceDrawer';
import {supabase} from '@/lib/supabase';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import AgencyNetworkWorkspace from '@/components/AgencyNetworkWorkspace';
import AgencyOpportunitiesWorkspace from '@/components/AgencyOpportunitiesWorkspace';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';
import styles from '@/components/AgencyOperatingWorkspace.module.css';
import {buildSearchItems,searchWorkspaceItems,filterArchivedSearchItems} from '@/lib/workspace-search';
const base='/workspace/qa-find-flow';
export default function Page(){
 const params=useSearchParams(),user=params.get('user')||'a',scenario=params.get('scenario')||'normal',tenant=params.get('tenant')||'a';
 const fixtureRole=params.get('role')||'owner';
 const scope='fixture-tenant-'+tenant+':fixture-user-'+user+':'+fixtureRole,view=params.get('view')||'players',playerId=params.get('player')||'';
 const [created,setCreated]=useState(''),[otherDialog,setOtherDialog]=useState(false),reads=useRef<Record<string,number>>({});
 const [loaded,setLoaded]=useState(100);useEffect(()=>setLoaded(100),[user]);
 const [clubRequest,setClubRequest]=useState<any>(null),[dealRequest,setDealRequest]=useState<any>(null);
 useEffect(()=>{
  (window as any).qaSignIn=(email:string)=>supabase.auth.signInWithPassword({email,password:'fixture'});
  return()=>{delete (window as any).qaSignIn;};
 },[]);
 const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
 const data=useMemo(()=>({
  directory:{items:Array.from({length:251},(_,i)=>({player_id:'qa-player-'+i,identity:{name:i===0?(user==='a'?'José Silva':'Other Account Player'):'Example Player '+i,current_club:'Example FC',primary_position:'Centre back',current_country:'NZ'},service:{},active_opportunities:0}))},
  recruitment:{items:[{id:'qa-target',full_name:'Recruitment Prospect',current_club:'Example FC',ui_stage:'identified'}]},
  accounts:{clubs:[{organisation_id:'qa-club',name:'Example FC',country:'NZ',league_name:'Regional League',access:{direct_score:80}}]},
  contacts:{items:[{person_id:'qa-contact',person:{full_name:'Dapo Director'},employment:{organisation_id:'qa-club',organisation_name:'Example FC',role_title:'Director'},relationship:{route_score:80}},{person_id:'qa-scout',person:{full_name:'Moses Scout'},employment:{organisation_name:'Other FC',role_title:'Scout'},relationship:{route_score:30}}]},
  market:{demand:{items:[{club_need_id:'qa-need',need:{title:'Centre back needed',position:'Centre back'},club:{name:'Example FC'},candidate_coverage:{candidates:[]}}]},pursuits:{items:[]}},
  deals:{portfolio:{deals:[{deal_room_id:'qa-deal',title:'Example transfer',organisation:'Example FC',stage:'open'}]}}
 }),[user]);
 const invoke=useCallback(async(action:string,body:any={})=>{
  reads.current[action]=(reads.current[action]||0)+1;
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
  if(action==='club_account')return {club:{club:{id:body.organisation_id,name:body.organisation_id==='beyond-club'?'Beyond Summary Club':'Example FC'},summary:{},people:[],needs:[],deals:[]}};
  if(action==='deal_war_room')return {war_room:{available:true,deal:{id:body.deal_room_id,title:'Beyond Summary Deal',stage:'recorded'},next_control_fix:{},control:{}}};
  if(action==='players_workspace'){const offset=Number(body.offset)||0;const active=data.directory.items.filter(player=>player.player_id!=='qa-player-248');const items=active.slice(offset,offset+100);return {players:{items,total:250,next_offset:offset+items.length,has_more:offset+items.length<250}};}
  if(action==='recruitment_board')return {recruitment:data.recruitment};
  if(action==='player_data_status')return {job:null};
  if(action==='player_workspace')return {player:{identity:data.directory.items.find(p=>p.player_id===body.player_id)?.identity||{},service:{},agreements:[],documents:[],opportunities:[],deals:[],activity:[]}};
  if(action==='player_profile_core'||action==='player_profile')return {profile:{access:fixtureRole!=='owner'?{scope:'assigned',restricted:true}:undefined,player:{id:body.player_id,first_name:user==='a'?'José':'Other',last_name:'Silva',primary_position:'Centre back',current_club:'Example FC',current_country:'NZ',current_league:'Regional League',current_season_label:'2026/27',verification_status:'reviewing'},career:[],settings:{},published:{published:false},videos:[],documents:[],shares:[],deals:[],clubs:[],branding:{support_email:'qa@example.test'},secondary_ready:true,auto_key_stats:[]}};
  throw new Error('Unexpected fixture action '+action);
 },[data,user,scenario,fixtureRole]);
 const rpc=useCallback(async(name:string,args:any={})=>{
  reads.current[name]=(reads.current[name]||0)+1;
  if(name==='redream_relationship_person')return {person:{id:args.p_person_id,full_name:'Beyond Summary Director'},reach:{},employment:{},relationship_memory:{state:'recorded',best_route:{},routes:[]}};
  if(name==='redream_entity_archives')return {items:[]};
  if(name==='redream_autopilot_relationships'){if(scenario==='partial'&&reads.current[name]===1)throw new Error('Network temporarily unavailable');return {accounts:data.accounts,contacts:data.contacts};}
  if(name==='redream_autopilot_market')return data.market;
  if(name==='redream_autopilot_deals')return data.deals;
  return {};
 },[data,scenario]);
 const navigate=(view:string)=>{const next=new URLSearchParams(params.toString());next.set('view',view);for(const key of ['player','profile','person','record','tab'])next.delete(key);window.history.pushState(null,'',base+'?'+next);};
 const refresh=useCallback(async()=>{},[]);
 const loadMore=async()=>{reads.current.pages=(reads.current.pages||0)+1;if(scenario==='page-failure'&&reads.current.pages===1)throw new Error('Next page unavailable');setLoaded(value=>Math.min(250,value+100));};
 const pageData={...data,directory:{items:data.directory.items.filter(player=>player.player_id!=='qa-player-248').slice(0,loaded),total:250,next_offset:loaded,has_more:loaded<250}};
 const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'fixture-tenant-'+tenant,slug:'qa-find-flow',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Example Agency'}};
 if(params.get('coordinator')==='1')return <TenantRuntimeProvider runtime={runtime}><AgencyOperatingWorkspace/></TenantRuntimeProvider>;
 return <TenantRuntimeProvider runtime={runtime}><div className={styles.root} data-qa-ready={ready}>
  <aside className={styles.sidebar}><div className={styles.brand}>Example Agency</div><nav className={styles.nav} aria-label="Agency workspace">
   {['home','players','opportunities','network','calendar'].map(item=><Link key={item} href={base+'?view='+item} onClick={event=>{event.preventDefault();navigate(item);}}>{item==='opportunities'?<><span className={styles.navDesktopLabel}>Opportunities</span><span className={styles.navMobileLabel}>Market</span></>:<span>{item[0].toUpperCase()+item.slice(1)}</span>}</Link>)}
   <WorkspaceSearch compact className={styles.findButton} tenantId={runtime.tenant_id} userId={'fixture-user-'+user} cacheScope={scope} basePath={base} invoke={invoke as any} rpc={rpc as any} seed={{view,data}} onCreate={setCreated}/>
  </nav></aside>
  <main className={styles.main}>
   <div style={{display:'flex',gap:10,marginBottom:16}}><button type="button" data-qa-switch onClick={()=>{const next=new URLSearchParams(params.toString());next.set('user',user==='a'?'b':'a');window.history.replaceState(null,'',base+'?'+next);}}>Switch account</button><button type="button" data-qa-dialog onClick={()=>setOtherDialog(true)}>Open other dialog</button></div>
   <div key={scope+':'+view+':'+playerId+':'+(params.get('tab')||'')}>
    {view==='players'?(params.get('profile')==='1'&&playerId?<AgencyPlayerProfile playerId={playerId} cacheScope={scope} backHref={base+'?view=players'} workHref={base+'?view=players&player='+playerId} role={fixtureRole} fallbackAgency={{}} invoke={invoke as any} onOpenAction={()=>{}} onOpenIntelligence={()=>{}}/>:<AgencyPlayersWorkspace stateScope={scope} data={pageData} basePath={base} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onLoadMore={loadMore} onOpenAction={()=>{}}/>):null}
    {view==='network'?<AgencyNetworkWorkspace stateScope={scope} data={data} basePath={base} rpc={rpc as any} onRefresh={refresh} onCreate={()=>{}} onOpenAction={()=>{}} onOpenClubAccount={setClubRequest}/>:null}
    {view==='opportunities'?<AgencyOpportunitiesWorkspace invoke={invoke as any} data={{...data,opportunity_reads:{market:'ready',deals:'ready'}}} basePath={base} rpc={rpc as any} onRetry={()=>{}} onRefresh={refresh} onOpenAction={()=>{}} onOpenPursuit={()=>{}} onOpenIntelligence={setDealRequest}/>:null}
    {view==='home'||view==='calendar'?<h1>{view==='home'?'Home':'Calendar'}</h1>:null}
   </div>
   {clubRequest?<AgencyClubAccountDrawer key={scope+clubRequest.key} request={clubRequest} invoke={invoke as any} rpc={rpc as any} onRefresh={refresh} onClose={()=>setClubRequest(null)} onOpenAction={()=>{}} onOpenDeal={()=>{}} onOpenMarket={()=>{}} onOpenPursuit={()=>{}} onOpenPlayer={()=>{}}/>:null}
   {dealRequest?<AgencyEntityIntelligenceDrawer key={scope+dealRequest.key} request={dealRequest} invoke={invoke as any} onClose={()=>setDealRequest(null)} onOpenAction={()=>{}} onOpenCloseout={()=>{}} onOpenNegotiation={()=>{}} onOpenPlayerReview={()=>{}}/>:null}
   {created?<p role="status">Create {created}</p>:null}
   {otherDialog?<section role="dialog" aria-modal="true" aria-label="Other dialog"><button type="button" onClick={()=>setOtherDialog(false)}>Close other dialog</button></section>:null}
   <output data-qa-reads hidden>{JSON.stringify(reads.current)}</output>
  </main>
 </div></TenantRuntimeProvider>;
}
