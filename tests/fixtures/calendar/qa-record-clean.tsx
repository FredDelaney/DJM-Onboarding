import {useCallback, useState} from 'react';
import AgencyClubAccountDrawer from '@/components/AgencyClubAccountDrawer';
import AgencyContactIntelligenceDrawer from '@/components/AgencyContactIntelligenceDrawer';
import AgencyEntityIntelligenceDrawer from '@/components/AgencyEntityIntelligenceDrawer';
import styles from '@/components/AgencyOperatingWorkspace.module.css';

const noop = () => {};
const refresh = async () => {};
export async function getServerSideProps({query}: {query: Record<string, string>}) {
  return {props: {kind: query.kind || 'club'}};
}
export default function Page({kind}: {kind: string}) {
  const [opened, setOpened] = useState('');
  const call = useCallback(async (action: string, body?: Record<string, unknown>) => {
    const response = await fetch('https://example.supabase.co/functions/v1/record-fixture', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, body}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }, []);
  return <main className={styles.root} data-interface="calm" style={{display: 'block', padding: 16}}>
    <p role="status" style={{position: 'fixed', zIndex: 200, bottom: 0}}>{opened}</p>
    {kind === 'club' ? <AgencyClubAccountDrawer request={{key: 'club', organisationId: 'club-fixture', title: 'Example FC'}} invoke={call} rpc={call as any} onRefresh={refresh} onClose={noop} onOpenAction={noop} onOpenDeal={noop} onOpenMarket={needId => setOpened(needId ? 'Need opened: ' + needId : 'Opportunities opened')} onOpenPursuit={noop} onOpenPlayer={noop} presentation="page"/> : null}
    {kind === 'contact' ? <AgencyContactIntelligenceDrawer contact={{person_id: 'person-fixture'}} rpc={call as any} onClose={noop} onRefresh={refresh} onOpenClub={noop} presentation="page"/> : null}
    {kind === 'deal' ? <AgencyEntityIntelligenceDrawer request={{key: 'deal', kind: 'deal', entityId: 'deal-fixture', title: 'Example transfer'}} invoke={call} onClose={noop} onOpenAction={noop} onOpenCloseout={noop} onOpenNegotiation={() => setOpened('Negotiation opened')} onOpenPlayerReview={noop} presentation="page"/> : null}
  </main>;
}
