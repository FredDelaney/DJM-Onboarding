import { useCallback, useState } from 'react';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { tenantBrandCssVariables } from '@/lib/tenant-brand-style';
import styles from '@/components/AgencyOperatingWorkspace.module.css';

const control = { fix_type: 'set_player_next_action', instruction: 'Set one concrete player next action and due date.' };
const maintain = { move_type: 'maintain_player_plan', instruction: 'Keep the player plan current.' };
const player = (id: string, name: string, extra: any = {}) => ({
  player_id: id, identity: { name, agency_status: 'prospect', primary_position: 'Centre back', current_club: 'Example FC', ...extra.identity },
  service: { next_control_fix: control, next_service_move: maintain, ...extra.service },
  access: extra.access,
});
const players = [
  player('setup', 'Plan Player', { identity: { agency_status: 'signed', primary_agent: {user_id:'agent-1', name:'Jesse Agent'} } }),
  player('contract', 'Contract Player', { identity: { agency_status: 'mandated', primary_agent: {user_id:'agent-1', name:'Jesse Agent'} }, service: { next_service_move: { move_type: 'contract_strategy', instruction: 'Agree the extension strategy.' } } }),
  player('overdue', 'Overdue Player', { identity: { next_action: 'Call the club about the trial', next_action_due: '2020-10-20' } }),
  player('future', 'Future Player', { identity: { next_action: 'Confirm the summer schedule', next_action_due: '2099-06-01' } }),
  player('undated', 'Undated Player', { identity: { next_action: 'Discuss the recorded offer' } }),
  player('restricted', 'Assigned Player', { access: { restricted: true }, identity: { next_action: 'Private objective', contract_expiry: '2026-12-31' } }),
  player('empty', 'Quiet Player', { service: { next_control_fix: null, next_service_move: null } }),
];

export default function Page() {
  const [action, setAction] = useState<AgencyActionRequest | null>(null);
  const [revision, setRevision] = useState(0);
  const invoke = useCallback(async <T,>(name: string, body: any = {}): Promise<T> => {
    if (name === 'player_workspace') return { player: { identity: { ...players.find(p => p.player_id === body.player_id)?.identity }, service: {} } } as T;
    return { bundle: null } as T;
  }, []);
  const rpc = useCallback(async <T,>(name: string, args: any = {}): Promise<T> => {
    if (name === 'redream_player_lead_agent_v1') {
      const record = players.find(p => p.player_id === args.p_player_id);
      if (!record) throw new Error('Player not found');
      const members = [{user_id:'agent-1',display_name:'Jesse Agent'},{user_id:'agent-2',display_name:'Moses Agent'}];
      if (args.p_save) {
        const previous = record.identity.primary_agent?.user_id || null;
        if (previous !== (args.p_expected_agent_id || null)) throw new Error('Player lead changed');
        const member = members.find(item=>item.user_id===args.p_new_agent_id);
        if (args.p_new_agent_id && !member) throw new Error('Invalid agent');
        (record.identity as any).primary_agent = member?{user_id:member.user_id,name:member.display_name}:null;
      }
      return {player_id:record.player_id,primary_agent:(record.identity as any).primary_agent||null,members,can_edit:true,saved:Boolean(args.p_save)} as T;
    }
    if (name === 'redream_entity_patch') {
      const record = players.find(p => p.player_id === args.p_entity_id);
      if (!record || args.p_entity_type !== 'player') throw new Error('Player not found');
      Object.assign(record.identity, args.p_patch || {});
      return { ok: true, entity_type: 'player', id: record.player_id } as T;
    }
    return { people: [], can_edit: false, items: [] } as T;
  }, []);
  return <main className={styles.root} data-interface="calm" style={{ ...tenantBrandCssVariables({ primary: '#23483f', accent: '#b49568' }), display: 'block', padding: 16 }}>
    <output hidden aria-label="Prepared action">{action ? JSON.stringify(action) : 'No action prepared'}</output>
    <AgencyPlayersWorkspace stateScope="priority-fixture" canManageRecords={true}
      data={{ directory: { items: players.map(p=>({...p,identity:{...p.identity}})), generated_at:revision }, recruitment: { items: [] } }} basePath="/qa-player-priorities"
      invoke={invoke} rpc={rpc} onRefresh={async () => {setRevision(v=>v+1);}} onOpenAction={setAction} />
  </main>;
}
