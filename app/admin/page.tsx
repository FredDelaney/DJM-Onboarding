'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import { compactDate, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import { publicFile, supabase } from '@/lib/supabase';

type View = 'signed' | 'prospects';

type TeamMember = {
  user_id: string;
  display_name: string;
  role_title?: string | null;
};

export default function PlayersPage() {
  const auth = useAdmin();
  const isAdmin = auth.profile?.role === 'admin';

  const [view, setView] = useState<View>('signed');
  const [players, setPlayers] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
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
      const [playerResult, prospectResult, teamResult] = await Promise.all([
        supabase
          .from('players')
          .select(
            'id,first_name,last_name,preferred_name,date_of_birth,nationalities,primary_position,current_club,current_league,current_country,contract_status,contract_expiry,football_status,verification_status,agency_priority,next_action,next_action_due,profile_photo_path,primary_staff_user_id,updated_at',
          )
          .order('updated_at', { ascending: false }),
        djmRpc<any[]>('djm_recruitment_targets', {
          p_search: null,
          p_stage: null,
          p_limit: 300,
        }),
        djmRpc<TeamMember[]>('djm_active_team_members'),
      ]);

      if (playerResult.error) throw playerResult.error;

      setPlayers(playerResult.data || []);
      setProspects(prospectResult || []);
      setTeam(Array.isArray(teamResult) ? teamResult : []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.user) void load();
  }, [auth.loading, auth.user, load]);

  const ownerById = useMemo(
    () => new Map(team.map((member) => [member.user_id, member.display_name])),
    [team],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return players.filter((player) => {
      const owner = ownerById.get(player.primary_staff_user_id) || '';
      return (
        !q ||
        [
          playerFullName(player),
          player.current_club,
          player.current_league,
          player.primary_position,
          player.current_country,
          owner,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [players, search, ownerById]);

  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase();

    return prospects.filter((player) => {
      const owner = ownerById.get(player.owner_user_id) || '';
      return (
        !q ||
        [
          player.full_name,
          player.current_club,
          player.current_country,
          player.primary_position,
          player.recruitment_stage,
          owner,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [prospects, search, ownerById]);

  const unassignedPlayers = players.filter(
    (player) => !player.primary_staff_user_id,
  ).length;

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
          const result: any = await djmInvoke('refresh-player-stats-free', {
            player_id: player.id,
          });

          results.push({
            id: player.id,
            ok: Boolean(result?.ok),
            review: Boolean(
              result?.thesportsdb?.conflict ||
                result?.thesportsdb?.conflict_kept_for_review ||
                result?.api_football?.conflicts_kept_for_review,
            ),
          });
        } catch {
          results.push({ id: player.id, ok: false });
        }
      }
    };

    await Promise.all([worker(), worker()]);

    const success = results.filter((row) => row.ok).length;
    const review = results.filter((row) => row.review).length;
    const failed = results.length - success;

    setMessage(
      `${success} player${success === 1 ? '' : 's'} refreshed · ${review} need review · ${failed} failed.`,
    );
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

      if (!invite?.token) {
        throw new Error('Invitation did not return a valid token.');
      }

      setInviteLink(`${window.location.origin}/join/${invite.token}`);
      setMessage(
        invite.existing
          ? 'Existing private invitation reopened.'
          : 'Private player invitation ready.',
      );
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
          // Stored safely for the normal enrichment workflow.
        }
      }

      setTransfermarktUrl('');
      setProspectNote('');
      setProspectOpen(false);
      setMessage(
        'Prospect saved. DJM will enrich what it can from the connected source.',
      );
      await load();
    } catch (prospectError) {
      setError(friendlyError(prospectError));
    }
  };

  return (
    <DjmOsShell eyebrow="Represented players and recruitment" title="Players">
      <div className="roster-overview">
        {error ? (
          <div className="ux-alert ux-alert-error">
            <AlertCircle size={17} />
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="ux-alert ux-alert-success">{message}</div>
        ) : null}

        <section className="roster-command">
          <div className="roster-command-copy">
            <span className="roster-command-kicker">
              {view === 'signed' ? 'DJM ROSTER' : 'RECRUITMENT DESK'}
            </span>
            <strong>
              {view === 'signed'
                ? `${players.length} represented player${players.length === 1 ? '' : 's'}`
                : `${prospects.length} active prospect${prospects.length === 1 ? '' : 's'}`}
            </strong>
            <small>
              {view === 'signed'
                ? unassignedPlayers
                  ? `${unassignedPlayers} still need a primary DJM owner.`
                  : 'Every represented player has a clear DJM owner.'
                : 'Ownership, contact state and next action are visible on every card.'}
            </small>
          </div>

          <div className="ux-segmented roster-segmented" role="tablist" aria-label="Players views">
            <button
              type="button"
              className={view === 'signed' ? 'is-active' : ''}
              onClick={() => setView('signed')}
            >
              Signed <span>{players.length}</span>
            </button>
            <button
              type="button"
              className={view === 'prospects' ? 'is-active' : ''}
              onClick={() => setView('prospects')}
            >
              Prospects <span>{prospects.length}</span>
            </button>
          </div>
        </section>

        <div className="ux-page-toolbar roster-toolbar">
          <label className="ux-search-control roster-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${view}, club or owner`}
            />
          </label>

          <div className="ux-toolbar-actions">
            {view === 'signed' && isAdmin ? (
              <button
                type="button"
                className="ux-secondary-action"
                onClick={() => void updateAllPlayers()}
                disabled={batchBusy || busy}
              >
                <RefreshCw size={15} className={batchBusy ? 'spin' : ''} />
                {batchBusy ? 'Updating...' : 'Update all'}
              </button>
            ) : null}

            {view === 'signed' && isAdmin ? (
              <button
                type="button"
                className="ux-primary-action"
                onClick={() => {
                  setInviteOpen(true);
                  setInviteLink('');
                }}
              >
                <UserPlus size={15} />
                Invite
              </button>
            ) : null}

            {view === 'prospects' ? (
              <button
                type="button"
                className="ux-primary-action"
                onClick={() => setProspectOpen((value) => !value)}
              >
                <Plus size={15} />
                Add prospect
              </button>
            ) : null}
          </div>
        </div>

        {prospectOpen && view === 'prospects' ? (
          <section className="ux-surface ux-inline-create roster-inline-create">
            <div className="ux-surface-head">
              <div>
                <p className="ux-eyebrow">FAST ADD</p>
                <h2>Paste one player link</h2>
              </div>
            </div>

            <form className="ux-simple-form" onSubmit={addProspect}>
              <label>
                Transfermarkt player URL
                <input
                  required
                  value={transfermarktUrl}
                  onChange={(event) => setTransfermarktUrl(event.target.value)}
                  placeholder="https://www.transfermarkt.com/.../profil/spieler/..."
                />
              </label>

              <label>
                Why are DJM interested?
                <input
                  value={prospectNote}
                  onChange={(event) => setProspectNote(event.target.value)}
                  placeholder="Optional short note"
                />
              </label>

              <button className="ux-primary-action" type="submit">
                Save and enrich
              </button>
            </form>
          </section>
        ) : null}

        {busy ? (
          <div className="ux-loading-row">
            <RefreshCw size={18} className="spin" />
            Loading players...
          </div>
        ) : null}

        {!busy && view === 'signed' ? (
          <section className="roster-card-grid" aria-label="Signed players">
            {filteredPlayers.map((player) => (
              <SignedPlayerCard
                key={player.id}
                player={player}
                ownerName={
                  ownerById.get(player.primary_staff_user_id) || null
                }
              />
            ))}

            {!filteredPlayers.length ? (
              <EmptyState text="No signed players match this search." />
            ) : null}
          </section>
        ) : null}

        {!busy && view === 'prospects' ? (
          <section className="roster-card-grid" aria-label="Prospects">
            {filteredProspects.map((player) => (
              <ProspectCard
                key={player.id}
                player={player}
                ownerName={ownerById.get(player.owner_user_id) || null}
              />
            ))}

            {!filteredProspects.length ? (
              <EmptyState text="No prospects match this search." />
            ) : null}
          </section>
        ) : null}

        {inviteOpen && isAdmin ? (
          <div
            className="ux-modal-backdrop"
            role="presentation"
            onMouseDown={() => setInviteOpen(false)}
          >
            <section
              className="ux-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Invite player"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="ux-surface-head">
                <div>
                  <p className="ux-eyebrow">PRIVATE ACCESS</p>
                  <h2>Invite player</h2>
                </div>
                <button type="button" onClick={() => setInviteOpen(false)}>
                  Close
                </button>
              </div>

              <form className="ux-simple-form" onSubmit={createInvite}>
                <label>
                  Player name
                  <input
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                  />
                </label>

                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </label>

                <button className="ux-primary-action" type="submit">
                  Create private invite
                </button>
              </form>

              {inviteLink ? (
                <div className="ux-invite-result">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Ready to send</strong>
                    <input
                      readOnly
                      value={inviteLink}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </DjmOsShell>
  );
}

function SignedPlayerCard({
  player,
  ownerName,
}: {
  player: any;
  ownerName: string | null;
}) {
  const photo = publicFile('player-public', player.profile_photo_path);
  const due = player.next_action_due
    ? new Date(`${player.next_action_due}T23:59:59`)
    : null;
  const actionOverdue = Boolean(
    due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now(),
  );

  const status = humanise(
    player.contract_status ||
      player.football_status ||
      player.verification_status ||
      'active',
  );

  const contract = player.contract_expiry
    ? compactDate(player.contract_expiry)
    : humanise(player.football_status || 'Not recorded');

  return (
    <article className="roster-card roster-signed-card">
      <Link
        href={`/admin/players/${player.id}`}
        className="roster-card-link"
        aria-label={`Open ${playerFullName(player)}`}
      >
        <div className={`roster-player-media ${photo ? 'has-photo' : 'no-photo'}`}>
          {photo ? (
            <Image
              src={photo}
              alt=""
              fill
              sizes="(max-width: 720px) 100vw, (max-width: 1150px) 50vw, 33vw"
              className="roster-player-photo"
            />
          ) : (
            <span className="roster-monogram">
              {initials(playerFullName(player))}
            </span>
          )}

          <div className="roster-media-shade" />

          <div className="roster-card-topline">
            <span className="roster-type-mark">
              <ShieldCheck size={13} />
              REPRESENTED
            </span>
            <OwnerPill ownerName={ownerName} />
          </div>

          <div className="roster-player-identity">
            <span>{player.primary_position || 'Position not added'}</span>
            <h2>{playerFullName(player)}</h2>
            <p>
              {[player.current_club, player.current_league]
                .filter(Boolean)
                .join(' · ') || 'Football profile being built'}
            </p>
          </div>
        </div>

        <div className="roster-card-body">
          <div className="roster-data-strip">
            <CardStat label="Age" value={String(age(player.date_of_birth) ?? '—')} />
            <CardStat label="Contract" value={contract} />
            <CardStat label="Status" value={status} />
          </div>

          <div
            className={`roster-action-line ${
              actionOverdue ? 'is-overdue' : ''
            } ${!player.next_action ? 'is-quiet' : ''}`}
          >
            <span className="roster-action-icon">
              {actionOverdue ? <Clock3 size={15} /> : <CalendarClock size={15} />}
            </span>

            <div>
              <small>{actionOverdue ? 'OVERDUE ACTION' : 'NEXT ACTION'}</small>
              <strong>
                {player.next_action ||
                  (ownerName
                    ? 'No immediate action recorded'
                    : 'Assign a primary DJM owner')}
              </strong>
              {player.next_action_due ? (
                <span>{compactDate(player.next_action_due)}</span>
              ) : null}
            </div>

            <ChevronRight size={18} />
          </div>
        </div>
      </Link>
    </article>
  );
}

function ProspectCard({
  player,
  ownerName,
}: {
  player: any;
  ownerName: string | null;
}) {
  const rawStage = String(player.recruitment_stage || 'identified');
  const active = !['signed', 'declined', 'lost', 'paused'].includes(rawStage);
  const contacted = Boolean(player.first_contact_at);
  const lastContact = player.last_contact_at || player.first_contact_at;
  const nextAt = player.next_action_at ? new Date(player.next_action_at) : null;
  const overdue = Boolean(
    active &&
      nextAt &&
      !Number.isNaN(nextAt.getTime()) &&
      nextAt.getTime() < Date.now(),
  );

  const needsNext = Boolean(active && contacted && !nextAt);

  const nextLabel = !active
    ? humanise(rawStage)
    : !contacted
      ? 'Contact player'
      : !nextAt
        ? 'Set next step'
        : formatDateTime(nextAt);

  const progress = stageProgress(rawStage);

  return (
    <article
      className={`roster-card roster-prospect-card ${
        overdue ? 'is-overdue' : ''
      } ${needsNext ? 'needs-next' : ''}`}
    >
      <Link
        href={`/recruitment/${player.id}`}
        className="roster-card-link"
        aria-label={`Open ${player.full_name}`}
      >
        <div className="roster-prospect-hero">
          <span className="roster-prospect-watermark">
            {initials(player.full_name)}
          </span>

          <div className="roster-card-topline">
            <span className="roster-type-mark">
              <UserRound size={13} />
              PROSPECT
            </span>
            <OwnerPill ownerName={ownerName} />
          </div>

          <div className="roster-prospect-copy">
            <div className="roster-stage-line">
              <span>{humanise(rawStage)}</span>
              <b>P{player.recruitment_priority || 3}</b>
            </div>

            <h2>{player.full_name}</h2>
            <p>
              {[player.primary_position, player.current_club, player.current_country]
                .filter(Boolean)
                .join(' · ') || 'Profile being enriched'}
            </p>

            <div
              className="roster-stage-rail"
              aria-label={`Recruitment progress ${progress} of 4`}
            >
              {[1, 2, 3, 4].map((step) => (
                <i
                  key={step}
                  className={step <= progress ? 'is-active' : ''}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="roster-card-body roster-prospect-body">
          <div className="roster-prospect-signals">
            <div className={contacted ? 'is-positive' : ''}>
              <small>CONTACT</small>
              <strong>{contacted ? 'Contacted' : 'Not contacted'}</strong>
              <span>
                {lastContact ? compactDate(lastContact) : 'No contact logged'}
              </span>
            </div>

            <div
              className={
                overdue
                  ? 'is-danger'
                  : needsNext
                    ? 'is-attention'
                    : nextAt
                      ? 'is-positive'
                      : ''
              }
            >
              <small>NEXT STEP</small>
              <strong>
                {overdue
                  ? 'Overdue'
                  : needsNext
                    ? 'Required'
                    : nextAt
                      ? 'Scheduled'
                      : 'No action'}
              </strong>
              <span>{nextLabel}</span>
            </div>
          </div>

          <div
            className={`roster-action-line ${
              overdue ? 'is-overdue' : ''
            } ${needsNext ? 'is-attention' : ''}`}
          >
            <span className="roster-action-icon">
              <CalendarClock size={15} />
            </span>

            <div>
              <small>
                {overdue
                  ? 'FOLLOW-UP OVERDUE'
                  : needsNext
                    ? 'ACTION REQUIRED'
                    : 'RECRUITMENT ACTION'}
              </small>
              <strong>{nextLabel}</strong>
            </div>

            <ChevronRight size={18} />
          </div>
        </div>
      </Link>
    </article>
  );
}

function OwnerPill({ ownerName }: { ownerName: string | null }) {
  if (!ownerName) {
    return (
      <span className="roster-owner is-unassigned">
        <b>!</b>
        <span>
          <small>OWNER</small>
          <strong>UNASSIGNED</strong>
        </span>
      </span>
    );
  }

  const first = ownerName.split(/\s+/)[0] || ownerName;

  return (
    <span className="roster-owner">
      <b>{initials(ownerName)}</b>
      <span>
        <small>OWNER</small>
        <strong>{first.toUpperCase()}</strong>
      </span>
    </span>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="roster-stat">
      <small>{label}</small>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function playerFullName(player: any) {
  const formal = [player?.first_name, player?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (formal) return formal;
  return player?.preferred_name || 'Unnamed player';
}

function age(value?: string | null) {
  if (!value) return null;

  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let result = today.getFullYear() - birth.getFullYear();

  if (
    today <
    new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  ) {
    result -= 1;
  }

  return result;
}

function initials(value?: string | null) {
  return (value || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function humanise(value?: string | null) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function stageProgress(stage: string) {
  if (['identified', 'researching', 'ready_to_contact'].includes(stage)) {
    return 1;
  }

  if (stage === 'contacted') return 2;

  if (['replied', 'call_booked'].includes(stage)) {
    return 3;
  }

  if (
    [
      'interested',
      'terms_discussed',
      'agreement_sent',
      'negotiating',
      'signed',
    ].includes(stage)
  ) {
    return 4;
  }

  return 1;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="ux-evidence-empty roster-empty">
      <CheckCircle2 size={25} />
      <div>
        <strong>Nothing to show.</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
