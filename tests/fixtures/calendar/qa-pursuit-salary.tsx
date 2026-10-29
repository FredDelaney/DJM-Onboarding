import {useCallback,useState} from 'react';
import AgencyPursuitRoom from '@/components/AgencyPursuitRoom';
import {platformInvoke,platformRpc} from '@/lib/platform-client';

export default function Page(){
 const [match,setMatch]=useState('match-a'),[open,setOpen]=useState(true),[refreshKey,setRefreshKey]=useState(0),[relatedOpen,setRelatedOpen]=useState(false);
 const invoke=useCallback((action:string,body?:Record<string,unknown>,signal?:AbortSignal)=>platformInvoke('agency-market',{action,tenant_id:'agency-a',...body},undefined,{signal}),[]);
 const rpc=useCallback(<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>platformRpc<T>(name,args,'fixture-agency',signal),[]);
 return <main data-interface="calm"><button type="button" onClick={()=>{setMatch('match-b');setOpen(true);}}>Switch opportunity</button>{open?<AgencyPursuitRoom key={match} refreshKey={refreshKey} presentation="page" request={{key:match,playerMatchId:match,playerId:match==='match-a'?'player-a':'player-b',playerName:match==='match-a'?'Example Player':'Second Player',clubId:'club-a',clubName:'Example FC'}} role="owner" marketData={{}} invoke={invoke} rpc={rpc} onClose={()=>setOpen(false)} onOpenAction={()=>setRelatedOpen(true)} onOpenDeal={()=>setOpen(false)} onApplied={()=>{}}/>:<p>Opportunity list</p>}{relatedOpen?<div role="dialog" aria-modal="true" aria-label="Related career approval" style={{position:'fixed',inset:'20px 20px auto',zIndex:99999,background:'white',padding:24}}><button type="button" onClick={()=>{setRefreshKey(value=>value+1);setRelatedOpen(false);}}>Confirm synthetic career approval</button></div>:null}</main>;
}
