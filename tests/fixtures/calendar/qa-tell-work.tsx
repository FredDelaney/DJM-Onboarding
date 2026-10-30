import { useState } from 'react';
import AiCapture from '@/components/AiCapture';
import {supabase} from '@/lib/supabase';

export default function Page() {
  const [workspace,setWorkspace]=useState('qa-tell-work');
  const [resume,setResume]=useState(true);
  const [unsafe,setUnsafe]=useState(false);
  return <main style={{maxWidth:600,margin:'auto',padding:16}}>
    <button onClick={()=>setWorkspace(current=>current==='qa-tell-work'?'other-workspace':'qa-tell-work')}>Switch test workspace</button>
    <button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out test account</button>
    <button onClick={()=>void supabase.auth.signInWithPassword({email:'other@example.test',password:'fixture'})}>Sign in other test account</button>
    <button onClick={()=>setResume(false)}>Start new test note</button>
    <output data-qa-unsafe hidden>{unsafe?'unsafe':'safe'}</output>
    <AiCapture key={workspace+':'+resume} onUnsafeToCloseChange={setUnsafe} resolvedWorkspaceSlug={workspace} resumeCaptureId={resume?"30000000-0000-4000-8000-000000000001":null} />
  </main>;
}
