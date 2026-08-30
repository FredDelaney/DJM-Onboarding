'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle2, ShieldCheck, Trash2, UserPlus } from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import { friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

export default function TeamSettingsPage() {
  const auth = useAdmin();
  const isAdmin = auth.profile?.role === 'admin';
  const [allowlist, setAllowlist] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('scout');
  const [staffId, setStaffId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [allowlistResult, profileResult, accessResult, playerResult] = await Promise.all([
        supabase.from('admin_allowlist').select('email,role,created_at').order('created_at'),
        supabase.from('profiles').select('id,email,display_name,role,updated_at').in('role', ['admin', 'scout']).order('display_name'),
        supabase.from('staff_player_access').select('staff_user_id,player_id,can_edit'),
        supabase.from('players').select('id,first_name,last_name,preferred_name').order('last_name'),
      ]);
      const firstError = [allowlistResult, profileResult, accessResult, playerResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setAllowlist(allowlistResult.data || []);
      setProfiles(profileResult.data || []);
      setAccess(accessResult.data || []);
      setPlayers(playerResult.data || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!auth.loading) void load();
  }, [auth.loading, load]);

  const currentEmail = String(auth.profile?.email || auth.user?.email || '').toLowerCase();
  const scouts = useMemo(() => profiles.filter((profile) => profile.role === 'scout'), [profiles]);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();
    if (!isAdmin || !normalised) return;
    setError('');
    setMessage('');
    try {
      if (normalised === currentEmail && role !== 'admin') throw new Error('You cannot downgrade your own administrator access.');
      const { error: allowError } = await supabase.from('admin_allowlist').upsert({ email: normalised, role }, { onConflict: 'email' });
      if (allowError) throw allowError;
      const { data: existing, error: lookupError } = await supabase.from('profiles').select('id,email,role').eq('email', normalised).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { error: roleError } = await supabase.from('profiles').update({ role }).eq('id', existing.id);
        if (roleError) throw roleError;
      }
      setEmail('');
      setMessage(existing ? 'Team role updated.' : 'Team access is ready when this person creates an account.');
      await load();
    } catch (addError) {
      setError(friendlyError(addError));
    }
  };

  const removeMember = async (memberEmail: string) => {
    if (!isAdmin || memberEmail.toLowerCase() === currentEmail) return;
    if (!window.confirm(`Remove staff access for ${memberEmail}?`)) return;
    setError('');
    try {
      const profile = profiles.find((item) => String(item.email || '').toLowerCase() === memberEmail.toLowerCase());
      if (profile) {
        const { error: assignmentError } = await supabase.from('staff_player_access').delete().eq('staff_user_id', profile.id);
        if (assignmentError) throw assignmentError;
        const { error: profileError } = await supabase.from('profiles').update({ role: 'player' }).eq('id', profile.id);
        if (profileError) throw profileError;
      }
      const { error: removeError } = await supabase.from('admin_allowlist').delete().eq('email', memberEmail);
      if (removeError) throw removeError;
      setMessage('Team access and player assignments removed.');
      await load();
    } catch (removeError) {
      setError(friendlyError(removeError));
    }
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !staffId || !playerId) return;
    setError('');
    try {
      const { error: assignmentError } = await supabase.from('staff_player_access').upsert(
        { staff_user_id: staffId, player_id: playerId, can_edit: canEdit },
        { onConflict: 'staff_user_id,player_id' },
      );
      if (assignmentError) throw assignmentError;
      setMessage(canEdit ? 'Player assigned with edit access.' : 'Player assigned read-only.');
      await load();
    } catch (assignmentError) {
      setError(friendlyError(assignmentError));
    }
  };

  const removeAssignment = async (staffUserId: string, assignedPlayerId: string) => {
    if (!isAdmin) return;
    const { error: assignmentError } = await supabase.from('staff_player_access').delete().eq('staff_user_id', staffUserId).eq('player_id', assignedPlayerId);
    if (assignmentError) {
      setError(assignmentError.message);
      return;
    }
    setMessage('Player assignment removed.');
    await load();
  };

  return (
    <DjmOsShell eyebrow="Settings · least privilege" title="Team & permissions">
      <Link href="/settings" className="ux-back-link"><ArrowLeft size={15} />Settings</Link>
      {!isAdmin && !auth.loading ? (
        <div className="ux-evidence-empty"><ShieldCheck size={28} /><div><strong>Administrator access required.</strong><p>Scouts can use their assigned portfolio but cannot change team permissions.</p></div></div>
      ) : null}
      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}
      {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

      {isAdmin ? (
        <div className="ux-settings-two-col">
          <section className="ux-surface">
            <div className="ux-surface-head"><div><p className="ux-eyebrow">TEAM</p><h2>Who can operate DJM?</h2><p>Admin has full access. Scout access remains scoped by RLS and player assignments.</p></div><UserPlus size={20} /></div>
            <form className="ux-simple-form" onSubmit={addMember}>
              <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="scout">Scout</option><option value="admin">Admin</option></select></label>
              <button className="ux-primary-action" type="submit">Add / update access</button>
            </form>
            <div className="ux-admin-list">
              {allowlist.map((member) => (
                <div className="ux-admin-row" key={member.email}>
                  <div><strong>{member.email}</strong><span>{member.role}</span></div>
                  {String(member.email).toLowerCase() !== currentEmail ? <button type="button" onClick={() => void removeMember(member.email)} aria-label={`Remove ${member.email}`}><Trash2 size={15} /></button> : <small>You</small>}
                </div>
              ))}
            </div>
          </section>

          <section className="ux-surface">
            <div className="ux-surface-head"><div><p className="ux-eyebrow">SCOUT SCOPE</p><h2>Player assignments</h2><p>Give scouts only the player records they need, with read-only or edit access.</p></div><ShieldCheck size={20} /></div>
            <form className="ux-simple-form" onSubmit={saveAssignment}>
              <label>Scout<select required value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Choose scout</option>{scouts.map((profile) => <option value={profile.id} key={profile.id}>{profile.display_name || profile.email}</option>)}</select></label>
              <label>Player<select required value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{players.map((player) => <option value={player.id} key={player.id}>{playerName(player)}</option>)}</select></label>
              <label className="ux-check-line"><input type="checkbox" checked={canEdit} onChange={(event) => setCanEdit(event.target.checked)} />Allow editing</label>
              <button className="ux-primary-action" type="submit">Save assignment</button>
            </form>
            <div className="ux-admin-list">
              {access.map((row) => {
                const staff = profiles.find((profile) => profile.id === row.staff_user_id);
                const player = players.find((item) => item.id === row.player_id);
                return (
                  <div className="ux-admin-row" key={`${row.staff_user_id}-${row.player_id}`}>
                    <div><strong>{staff?.display_name || staff?.email || 'Scout'}</strong><span>{playerName(player)} · {row.can_edit ? 'can edit' : 'read-only'}</span></div>
                    <button type="button" onClick={() => void removeAssignment(row.staff_user_id, row.player_id)} aria-label="Remove assignment"><Trash2 size={15} /></button>
                  </div>
                );
              })}
              {!access.length && !busy ? <div className="ux-mini-empty"><CheckCircle2 size={18} />No scoped scout assignments.</div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </DjmOsShell>
  );
}

function playerName(player: any) {
  if (!player) return 'Player';
  return player.preferred_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player';
}
