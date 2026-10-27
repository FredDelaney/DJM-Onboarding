'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {readWithDeadline} from './read-with-deadline';

type Snapshot<T>={playerId:string|null;data:T|null;loading:boolean;error:string|null};

export function usePlayerPageRead<T>(playerId:string|undefined,read:(playerId:string)=>Promise<T>){
 const owner=playerId||null;
 const generation=useRef(0);
 const [snapshot,setSnapshot]=useState<Snapshot<T>>({playerId:owner,data:null,loading:Boolean(owner),error:null});
 const retry=useCallback(async()=>{
  const request=++generation.current;
  setSnapshot({playerId:owner,data:null,loading:Boolean(owner),error:null});
  if(!owner)return;
  try{
   const data=await readWithDeadline(Promise.resolve().then(()=>read(owner)));
   if(request===generation.current)setSnapshot({playerId:owner,data,loading:false,error:null});
  }catch{
   if(request===generation.current)setSnapshot({playerId:owner,data:null,loading:false,error:'Some information could not load. Please try again.'});
  }
 },[owner,read]);
 useEffect(()=>{
  void retry();
  return()=>{generation.current++;};
 },[retry]);
 const updateData=useCallback((update:(data:T)=>T)=>{
  setSnapshot(current=>current.playerId===owner&&current.data!==null?{...current,data:update(current.data)}:current);
 },[owner]);
 const current=snapshot.playerId===owner?snapshot:{playerId:owner,data:null,loading:Boolean(owner),error:null};
 return {...current,retry,updateData};
}
