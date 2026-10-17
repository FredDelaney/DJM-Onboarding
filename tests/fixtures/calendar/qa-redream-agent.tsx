import { useState } from 'react';
import AiCapture from '@/components/AiCapture';

export default function Page() {
  const [workspace, setWorkspace] = useState('djm');
  return <main style={{ maxWidth: 640, margin: 'auto', padding: 16 }}>
    <button onClick={() => setWorkspace('northstar')}>Switch test workspace</button>
    <AiCapture key={workspace} resolvedWorkspaceSlug={workspace} context={{ player_name: 'Example Player', label: 'Example Player' }} />
  </main>;
}
