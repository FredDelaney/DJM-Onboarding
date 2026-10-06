'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowRight,LoaderCircle} from 'lucide-react';
import Brand from '@/components/Brand';
import {platformInvoke,friendlyError} from '@/lib/platform-client';
import {verifiedPlayerPortalUrl} from '@/lib/player-portal-entry';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {supabase} from '@/lib/supabase';

type Workspace={player_id:string;portal_hostname?:string;agency?:{display_name?:string}};
export default function PlayerWorkspaces(){
 const router=useRouter();
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const sequence=useRef(0);
 const load=useCallback(async()=>{
  const request=++sequence.current;
  setBusy(true);setError('');
  try{
   const {data,error:sessionError}=await readWithDeadline(supabase.auth.getSession());
   if(request!==sequence.current)return;
   if(sessionError)throw sessionError;
   if(!data.session){router.replace('/sign-in');return;}
   const result=await readWithDeadline(platformInvoke<{workspaces?:Workspace[]}>('player-os',{action:'workspaces'}));
   if(request===sequence.current)setWorkspaces(Array.isArray(result?.workspaces)?result.workspaces:[]);
  }catch(error){if(request===sequence.current)setError(friendlyError(error));}
  finally{if(request===sequence.current)setBusy(false);}
 },[router]);
 useEffect(()=>{
  void load();
  const {data}=supabase.auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'){sequence.current++;setWorkspaces([]);router.replace('/sign-in');}
   else if(event==='SIGNED_IN'){sequence.current++;setWorkspaces([]);void load();}
  });
  return()=>{sequence.current++;data.subscription.unsubscribe();};
 },[load,router]);
 return <main className="auth-wrap">
  <section className="auth-brand"><Brand light/><div><div className="yellow-line"/><h1>Your private player workspace.</h1><p>Your agency manages player access through its own private portal.</p></div></section>
  <section className="auth-form"><div className="auth-box">
   <h2>Choose your agency.</h2><p className="page-intro">Open your agency's verified player portal. You may be asked to sign in again.</p>
   <div className="stack" style={{marginTop:24}}>
    {busy?<p role="status"><LoaderCircle size={16}/> Finding your player workspaces...</p>:null}
    {error?<div role="alert"><p>{error}</p><button className="btn btn-navy btn-block" onClick={()=>void load()}>Try again</button></div>:null}
    {!busy&&!error?workspaces.map(workspace=>{
     const href=verifiedPlayerPortalUrl(workspace.portal_hostname);
     return <section className="card pad" key={workspace.player_id}>
      <h3>{workspace.agency?.display_name||'Your agency'}</h3>
      {href?<a href={href} className="btn btn-navy btn-block" style={{marginTop:12}}>Open player portal <ArrowRight size={17}/></a>:<p className="small muted">Your agency has not configured a verified player portal yet. Contact the representative who invited you.</p>}
     </section>;
    }):null}
    {!busy&&!error&&!workspaces.length?<p>No linked player workspace is available. Contact the representative who invited you.</p>:null}
    <button className="btn btn-block" onClick={async()=>{await supabase.auth.signOut();router.replace('/sign-in');}}>Use another account</button>
    <Link href="/sign-in" className="small muted">Back to sign in</Link>
   </div>
  </div></section>
 </main>;
}
