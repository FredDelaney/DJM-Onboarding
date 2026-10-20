import { useEffect, useRef, useState } from "react";
import ToolsMenu from '@/components/ToolsMenu';
import workspaceStyles from '@/components/AgencyOperatingWorkspace.module.css';
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { tenantBrandCssVariables } from "@/lib/tenant-brand-style";

export default function Page() {
  const [confirm, setConfirm] = useState(false);
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{const timer=setInterval(()=>setRefresh(value=>value+1),500);return()=>clearInterval(timer);},[]);
  const native = useRef<HTMLDialogElement>(null);
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
