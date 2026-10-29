import {useCallback,useState} from 'react';
import AgencyPursuitRoom from '@/components/AgencyPursuitRoom';
import {platformInvoke,platformRpc} from '@/lib/platform-client';

export default function Page(){
 const [match,setMatch]=useState('match-a'),[open,setOpen]=useState(true);
 const invoke=useCallback((action:string,body?:Record<string,unknown>,signal?:AbortSignal)=>platformInvoke('agency-market',{action,tenant_id:'agency-a',...body},undefined,{signal}),[]);
 const rpc=useCallback(<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>platformRpc<T>(name,args,'fixture-agency',signal),[]);
 return <main data-interface="calm"><button type="button" onClick={()=>{setMatch('match-b');setOpen(true);}}>Switch opportunity</button>{open?<AgencyPursuitRoom key={match} presentation="page" request={{key:match,playerMatchId:match,playerId:match==='match-a'?'player-a':'player-b',playerName:match==='match-a'?'Example Player':'Second Player',clubId:'club-a',clubName:'Example FC'}} role="owner" marketData={{}} invoke={invoke} rpc={rpc} onClose={()=>setOpen(false)} onOpenAction={()=>{}} onOpenDeal={()=>setOpen(false)} onApplied={()=>{}}/>:<p>Opportunity list</p>}</main>;
}
