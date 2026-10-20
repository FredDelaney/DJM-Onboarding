import { useState } from 'react';
import AiCapture from '@/components/AiCapture';
import {supabase} from '@/lib/supabase';

export default function Page() {
  const [workspace,setWorkspace]=useState('qa-tell-work');
  return <main style={{maxWidth:600,margin:'auto',padding:16}}>
    <button onClick={()=>setWorkspace('other-workspace')}>Switch test workspace</button>
    <button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sign out test account</button>
    <AiCapture key={workspace} resolvedWorkspaceSlug={workspace} resumeCaptureId="30000000-0000-4000-8000-000000000001" />
  </main>;
}
