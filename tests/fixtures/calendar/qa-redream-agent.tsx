import { useState } from 'react';
import AiCapture from '@/components/AiCapture';
import {supabase} from '@/lib/supabase';

export default function Page() {
  const [workspace, setWorkspace] = useState('djm');
  return <main style={{ maxWidth: 640, margin: 'auto', padding: 16 }}>
    <button onClick={() => setWorkspace(current=>current==='djm'?'northstar':'djm')}>Switch test workspace</button>
    <button onClick={() => void supabase.auth.signOut({scope:'local'})}>Sign out test account</button>
    <AiCapture key={workspace} resolvedWorkspaceSlug={workspace} context={{ player_name: 'Example Player', label: 'Example Player' }} />
  </main>;
}
