'use client';
import {Fragment,useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import JourneyStatus from '@/components/JourneyStatus';
import {supabase} from '@/lib/supabase';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {friendlyError} from '@/lib/platform-client';

export default function CaptureSession({children}:{children:ReactNode}){
 const [userId,setUserId]=useState<string|null|undefined>(undefined);
 const [returnPath,setReturnPath]=useState('/tell');
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true,authEventReceived=false;
  setError('');
  setReturnPath(window.location.pathname+window.location.search);
  void readWithDeadline(supabase.auth.getSession())
   .then(({data,error:sessionError})=>{
    if(!active||authEventReceived)return;
    if(sessionError)throw sessionError;
    setUserId(data.session?.user.id??null);
   })
   .catch(loadError=>{
    if(active&&!authEventReceived)setError(friendlyError(loadError));
   });
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(!active)return;
   authEventReceived=true;
   setError('');
   setUserId(session?.user.id??null);
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[attempt]);
 if(error)return <JourneyStatus kind="error" title="Could not check your sign-in" description={error} onRetry={()=>setAttempt(value=>value+1)}/>;
 if(userId===undefined)return <JourneyStatus kind="loading" title="Opening Capture" description="Checking your sign-in before opening this update."/>;
 if(!userId)return <p><Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to open your update</Link></p>;
 return <Fragment key={userId}>{children}</Fragment>;
}
