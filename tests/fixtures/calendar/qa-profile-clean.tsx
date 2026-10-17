import {useCallback} from 'react';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';
import operatingStyles from '@/components/AgencyOperatingWorkspace.module.css';

export default function Page() {
  const invoke = useCallback(async (action: string, body?: Record<string, unknown>) => {
    const response = await fetch('https://example.supabase.co/functions/v1/profile-fixture', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, body}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }, []);
  return <main className={operatingStyles.root} data-interface="calm" style={{display: 'block', padding: 16}}>
    <AgencyPlayerProfile playerId="fixture-profile" backHref="/qa-profile-clean" cacheScope="profile-clean"
      role="owner" fallbackAgency={{display_name: 'Example Agency', support_email: 'agent@example.test'}}
      invoke={invoke as any} onOpenAction={() => {}} onOpenIntelligence={() => {}} />
  </main>;
}
