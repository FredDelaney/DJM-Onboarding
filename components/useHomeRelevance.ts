'use client';
import {useEffect,useState} from 'react';
import type {CalendarRpc} from '@/lib/calendar/tasks';
import {readHomeRelevance} from '@/lib/home-relevance';
import {readWithDeadline} from '@/lib/read-with-deadline';

export function useHomeRelevance(rpc:CalendarRpc,scope:string,tenantId:string,signature:string,overview:boolean,version:unknown) {
 const [reload,setReload]=useState(0);
 const key=JSON.stringify([scope,signature,overview,version,reload]);
 const [state,setState]=useState<{key:string;visible:number[];editable:number[];personalisationReady:boolean;error:string}|null>(null);
 useEffect(()=>{
  const refresh=()=>setReload(value=>value+1);
  window.addEventListener('redream:responsibilities-updated',refresh);
  return()=>window.removeEventListener('redream:responsibilities-updated',refresh);
 },[]);
 useEffect(()=>{
  let alive=true;
  void readWithDeadline(readHomeRelevance(rpc,JSON.parse(signature),tenantId,overview)).then(result=>{
   if(alive)setState({key,...result,error:''});
  },()=>{if(alive)setState({key,visible:[],editable:[],personalisationReady:true,error:'Could not check which updates are for you.'});});
  return()=>{alive=false;};
 },[rpc,key,signature,tenantId,overview]);
 const current=state?.key===key?state:null;
 return {visible:new Set(current?.visible||[]),editable:new Set(current?.editable||[]),personalisationReady:current?.personalisationReady!==false,loading:!current,error:current?.error||'',retry:()=>setReload(value=>value+1)};
}
