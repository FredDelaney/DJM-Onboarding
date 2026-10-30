import {useCallback,useEffect,useState} from 'react';
import AgencyPursuitRoom from '@/components/AgencyPursuitRoom';
import {platformInvoke,platformRpc} from '@/lib/platform-client';
import {tenantBrandCssVariables} from '@/lib/tenant-brand-style';
import operatingStyles from '@/components/AgencyOperatingWorkspace.module.css';

export default function Page(){
 const [match,setMatch]=useState('match-a'),[open,setOpen]=useState(true),[refreshKey,setRefreshKey]=useState(0),[relatedOpen,setRelatedOpen]=useState(false);
 const [access,setAccess]=useState(''),[reviewPlayer,setReviewPlayer]=useState(''),[assessment,setAssessment]=useState(false);
 const [brand,setBrand]=useState('#111827');
 useEffect(()=>{const query=new URLSearchParams(location.search);setAccess(query.get('access')||'');setAssessment(query.has('assessment'));setBrand(query.get('brand')==='light'?'#f5e64c':query.get('brand')==='other'?'#7f1d1d':'#111827');},[]);
 const market=access?{market:{pursuits:{items:[{player_match_id:'match-a',access_strategy:access==='missing'?null:{recommended_mode:'develop_access'},best_access_route:access==='known'?{person_name:'QA Club Contact',why_this_route:'Recorded direct relationship.'}:null}]}}}:assessment?{market:{pursuits:{items:[{player_match_id:'match-a',readiness_score:99,missing_factors:['commercial_fit']}]}}}:{};
 const invoke=useCallback((action:string,body?:Record<string,unknown>,signal?:AbortSignal)=>platformInvoke('agency-market',{action,tenant_id:'agency-a',...body},undefined,{signal}),[]);
 const rpc=useCallback(<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>platformRpc<T>(name,args,'fixture-agency',signal),[]);
 return <main className={operatingStyles.root} style={{...tenantBrandCssVariables({primary:brand}),display:"block"}} data-interface="calm"><button type="button" onClick={()=>{setMatch('match-b');setOpen(true);}}>Switch opportunity</button>{reviewPlayer?<p>Player details: {reviewPlayer}</p>:null}{open?<AgencyPursuitRoom key={match} refreshKey={refreshKey} presentation="page" request={{key:match,playerMatchId:match,playerId:match==='match-a'?'player-a':'player-b',playerName:match==='match-a'?'Example Player':'Second Player',clubId:'club-a',clubName:'Example FC',accessLabel:access?'Previous cached contact':null}} role="owner" marketData={market} invoke={invoke} rpc={rpc} onClose={()=>setOpen(false)} onOpenAction={()=>setRelatedOpen(true)} onOpenDeal={()=>setOpen(false)} onOpenPlayerProfile={id=>{setReviewPlayer(id);setOpen(false);}} onApplied={()=>{}}/>:<p>Opportunity list</p>}{relatedOpen?<div role="dialog" aria-modal="true" aria-label="Related career approval" style={{position:'fixed',inset:'20px 20px auto',zIndex:99999,background:'white',padding:24}}><button type="button" onClick={()=>{setRefreshKey(value=>value+1);setRelatedOpen(false);}}>Confirm synthetic career approval</button></div>:null}</main>;
}
