import {useState} from 'react';
import AgencyCreateDrawer, {type AgencyCreateKind} from '@/components/AgencyCreateDrawer';
import {tenantBrandCssVariables} from '@/lib/tenant-brand-style';

const theme = tenantBrandCssVariables({primary: '#16415c', accent: '#acaa74', secondary: '#e9eff2'});

export default function Page() {
  const [kind, setKind] = useState<AgencyCreateKind | null>(null);
  const [refreshed, setRefreshed] = useState(0);
  const invoke = async (action: string, body?: Record<string, unknown>) => {
    const response = await fetch('https://example.supabase.co/functions/v1/create-fixture', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, body}),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Request failed');
    return value;
  };
  return <main data-interface="calm" style={{padding: 20}}>
    <h1>Create records</h1>
    {(['player', 'club', 'contact', 'club_need', 'deal'] as const).map(value => <button key={value} onClick={() => setKind(value)}>Open {value}</button>)}
    <label>Background field<input /></label>
    <p>Refreshed: {refreshed}</p>
    {kind ? <AgencyCreateDrawer key={kind} kind={kind} theme={theme} invoke={invoke} onClose={() => setKind(null)} onCreated={async () => {await invoke('fixture_refresh'); setRefreshed(value => value + 1);}} /> : null}
  </main>;
}
