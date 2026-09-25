'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';

import AgencyShell from '@/components/AgencyShell';
import { useAdmin } from '@/components/AdminShell';
import {
  friendlyError,
  platformInvoke,
} from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

type TeamMember = {
  user_id: string;
  role: string;
  status: string;
  email?: string | null;
  display_name?: string | null;
  is_primary?: boolean;
};

type TeamInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at?: string | null;
};

type TeamPayload = {
  tenant_id: string;
  actor_role: string;
  members: TeamMember[];
  invites: TeamInvite[];
};

const STAFF_ROLES = [
  ['agent', 'Agent'],
  ['operations', 'Operations'],
  ['scout', 'Scout'],
  ['admin', 'Admin'],
] as const;

export default function TeamSettingsPage() {
  const auth = useAdmin();
  const tenantId = String(auth.workspace?.tenant_id || '');
  const actorRole = String(auth.profile?.tenant_role || '');
  const canManage = ['owner', 'admin'].includes(actorRole);
  const isOwner = actorRole === 'owner';

  const [team, setTeam] = useState<TeamPayload | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [staffId, setStaffId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenantId || !canManage) {
      setBusy(false);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const teamResult = await platformInvoke<{
        team?: TeamPayload;
      }>('agency-os', {
        action: 'team',
        tenant_id: tenantId,
      });

      const { data: playerRows, error: playerError } = await supabase
        .from('players')
        .select('id,first_name,last_name,preferred_name')
        .eq('tenant_id', tenantId)
        .order('last_name');

      if (playerError) throw playerError;

      const playerIds = (playerRows || []).map((player) => player.id);
      let accessRows: any[] = [];

      if (playerIds.length) {
        const { data, error: accessError } = await supabase
          .from('staff_player_access')
          .select('staff_user_id,player_id,can_edit')
          .in('player_id', playerIds);

        if (accessError) throw accessError;
        accessRows = data || [];
      }

      setTeam(teamResult?.team || null);
      setPlayers(playerRows || []);
      setAccess(accessRows);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [tenantId, canManage]);

  useEffect(() => {
    if (!auth.loading) void load();
  }, [auth.loading, load]);

  const currentUserId = String(auth.user?.id || '');

  const scouts = useMemo(
    () =>
      (team?.members || []).filter(
        (member) => member.role === 'scout',
      ),
    [team],
  );

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();

    if (!canManage || !tenantId || !normalised) return;

    setActionBusy('invite');
    setError('');
    setMessage('');
    setLastInviteLink('');

    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'staff_invite_create',
        tenant_id: tenantId,
        email: normalised,
        role: inviteRole,
      });

      const path = String(result?.invite?.invite_path || '');
      const link = path
        ? `${window.location.origin}${path}`
        : '';

      setEmail('');
      setLastInviteLink(link);
      setMessage(
        link
          ? 'Invitation created. Copy the secure link and send it to the team member.'
          : 'Invitation created.',
      );

      await load();
    } catch (inviteError) {
      setError(friendlyError(inviteError));
    } finally {
      setActionBusy('');
    }
  };

  const copyInvite = async () => {
    if (!lastInviteLink) return;

    await navigator.clipboard.writeText(lastInviteLink);
    setMessage('Invitation link copied.');
  };

  const revokeInvite = async (inviteId: string) => {
    setActionBusy(`invite:${inviteId}`);
    setError('');

    try {
      await platformInvoke('agency-os', {
        action: 'staff_invite_revoke',
        tenant_id: tenantId,
        invite_id: inviteId,
      });

      setMessage('Invitation revoked.');
      await load();
    } catch (revokeError) {
      setError(friendlyError(revokeError));
    } finally {
      setActionBusy('');
    }
  };

  const updateRole = async (
    member: TeamMember,
    nextRole: string,
  ) => {
    if (
      !canManage ||
      member.user_id === currentUserId ||
      member.role === 'owner' ||
      member.role === nextRole
    ) {
      return;
    }

    setActionBusy(`member:${member.user_id}`);
    setError('');

    try {
      await platformInvoke('agency-os', {
        action: 'staff_member_update',
        tenant_id: tenantId,
        target_user_id: member.user_id,
        role: nextRole,
      });

      setMessage('Team role updated.');
      await load();
      await auth.refresh();
    } catch (roleError) {
      setError(friendlyError(roleError));
    } finally {
      setActionBusy('');
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (
      !canManage ||
      member.user_id === currentUserId ||
      member.role === 'owner'
    ) {
      return;
    }

    const name =
      member.display_name ||
      member.email ||
      'this team member';

    if (
      !window.confirm(
        `Remove ${name} from this agency workspace?`,
      )
    ) {
      return;
    }

    setActionBusy(`member:${member.user_id}`);
    setError('');

    try {
      await platformInvoke('agency-os', {
        action: 'staff_member_remove',
        tenant_id: tenantId,
        target_user_id: member.user_id,
      });

      setMessage('Team member removed from this agency.');
      await load();
    } catch (removeError) {
      setError(friendlyError(removeError));
    } finally {
      setActionBusy('');
    }
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();

    if (
      !canManage ||
      !tenantId ||
      !staffId ||
      !playerId
    ) {
      return;
    }

    setActionBusy('assignment');
    setError('');

    try {
      const { error: assignmentError } = await supabase
        .from('staff_player_access')
        .upsert(
          {
            staff_user_id: staffId,
            player_id: playerId,
            can_edit: canEdit,
          },
          {
            onConflict: 'staff_user_id,player_id',
          },
        );

      if (assignmentError) throw assignmentError;

      setMessage(
        canEdit
          ? 'Player assigned with edit access.'
          : 'Player assigned read-only.',
      );

      await load();
    } catch (assignmentError) {
      setError(friendlyError(assignmentError));
    } finally {
      setActionBusy('');
    }
  };

  const removeAssignment = async (
    staffUserId: string,
    assignedPlayerId: string,
  ) => {
    setActionBusy(
      `assignment:${staffUserId}:${assignedPlayerId}`,
    );
    setError('');

    try {
      const { error: assignmentError } = await supabase
        .from('staff_player_access')
        .delete()
        .eq('staff_user_id', staffUserId)
        .eq('player_id', assignedPlayerId);

      if (assignmentError) throw assignmentError;

      setMessage('Player assignment removed.');
      await load();
    } catch (assignmentError) {
      setError(friendlyError(assignmentError));
    } finally {
      setActionBusy('');
    }
  };

  const roleOptions = isOwner
    ? STAFF_ROLES
    : STAFF_ROLES.filter(([value]) => value !== 'admin');

  return (
    <AgencyShell
      eyebrow="Settings · tenant access"
      title="Team & permissions"
    >
      <Link href="/settings" className="ux-back-link">
        <ArrowLeft size={15} />
        Settings
      </Link>

      {!canManage && !auth.loading ? (
        <div className="ux-evidence-empty">
          <ShieldCheck size={28} />
          <div>
            <strong>Owner or admin access required.</strong>
            <p>
              Your role is scoped to this agency. Team access is
              managed independently for every ReDream customer.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="ux-alert ux-alert-error">
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="ux-alert ux-alert-success">
          {message}
        </div>
      ) : null}

      {canManage ? (
        <div className="ux-settings-two-col">
          <section className="ux-surface">
            <div className="ux-surface-head">
              <div>
                <p className="ux-eyebrow">AGENCY TEAM</p>
                <h2>Who can operate this agency?</h2>
                <p>
                  Access comes from this agency membership only.
                  No global ReDream role grants access to another agency.
                </p>
              </div>
              <UserPlus size={20} />
            </div>

            <form
              className="ux-simple-form"
              onSubmit={createInvite}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                />
              </label>

              <label>
                Role
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value)
                  }
                >
                  {roleOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="ux-primary-action"
                type="submit"
                disabled={actionBusy === 'invite'}
              >
                Create secure invitation
              </button>
            </form>

            {lastInviteLink ? (
              <div className="ux-alert ux-alert-success">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>Secure invitation ready</strong>
                  <div
                    style={{
                      marginTop: 6,
                      overflowWrap: 'anywhere',
                      fontSize: 12,
                    }}
                  >
                    {lastInviteLink}
                  </div>
                </div>

                <button
                  type="button"
                  className="djm-os-mini-button"
                  onClick={() => void copyInvite()}
                >
                  <Copy size={14} />
                  Copy
                </button>
              </div>
            ) : null}

            <div className="ux-admin-list">
              {(team?.members || []).map((member) => {
                const self =
                  member.user_id === currentUserId;
                const protectedMember =
                  member.role === 'owner' ||
                  self ||
                  (!isOwner && member.role === 'admin');

                return (
                  <div
                    className="ux-admin-row"
                    key={member.user_id}
                  >
                    <div>
                      <strong>
                        {member.display_name ||
                          member.email ||
                          'Agency team member'}
                      </strong>
                      <span>
                        {member.email || 'No email'} ·{' '}
                        {humanRole(member.role)}
                        {self ? ' · You' : ''}
                      </span>
                    </div>

                    <div className="djm-os-button-row">
                      {member.role === 'owner' ? (
                        <small>Owner</small>
                      ) : (
                        <select
                          aria-label={`Role for ${
                            member.display_name ||
                            member.email ||
                            'team member'
                          }`}
                          value={member.role}
                          disabled={
                            protectedMember ||
                            actionBusy ===
                              `member:${member.user_id}`
                          }
                          onChange={(event) =>
                            void updateRole(
                              member,
                              event.target.value,
                            )
                          }
                        >
                          {roleOptions.map(
                            ([value, label]) => (
                              <option
                                value={value}
                                key={value}
                              >
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      )}

                      {!protectedMember ? (
                        <button
                          type="button"
                          onClick={() =>
                            void removeMember(member)
                          }
                          aria-label={`Remove ${
                            member.display_name ||
                            member.email ||
                            'team member'
                          }`}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {!team?.members?.length && !busy ? (
                <div className="ux-mini-empty">
                  <CheckCircle2 size={18} />
                  No active team members.
                </div>
              ) : null}
            </div>

            {(team?.invites || []).length ? (
              <>
                <div
                  className="ux-surface-head"
                  style={{ marginTop: 24 }}
                >
                  <div>
                    <p className="ux-eyebrow">
                      PENDING INVITATIONS
                    </p>
                    <h2>Waiting for acceptance</h2>
                  </div>
                </div>

                <div className="ux-admin-list">
                  {(team?.invites || []).map((invite) => (
                    <div
                      className="ux-admin-row"
                      key={invite.id}
                    >
                      <div>
                        <strong>{invite.email}</strong>
                        <span>
                          {humanRole(invite.role)} ·{' '}
                          {invite.status}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void revokeInvite(invite.id)
                        }
                        disabled={
                          actionBusy ===
                          `invite:${invite.id}`
                        }
                        aria-label={`Revoke invitation for ${invite.email}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="ux-surface">
            <div className="ux-surface-head">
              <div>
                <p className="ux-eyebrow">
                  SCOUT SCOPE
                </p>
                <h2>Player assignments</h2>
                <p>
                  Scout access can remain limited to specific
                  player records while the agency membership stays
                  tenant-native.
                </p>
              </div>
              <ShieldCheck size={20} />
            </div>

            <form
              className="ux-simple-form"
              onSubmit={saveAssignment}
            >
              <label>
                Scout
                <select
                  required
                  value={staffId}
                  onChange={(event) =>
                    setStaffId(event.target.value)
                  }
                >
                  <option value="">
                    Choose scout
                  </option>
                  {scouts.map((member) => (
                    <option
                      value={member.user_id}
                      key={member.user_id}
                    >
                      {member.display_name ||
                        member.email ||
                        'Scout'}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Player
                <select
                  required
                  value={playerId}
                  onChange={(event) =>
                    setPlayerId(event.target.value)
                  }
                >
                  <option value="">
                    Choose player
                  </option>
                  {players.map((player) => (
                    <option
                      value={player.id}
                      key={player.id}
                    >
                      {playerName(player)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ux-check-line">
                <input
                  type="checkbox"
                  checked={canEdit}
                  onChange={(event) =>
                    setCanEdit(event.target.checked)
                  }
                />
                Allow editing
              </label>

              <button
                className="ux-primary-action"
                type="submit"
                disabled={actionBusy === 'assignment'}
              >
                Save assignment
              </button>
            </form>

            <div className="ux-admin-list">
              {access.map((row) => {
                const staff = scouts.find(
                  (member) =>
                    member.user_id ===
                    row.staff_user_id,
                );

                const player = players.find(
                  (item) =>
                    item.id === row.player_id,
                );

                return (
                  <div
                    className="ux-admin-row"
                    key={`${row.staff_user_id}-${row.player_id}`}
                  >
                    <div>
                      <strong>
                        {staff?.display_name ||
                          staff?.email ||
                          'Scout'}
                      </strong>
                      <span>
                        {playerName(player)} ·{' '}
                        {row.can_edit
                          ? 'can edit'
                          : 'read-only'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void removeAssignment(
                          row.staff_user_id,
                          row.player_id,
                        )
                      }
                      aria-label="Remove assignment"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}

              {!access.length && !busy ? (
                <div className="ux-mini-empty">
                  <Check size={18} />
                  No scoped scout assignments.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </AgencyShell>
  );
}

function humanRole(value: string) {
  if (value === 'operations') return 'Operations';
  if (value === 'admin') return 'Admin';
  if (value === 'agent') return 'Agent';
  if (value === 'scout') return 'Scout';
  if (value === 'owner') return 'Owner';
  return value || 'Team';
}

function playerName(player: any) {
  if (!player) return 'Player';

  return (
    player.preferred_name ||
    [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ') ||
    'Player'
  );
}
