import { useCallback, useState } from 'react';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { tenantBrandCssVariables } from '@/lib/tenant-brand-style';
import styles from '@/components/AgencyOperatingWorkspace.module.css';

const control = { fix_type: 'set_player_next_action', instruction: 'Set one concrete player next action and due date.' };
const maintain = { move_type: 'maintain_player_plan', instruction: 'Keep the player plan current.' };
const player = (id: string, name: string, extra: any = {}) => ({
  player_id: id, identity: { name, primary_position: 'Centre back', current_club: 'Example FC', ...extra.identity },
  service: { next_control_fix: control, next_service_move: maintain, ...extra.service },
  access: extra.access,
});
const players = [
  player('setup', 'Plan Player'),
  player('contract', 'Contract Player', { service: { next_service_move: { move_type: 'contract_strategy', instruction: 'Agree the extension strategy.' } } }),
  player('overdue', 'Overdue Player', { identity: { next_action: 'Call the club about the trial', next_action_due: '2020-10-20' } }),
  player('future', 'Future Player', { identity: { next_action: 'Confirm the summer schedule', next_action_due: '2099-06-01' } }),
  player('undated', 'Undated Player', { identity: { next_action: 'Discuss the recorded offer' } }),
  player('restricted', 'Assigned Player', { access: { restricted: true }, identity: { next_action: 'Private objective', contract_expiry: '2026-12-31' } }),
  player('empty', 'Quiet Player', { service: { next_control_fix: null, next_service_move: null } }),
];

export default function Page() {
  const [action, setAction] = useState<AgencyActionRequest | null>(null);
  const invoke = useCallback(async <T,>(name: string, body: any = {}): Promise<T> => {
    if (name === 'player_workspace') return { player: { identity: { name: players.find(p => p.player_id === body.player_id)?.identity.name }, service: {} } } as T;
    return { bundle: null } as T;
  }, []);
  const rpc = useCallback(async <T,>(): Promise<T> => ({ people: [], can_edit: false, items: [] } as T), []);
  return <main className={styles.root} data-interface="calm" style={{ ...tenantBrandCssVariables({ primary: '#23483f', accent: '#b49568' }), display: 'block', padding: 16 }}>
    <output hidden aria-label="Prepared action">{action ? JSON.stringify(action) : 'No action prepared'}</output>
    <AgencyPlayersWorkspace stateScope="priority-fixture" canManageRecords={false}
      data={{ directory: { items: players }, recruitment: { items: [] } }} basePath="/qa-player-priorities"
      invoke={invoke} rpc={rpc} onRefresh={async () => {}} onOpenAction={setAction} />
  </main>;
}
