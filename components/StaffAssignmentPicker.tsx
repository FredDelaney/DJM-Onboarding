'use client';

import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';

import { djmRpc, friendlyError } from '@/lib/djm-os';

type AssignmentKind = 'prospect' | 'player' | 'request' | 'task';

type TeamMember = {
  user_id: string;
  display_name: string;
  role_title?: string | null;
};

export default function StaffAssignmentPicker({
  kind,
  entityId,
  assignedUserId,
  onAssigned,
  compact = false,
}: {
  kind: AssignmentKind;
  entityId: string;
  assignedUserId?: string | null;
  onAssigned?: (userId: string | null) => void;
  compact?: boolean;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [value, setValue] = useState(assignedUserId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(assignedUserId || '');
  }, [assignedUserId]);

  useEffect(() => {
    let active = true;

    void djmRpc<TeamMember[]>('djm_active_team_members')
      .then((rows) => {
        if (active) setTeam(Array.isArray(rows) ? rows : []);
      })
      .catch((loadError) => {
        if (active) setError(friendlyError(loadError));
      });

    return () => {
      active = false;
    };
  }, []);

  const assign = async (next: string) => {
    if (busy || next === value) return;

    const previous = value;
    setValue(next);
    setBusy(true);
    setError('');

    try {
      if (kind === 'prospect') {
        await djmRpc('djm_recruitment_assign_owner', {
          p_prospect_id: entityId,
          p_owner_user_id: next || null,
        });
      } else if (kind === 'player') {
        await djmRpc('djm_assign_player', {
          p_player_id: entityId,
          p_assigned_to_user_id: next || null,
        });
      } else if (kind === 'request') {
        await djmRpc('djm_assign_player_request', {
          p_request_id: entityId,
          p_assigned_to_user_id: next || null,
        });
      } else {
        await djmRpc('djm_task_assign_owner', {
          p_task_id: entityId,
          p_owner_user_id: next || null,
        });
      }

      onAssigned?.(next || null);
    } catch (assignError) {
      setValue(previous);
      setError(friendlyError(assignError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      style={{
        display: compact ? 'inline-flex' : 'grid',
        alignItems: 'center',
        gap: compact ? 7 : 6,
        minWidth: compact ? 0 : 180,
        color: '#607285',
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}
      >
        <UserRound size={13} />
        Assigned to
      </span>

      <select
        value={value}
        disabled={busy}
        onChange={(event) => void assign(event.target.value)}
        aria-label="Assigned to"
        style={{
          minHeight: compact ? 34 : 42,
          minWidth: compact ? 145 : 180,
          maxWidth: '100%',
          border: '1px solid #dbe4e9',
          borderRadius: 10,
          background: '#fff',
          color: '#18364c',
          padding: compact ? '6px 9px' : '9px 10px',
          font: 'inherit',
          fontSize: compact ? 10 : 12,
          fontWeight: 800,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <option value="">Unassigned</option>
        {team.map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.display_name}
          </option>
        ))}
      </select>

      {error ? (
        <span style={{ color: '#99433e', fontSize: 9, fontWeight: 700 }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
