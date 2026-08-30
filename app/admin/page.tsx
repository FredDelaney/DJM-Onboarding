'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import { compactDate, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import { publicFile, supabase } from '@/lib/supabase';

type View = 'signed' | 'prospects';

export default function PlayersPage() {
  const auth = useAdmin();
  const isAdmin = auth.profile?.role === 'admin';
  const [view, setView] = useState<View>('signed');
  const [players, setPlayers] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(true);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [prospectOpen, setProspectOpen] = useState(false);
  const [transfermarktUrl, setTransfermarktUrl] = useState('');
  const [prospectNote, setProspectNote] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [playerResult, prospectResult] = await Promise.all([
        supabase
          .from('players')
          .select('id,first_name,last_name,preferred_name,date_of_birth,nationalities,primary_position,current_club,current_league,current_country,contract_status,contract_expiry,football_status,verification_status,agency_priority,next_action,next_action_due,profile_photo_path,updated_at')
          .order('updated_at', { ascending: false }),
        djmRpc<any[]>('djm_recruitment_targets', { p_search: null, p_stage: null, p_limit: 300 }),
      ]);
      if (playerResult.error) throw playerResult.error;
      setPlayers(playerResult.data || []);
      setProspects(prospectResult || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.user) void load();
  }, [auth.loading, auth.user, load]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) =>
      !q || [playerName(player), player.current_club, player.current_league, player.primary_position, player.current_country]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [players, search]);

  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((player) =>
      !q || [player.full_name, player.current_club, player.current_country, player.primary_position, player.recruitment_stage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [prospects, search]);

  const updateAllPlayers = async () => {
    if (!isAdmin || batchBusy) return;
    setBatchBusy(true);
    setError('');
    setMessage('');
    const results: Array<{ id: string; ok: boolean; review?: boolean }> = [];
    const queue = [...players];

    const worker = async () => {
      while (queue.length) {
        const player = queue.shift();
        if (!player) return;
        try {
          const result: any = await djmInvoke('refresh-player-data-universal', { player_id: player.id });
          try {
            await djmInvoke('refresh-player-peer-data', { player_id: player.id });
          } catch {
            // Peer coverage is optional. The player refresh remains valid.
          }
          results.push({ id: player.id, ok: true, review: Boolean(result?.needs_review || result?.conflict_kept_for_review) });
        } catch {
          results.push({ id: player.id, ok: false });
        }
      }
    };

    await Promise.all([worker(), worker()]);
    const success = results.filter((row) => row.ok).length;
    const review = results.filter((row) => row.review).length;
    const failed = results.length - success;
    setMessage(`${success} player${success === 1 ? '' : 's'} checked · ${review} need review · ${failed} failed.`);
    setBatchBusy(false);
    await load();
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !inviteEmail.trim()) return;
    setError('');
    try {
      const invite: any = await djmRpc('create_player_invitation', {
        invite_email: inviteEmail.trim().toLowerCase(),
        player_name: inviteName.trim() || null,
      });
      if (!invite?.token) throw new Error('Invitation did not return a valid token.');
      setInviteLink(`${window.location.origin}/join/${invite.token}`);
      setMessage(invite.existing ? 'Existing private invitation reopened.' : 'Private player invitation ready.');
    } catch (inviteError) {
      setError(friendlyError(inviteError));
    }
  };

  const addProspect = async (event: FormEvent) => {
    event.preventDefault();
    if (!transfermarktUrl.trim()) return;
    setError('');
    setMessage('');
    try {
      const result: any = await djmRpc('djm_recruitment_quick_add', {
        p_transfermarkt_url: transfermarktUrl.trim(),
        p_priority: 3,
        p_notes: prospectNote.trim() || null,
      });
      if (result?.prospect_id) {
        try {
          await djmInvoke('djm-transfermarkt-enrich', {
            prospect_id: result.prospect_id,
            url: transfermarktUrl.trim(),
          });
        } catch {
          // The URL remains stored and can be enriched by the normal provider workflow.
        }
      }
      setTransfermarktUrl('');
      setProspectNote('');
      setProspectOpen(false);
      setMessage('Prospect saved. DJM will enrich what it can from the connected source.');
      await load();
    } catch (prospectError) {
      setError(friendlyError(prospectError));
    }
  };

  return (
    <DjmOsShell eyebrow="Represented players and recruitment" title="Players">
      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}
      {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

      <div className="ux-page-toolbar">
        <div className="ux-segmented" role="tablist" aria-label="Players views">
          <button type="button" className={view === 'signed' ? 'is-active' : ''} onClick={() => setView('signed')}>Signed <span>{players.length}</span></button>
          <button type="button" className={view === 'prospects' ? 'is-active' : ''} onClick={() => setView('prospects')}>Prospects <span>{prospects.length}</span></button>
        </div>
        <div className="ux-toolbar-actions">
          <label className="ux-search-control"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${view}`} /></label>
          {view === 'signed' && isAdmin ? (
            <button type="button" className="ux-secondary-action" onClick={() => void updateAllPlayers()} disabled={batchBusy || busy}>
              <RefreshCw size={15} className={batchBusy ? 'spin' : ''} />{batchBusy ? 'Updating...' : 'Update all'}
            </button>
          ) : null}
          {view === 'signed' && isAdmin ? (
            <button type="button" className="ux-primary-action" onClick={() => { setInviteOpen(true); setInviteLink(''); }}><UserPlus size={15} />Invite</button>
          ) : null}
          {view === 'prospects' ? (
            <button type="button" className="ux-primary-action" onClick={() => setProspectOpen((value) => !value)}><Plus size={15} />Add prospect</button>
          ) : null}
        </div>
      </div>

      {prospectOpen && view === 'prospects' ? (
        <section className="ux-surface ux-inline-create">
          <div className="ux-surface-head"><div><p className="ux-eyebrow">FAST ADD</p><h2>Paste one player link</h2></div></div>
          <form className="ux-simple-form" onSubmit={addProspect}>
            <label>Transfermarkt player URL<input required value={transfermarktUrl} onChange={(event) => setTransfermarktUrl(event.target.value)} placeholder="https://www.transfermarkt.com/.../profil/spieler/..." /></label>
            <label>Why are DJM interested? <input value={prospectNote} onChange={(event) => setProspectNote(event.target.value)} placeholder="Optional short note" /></label>
            <button className="ux-primary-action" type="submit">Save and enrich</button>
          </form>
        </section>
      ) : null}

      {busy ? <div className="ux-loading-row"><RefreshCw size={18} className="spin" />Loading players...</div> : null}

      {!busy && view === 'signed' ? (
        <section className="ux-player-list">
          {filteredPlayers.map((player) => (
            <Link href={`/admin/players/${player.id}`} className="ux-player-row" key={player.id}>
              <PlayerPhoto player={player} />
              <div className="ux-player-main">
                <strong>{playerName(player)}</strong>
                <p>{[player.primary_position, player.current_club, player.current_league].filter(Boolean).join(' · ') || 'Football profile being built'}</p>
                <small>{player.next_action ? `Next: ${player.next_action}` : player.verification_status ? `Status: ${String(player.verification_status).replaceAll('_', ' ')}` : 'No immediate action recorded'}</small>
              </div>
              <div className="ux-player-meta">
                <strong>{age(player.date_of_birth) ?? '-'}</strong><span>age</span>
              </div>
              <div className="ux-player-meta ux-player-contract">
                <strong>{player.contract_expiry ? compactDate(player.contract_expiry) : String(player.football_status || 'Unknown').replaceAll('_', ' ')}</strong><span>contract</span>
              </div>
              <ArrowRight size={17} />
            </Link>
          ))}
          {!filteredPlayers.length ? <EmptyState text="No signed players match this search." /> : null}
        </section>
      ) : null}

      {!busy && view === 'prospects' ? (
        <section className="ux-player-list">
          {filteredProspects.map((player) => (
            <Link href={`/recruitment/${player.id}`} className="ux-player-row" key={player.id}>
              <div className="ux-player-avatar ux-player-avatar-letter">{initials(player.full_name)}</div>
              <div className="ux-player-main">
                <strong>{player.full_name}</strong>
                <p>{[player.primary_position, player.current_club, player.current_country].filter(Boolean).join(' · ') || 'Profile being enriched'}</p>
                <small>{String(player.recruitment_stage || 'identified').replaceAll('_', ' ')}{player.next_action_at ? ` · next ${compactDate(player.next_action_at)}` : ''}</small>
              </div>
              <div className="ux-player-meta"><strong>{player.recruitment_priority || 3}</strong><span>priority</span></div>
              <ArrowRight size={17} />
            </Link>
          ))}
          {!filteredProspects.length ? <EmptyState text="No prospects match this search." /> : null}
        </section>
      ) : null}

      {inviteOpen && isAdmin ? (
        <div className="ux-modal-backdrop" role="presentation" onMouseDown={() => setInviteOpen(false)}>
          <section className="ux-modal" role="dialog" aria-modal="true" aria-label="Invite player" onMouseDown={(event) => event.stopPropagation()}>
            <div className="ux-surface-head"><div><p className="ux-eyebrow">PRIVATE ACCESS</p><h2>Invite player</h2></div><button type="button" onClick={() => setInviteOpen(false)}>Close</button></div>
            <form className="ux-simple-form" onSubmit={createInvite}>
              <label>Player name<input value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
              <label>Email<input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
              <button className="ux-primary-action" type="submit">Create private invite</button>
            </form>
            {inviteLink ? <div className="ux-invite-result"><CheckCircle2 size={18} /><div><strong>Ready to send</strong><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></div></div> : null}
          </section>
        </div>
      ) : null}
    </DjmOsShell>
  );
}

function PlayerPhoto({ player }: { player: any }) {
  const src = publicFile('player-public', player.profile_photo_path);
  if (!src) return <div className="ux-player-avatar ux-player-avatar-letter">{initials(playerName(player))}</div>;
  return <div className="ux-player-avatar"><Image src={src} alt="" width={52} height={52} /></div>;
}

function playerName(player: any) {
  return player?.preferred_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'Unnamed player';
}

function age(value?: string | null) {
  if (!value) return null;
  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let result = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) result -= 1;
  return result;
}

function initials(value?: string | null) {
  return (value || 'P').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function EmptyState({ text }: { text: string }) {
  return <div className="ux-evidence-empty"><CheckCircle2 size={25} /><div><strong>Nothing to show.</strong><p>{text}</p></div></div>;
}
