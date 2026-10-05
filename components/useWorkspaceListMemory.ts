'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {listMemoryKey,readListMemory} from '@/lib/workspace-list-memory';

export function useWorkspaceListMemory<T extends Record<string,string>>(scope:string,list:string,initial:T){
 const key=scope?listMemoryKey(scope,list):'';
 const defaults=useRef(initial);
 const [state,setState]=useState<T>(initial),[ready,setReady]=useState('');
 useEffect(()=>{
  let restored=defaults.current;
  try{if(key)restored=readListMemory(sessionStorage.getItem(key),defaults.current);}catch{}
  setState(restored);setReady(key);
 },[key]);
 useEffect(()=>{
  if(!key||ready!==key)return;
  try{sessionStorage.setItem(key,JSON.stringify(state));}catch{}
 },[key,ready,state]);
 const update=useCallback((patch:Partial<T>)=>setState(current=>({...current,...patch})),[]);
 return {state:ready===key?state:defaults.current,update,ready:ready===key};
}
export function rememberListPosition(scope:string,list:string){
 if(!scope)return;
 try{sessionStorage.setItem(listMemoryKey(scope,list)+':scroll',String(window.scrollY));}catch{}
}
export function useRestoreListPosition(scope:string,list:string,visible:boolean){
 useEffect(()=>{
  if(!scope||!visible)return;
  let top=0;try{top=Number(sessionStorage.getItem(listMemoryKey(scope,list)+':scroll'));}catch{}
  if(!Number.isFinite(top)||top<0)return;
  const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>window.scrollTo({top,behavior:'instant'}));});
  let second=0;
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[scope,list,visible]);
}
