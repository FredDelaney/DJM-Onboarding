import { useState } from 'react';
import AiCapture from '@/components/AiCapture';

export default function Page() {
  const [workspace,setWorkspace]=useState('qa-tell-work');
  return <main style={{maxWidth:600,margin:'auto',padding:16}}>
    <button onClick={()=>setWorkspace('other-workspace')}>Switch test workspace</button>
    <AiCapture key={workspace} resolvedWorkspaceSlug={workspace} resumeCaptureId="30000000-0000-4000-8000-000000000001" />
  </main>;
}
