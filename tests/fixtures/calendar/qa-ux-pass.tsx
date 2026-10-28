import { useEffect, useRef, useState } from "react";
import ToolsMenu from '@/components/ToolsMenu';
import workspaceStyles from '@/components/AgencyOperatingWorkspace.module.css';
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { tenantBrandCssVariables } from "@/lib/tenant-brand-style";
import JourneyStatus from '@/components/JourneyStatus';
import contactStyles from '@/components/RecordContactActions.module.css';

export function getServerSideProps({query}: {query: Record<string, string>}) {
  return {props: {screen: query.screen || '', brand: query.brand || 'teal'}};
}

export default function Page({screen, brand}: {screen: string; brand: string}) {
  const [confirm, setConfirm] = useState(false);
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{const timer=setInterval(()=>setRefresh(value=>value+1),500);return()=>clearInterval(timer);},[]);
  const native = useRef<HTMLDialogElement>(null);
  if (screen === 'controls') return <main className={workspaceStyles.root} data-interface="calm" style={{
    ...tenantBrandCssVariables({primary: brand === 'gold' ? '#F5E900' : brand === 'navy' ? '#061F3A' : '#155E59', accent: '#B49568'}),
    display: 'block', padding: 24,
  }}>
    <h1>Workspace controls</h1>
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24}}>
      <button data-ui-button="primary" className={workspaceStyles.primaryButton}>Save changes</button>
      <a data-ui-button="primary" className={workspaceStyles.primaryButton} href="#player">Open player profile</a>
      <button data-ui-button="secondary" className={workspaceStyles.secondaryButton}>Cancel</button>
      <button data-ui-button="primary" className={workspaceStyles.primaryButton} disabled>Saving changes</button>
    </div>
    <section aria-label="Dark surface" style={{padding: 20, background: '#0B2D49', display: 'flex', flexWrap: 'wrap', gap: 12}}>
      <button data-ui-button="primary" data-ui-tone="inverse" className={workspaceStyles.primaryButton}>View work</button>
      <button data-ui-button="secondary" data-ui-tone="inverse" className={workspaceStyles.secondaryButton}>Review details</button>
    </section>
    <div className={contactStyles.actions} style={{margin: '24px 0'}}>
      <a className={contactStyles.whatsapp} href="https://wa.me/10000000000">WhatsApp</a>
      <a className={contactStyles.email} href="mailto:example@example.test">Email</a>
    </div>
    <JourneyStatus kind="error" title="Could not load record" description="Please try again."/>
    <JourneyStatus kind="success" title="Changes saved" description="The update is confirmed."/>
  </main>;
  return (
    <main
      data-refresh={refresh}
      data-interface="calm"
      style={{
        ...tenantBrandCssVariables({ primary: "#23483f", accent: "#b49568" }),
        minHeight: 2600,
        padding: 24,
      }}
    >
      <h1>Workspace interaction checks</h1>
      <ToolsMenu className={workspaceStyles.workspaceTools} menuClassName={workspaceStyles.workspaceToolsMenu} label="Interaction tools"><button type="button">Refresh fixture</button></ToolsMenu>
      <button onClick={() => setConfirm(true)}>Review long confirmation</button>
      <button onClick={() => native.current?.showModal()}>
        Open native dialog
      </button>
      <p>Scroll position should survive opening and closing dialogs.</p>
      <ConfirmActionDialog
        open={confirm}
        title="Discard the changes to this player’s preparation?"
        description="Your edited player details, representation terms and recipient-specific wording have not been saved. Keep editing to review them, or discard this draft and return to the saved version. The saved document and previously shared versions will remain available. No message will be sent to the player or club."
        confirmLabel="Discard changes"
        tone="warning"
        onClose={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
      <dialog
        ref={native}
        aria-label="Native review"
        style={{ width: 300, padding: 24, borderRadius: 16 }}
      >
        <h2>Review before sharing</h2>
        <p>A native dialog must also hold the page still.</p>
        <button onClick={() => native.current?.close()}>Close review</button>
      </dialog>
    </main>
  );
}
