'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
type OwnerFilter = 'all' | 'unassigned' | string;
type AssignmentKind = 'player' | 'prospect';

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
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
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

  useEffect(() => {
    setOwnerFilter('all');
  }, [view]);

  const ownerById = useMemo(
    () => new Map(team.map((member) => [member.user_id, member.display_name])),
    [team],
  );

  const signedAssigned = useMemo(
    () => players.filter((player) => Boolean(player.primary_staff_user_id)).length,
    [players],
  );

  const signedActionDue = useMemo(
    () =>
      players.filter((player) => {
        const due = parseDueDate(player.next_action_due);
        return Boolean(due && due.getTime() <= Date.now());
      }).length,
    [players],
  );

  const prospectOwned = useMemo(
    () => prospects.filter((player) => Boolean(player.owner_user_id)).length,
    [prospects],
  );

  const prospectContacted = useMemo(
    () => prospects.filter((player) => Boolean(player.first_contact_at)).length,
    [prospects],
  );

  const prospectNeedsStep = useMemo(
    () =>
      prospects.filter((player) => {
        const stage = String(player.recruitment_stage || 'identified');
        const active = !['signed', 'declined', 'lost', 'paused'].includes(stage);
        if (!active) return false;
        if (!player.first_contact_at) return true;
        if (!player.next_action_at) return true;
        const next = new Date(player.next_action_at);
        return !Number.isNaN(next.getTime()) && next.getTime() < Date.now();
      }).length,
    [prospects],
  );

  const currentRows = view === 'signed' ? players : prospects;

  const ownerCount = useCallback(
    (ownerId: string | null) =>
      currentRows.filter((row: any) => {
        const rowOwner =
          view === 'signed' ? row.primary_staff_user_id : row.owner_user_id;
        return ownerId ? rowOwner === ownerId : !rowOwner;
      }).length,
    [currentRows, view],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return players.filter((player) => {
      const owner = ownerById.get(player.primary_staff_user_id) || '';
      const matchesSearch =
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
          .includes(q);

      const matchesOwner =
        ownerFilter === 'all' ||
        (ownerFilter === 'unassigned'
          ? !player.primary_staff_user_id
          : player.primary_staff_user_id === ownerFilter);

      return matchesSearch && matchesOwner;
    });
  }, [players, search, ownerById, ownerFilter]);

  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase();

    return prospects.filter((player) => {
      const owner = ownerById.get(player.owner_user_id) || '';
      const matchesSearch =
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
          .includes(q);

      const matchesOwner =
        ownerFilter === 'all' ||
        (ownerFilter === 'unassigned'
          ? !player.owner_user_id
          : player.owner_user_id === ownerFilter);

      return matchesSearch && matchesOwner;
    });
  }, [prospects, search, ownerById, ownerFilter]);

  const updatePlayerOwner = useCallback((playerId: string, ownerId: string | null) => {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? { ...player, primary_staff_user_id: ownerId }
          : player,
      ),
    );
  }, []);

  const updateProspectOwner = useCallback((prospectId: string, ownerId: string | null) => {
    setProspects((current) =>
      current.map((player) =>
        player.id === prospectId ? { ...player, owner_user_id: ownerId } : player,
      ),
    );
  }, []);

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
      <div className="roster-v3">
        {error ? (
          <div className="ux-alert ux-alert-error">
            <AlertCircle size={17} />
            {error}
          </div>
        ) : null}

        {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

        <section className="roster-masthead">
          <div className="roster-masthead-ghost" aria-hidden="true">
            {view === 'signed' ? 'ROSTER' : 'RECRUIT'}
          </div>

          <div className="roster-masthead-top">
            <div className="roster-masthead-copy">
              <span className="roster-kicker">
                {view === 'signed' ? 'DJM FIRST TEAM' : 'DJM RECRUITMENT'}
              </span>
              <h2>
                {view === 'signed'
                  ? `${players.length} represented player${players.length === 1 ? '' : 's'}`
                  : `${prospects.length} active prospect${prospects.length === 1 ? '' : 's'}`}
              </h2>
              <p>
                {view === 'signed'
                  ? signedAssigned === players.length
                    ? 'Every player has clear agency ownership.'
                    : `${players.length - signedAssigned} player${players.length - signedAssigned === 1 ? '' : 's'} still need a primary DJM owner.`
                  : 'Ownership, contact state and next action in one view.'}
              </p>
            </div>

            <div
              className="ux-segmented roster-v3-segmented"
              role="tablist"
              aria-label="Players views"
            >
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
          </div>

          <div className="roster-scoreboard">
            {view === 'signed' ? (
              <>
                <ScoreMetric
                  label="OWNERSHIP"
                  value={`${signedAssigned}/${players.length || 0}`}
                  detail={signedAssigned === players.length ? 'complete' : 'assigned'}
                />
                <ScoreMetric
                  label="ACTION DUE"
                  value={String(signedActionDue)}
                  detail="now or overdue"
                  attention={signedActionDue > 0}
                />
                <ScoreMetric
                  label="UNASSIGNED"
                  value={String(players.length - signedAssigned)}
                  detail="need an owner"
                  attention={players.length - signedAssigned > 0}
                />
              </>
            ) : (
              <>
                <ScoreMetric
                  label="OWNERSHIP"
                  value={`${prospectOwned}/${prospects.length || 0}`}
                  detail="assigned"
                />
                <ScoreMetric
                  label="CONTACTED"
                  value={`${prospectContacted}/${prospects.length || 0}`}
                  detail="outreach logged"
                />
                <ScoreMetric
                  label="NEEDS STEP"
                  value={String(prospectNeedsStep)}
                  detail="requires action"
                  attention={prospectNeedsStep > 0}
                />
              </>
            )}
          </div>
        </section>

        <section className="roster-owner-rail" aria-label="Filter by owner">
          <button
            type="button"
            className={ownerFilter === 'all' ? 'is-active' : ''}
            aria-pressed={ownerFilter === 'all'}
            onClick={() => setOwnerFilter('all')}
          >
            <span className="owner-filter-avatar is-all">DJM</span>
            <span className="owner-filter-copy">
              <small>VIEW</small>
              <strong>ALL</strong>
            </span>
            <b>{currentRows.length}</b>
          </button>

          {team.map((member) => {
            const count = ownerCount(member.user_id);
            const first = firstName(member.display_name);

            return (
              <button
                type="button"
                key={member.user_id}
                className={ownerFilter === member.user_id ? 'is-active' : ''}
                aria-pressed={ownerFilter === member.user_id}
                onClick={() => setOwnerFilter(member.user_id)}
              >
                <span className="owner-filter-avatar">
                  {initials(member.display_name)}
                </span>
                <span className="owner-filter-copy">
                  <small>OWNER</small>
                  <strong>{first.toUpperCase()}</strong>
                </span>
                <b>{count}</b>
              </button>
            );
          })}

          <button
            type="button"
            className={`is-unassigned ${ownerFilter === 'unassigned' ? 'is-active' : ''}`}
            aria-pressed={ownerFilter === 'unassigned'}
            onClick={() => setOwnerFilter('unassigned')}
          >
            <span className="owner-filter-avatar">!</span>
            <span className="owner-filter-copy">
              <small>OWNER</small>
              <strong>NONE</strong>
            </span>
            <b>{ownerCount(null)}</b>
          </button>
        </section>

        <div className="ux-page-toolbar roster-v3-toolbar">
          <label className="ux-search-control roster-v3-search">
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
          <section className="ux-surface ux-inline-create roster-v3-create">
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
          <section className="roster-v3-grid" aria-label="Signed players">
            {filteredPlayers.map((player, index) => (
              <SignedPlayerCard
                key={player.id}
                player={player}
                index={index}
                ownerName={ownerById.get(player.primary_staff_user_id) || null}
                ownerUserId={player.primary_staff_user_id || null}
                team={team}
                onOwnerChanged={(ownerId) => updatePlayerOwner(player.id, ownerId)}
                onError={setError}
              />
            ))}

            {!filteredPlayers.length ? (
              <EmptyState text="No signed players match this search or owner filter." />
            ) : null}
          </section>
        ) : null}

        {!busy && view === 'prospects' ? (
          <section className="roster-v3-grid" aria-label="Prospects">
            {filteredProspects.map((player, index) => (
              <ProspectCard
                key={player.id}
                player={player}
                index={index}
                ownerName={ownerById.get(player.owner_user_id) || null}
                ownerUserId={player.owner_user_id || null}
                team={team}
                onOwnerChanged={(ownerId) => updateProspectOwner(player.id, ownerId)}
                onError={setError}
              />
            ))}

            {!filteredProspects.length ? (
              <EmptyState text="No prospects match this search or owner filter." />
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
  index,
  ownerName,
  ownerUserId,
  team,
  onOwnerChanged,
  onError,
}: {
  player: any;
  index: number;
  ownerName: string | null;
  ownerUserId: string | null;
  team: TeamMember[];
  onOwnerChanged: (ownerId: string | null) => void;
  onError: (message: string) => void;
}) {
  const photo = publicFile('player-public', player.profile_photo_path);
  const due = parseDueDate(player.next_action_due);
  const actionOverdue = Boolean(due && due.getTime() < Date.now());

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
    <article
      className={`roster-v3-card signed-card ${!ownerUserId ? 'is-unassigned' : ''}`}
      onPointerMove={cardPointerGlow}
      onPointerLeave={resetCardPointerGlow}
    >
      <Link
        href={`/admin/players/${player.id}`}
        className="roster-v3-card-link"
        aria-label={`Open ${playerFullName(player)}`}
      >
        <div className={`signed-media ${photo ? 'has-photo' : 'no-photo'}`}>
          {photo ? (
            <Image
              src={photo}
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 33vw"
              className="signed-photo"
            />
          ) : (
            <span className="signed-monogram">{initials(playerFullName(player))}</span>
          )}

          <div className="signed-photo-tone" />
          <div className="signed-card-index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="signed-type">
            <ShieldCheck size={12} />
            REPRESENTED
          </div>

          <div className="signed-identity">
            <span>{player.primary_position || 'POSITION NOT ADDED'}</span>
            <h3>{playerFullName(player)}</h3>
            <p>
              {[player.current_club, player.current_league]
                .filter(Boolean)
                .join(' · ') || 'Football profile being built'}
            </p>
          </div>
        </div>

        <div className="roster-v3-body">
          <div className="roster-v3-facts">
            <Fact label="AGE" value={String(age(player.date_of_birth) ?? '-')} />
            <Fact label="CONTRACT" value={contract} />
            <Fact label="STATUS" value={status} />
          </div>

          <div
            className={`roster-v3-action ${
              actionOverdue ? 'is-overdue' : ''
            } ${!player.next_action ? 'is-quiet' : ''}`}
          >
            <span className="roster-v3-action-icon">
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

      <OwnerControl
        kind="player"
        entityId={player.id}
        ownerUserId={ownerUserId}
        ownerName={ownerName}
        team={team}
        onChanged={onOwnerChanged}
        onError={onError}
      />
    </article>
  );
}

function ProspectCard({
  player,
  index,
  ownerName,
  ownerUserId,
  team,
  onOwnerChanged,
  onError,
}: {
  player: any;
  index: number;
  ownerName: string | null;
  ownerUserId: string | null;
  team: TeamMember[];
  onOwnerChanged: (ownerId: string | null) => void;
  onError: (message: string) => void;
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
      className={`roster-v3-card prospect-card ${
        overdue ? 'is-overdue' : ''
      } ${needsNext ? 'needs-next' : ''} ${!ownerUserId ? 'is-unassigned' : ''}`}
      onPointerMove={cardPointerGlow}
      onPointerLeave={resetCardPointerGlow}
    >
      <Link
        href={`/recruitment/${player.id}`}
        className="roster-v3-card-link"
        aria-label={`Open ${player.full_name}`}
      >
        <div className="prospect-hero">
          <div className="prospect-gridmark" aria-hidden="true" />
          <span className="prospect-watermark" aria-hidden="true">
            {initials(player.full_name)}
          </span>
          <div className="prospect-card-index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="prospect-type">
            <UserRound size={12} />
            PROSPECT
          </div>

          <div className="prospect-content">
            <div className="prospect-stage-row">
              <span>{humanise(rawStage)}</span>
              <b>P{player.recruitment_priority || 3}</b>
            </div>

            <h3>{player.full_name}</h3>
            <p>
              {[player.primary_position, player.current_club, player.current_country]
                .filter(Boolean)
                .join(' · ') || 'Profile being enriched'}
            </p>

            <div className="prospect-progress" aria-label={`Recruitment progress ${progress} of 4`}>
              {[1, 2, 3, 4].map((step) => (
                <span key={step} className={step <= progress ? 'is-active' : ''}>
                  <i />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="roster-v3-body prospect-body">
          <div className="prospect-signals">
            <Signal
              label="CONTACT"
              value={contacted ? 'Contacted' : 'Not contacted'}
              detail={lastContact ? compactDate(lastContact) : 'No contact logged'}
              tone={contacted ? 'positive' : 'neutral'}
            />
            <Signal
              label="NEXT STEP"
              value={
                overdue
                  ? 'Overdue'
                  : needsNext
                    ? 'Required'
                    : nextAt
                      ? 'Scheduled'
                      : 'No action'
              }
              detail={nextLabel}
              tone={overdue ? 'danger' : needsNext ? 'attention' : nextAt ? 'positive' : 'neutral'}
            />
          </div>

          <div
            className={`roster-v3-action ${
              overdue ? 'is-overdue' : ''
            } ${needsNext ? 'is-attention' : ''}`}
          >
            <span className="roster-v3-action-icon">
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

      <OwnerControl
        kind="prospect"
        entityId={player.id}
        ownerUserId={ownerUserId}
        ownerName={ownerName}
        team={team}
        onChanged={onOwnerChanged}
        onError={onError}
      />
    </article>
  );
}

function OwnerControl({
  kind,
  entityId,
  ownerUserId,
  ownerName,
  team,
  onChanged,
  onError,
}: {
  kind: AssignmentKind;
  entityId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  team: TeamMember[];
  onChanged: (ownerId: string | null) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const assign = async (value: string) => {
    if (busy || value === (ownerUserId || '')) return;

    const next = value || null;
    setBusy(true);
    onError('');

    try {
      if (kind === 'player') {
        await djmRpc('djm_assign_player', {
          p_player_id: entityId,
          p_assigned_to_user_id: next,
        });
      } else {
        await djmRpc('djm_recruitment_assign_owner', {
          p_prospect_id: entityId,
          p_owner_user_id: next,
        });
      }

      onChanged(next);
    } catch (assignError) {
      onError(friendlyError(assignError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      className={`roster-owner-control ${
        ownerName ? '' : 'is-unassigned'
      } ${busy ? 'is-busy' : ''}`}
      title="Change DJM owner"
    >
      <span className="roster-owner-avatar">
        {ownerName ? initials(ownerName) : '!'}
      </span>

      <span className="roster-owner-copy">
        <small>DJM OWNER</small>
        <strong>{ownerName ? firstName(ownerName).toUpperCase() : 'UNASSIGNED'}</strong>
      </span>

      <ChevronDown size={12} />

      <select
        aria-label="Assigned to"
        value={ownerUserId || ''}
        disabled={busy}
        onChange={(event) => void assign(event.target.value)}
      >
        <option value="">Unassigned</option>
        {team.map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.display_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreMetric({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div className={`score-metric ${attention ? 'is-attention' : ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="roster-v3-fact">
      <small>{label}</small>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function Signal({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'attention' | 'danger';
}) {
  return (
    <div className={`prospect-signal is-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
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

  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) {
    result -= 1;
  }

  return result;
}

function parseDueDate(value?: string | null) {
  if (!value) return null;
  const source = String(value);
  const parsed = new Date(source.includes('T') ? source : `${source}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function initials(value?: string | null) {
  return (value || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function firstName(value?: string | null) {
  return String(value || '').trim().split(/\s+/)[0] || 'Staff';
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
  if (['identified', 'researching', 'ready_to_contact'].includes(stage)) return 1;
  if (stage === 'contacted') return 2;
  if (['replied', 'call_booked'].includes(stage)) return 3;

  if (
    ['interested', 'terms_discussed', 'agreement_sent', 'negotiating', 'signed'].includes(stage)
  ) {
    return 4;
  }

  return 1;
}

function cardPointerGlow(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;

  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  event.currentTarget.style.setProperty('--pointer-x', `${x}%`);
  event.currentTarget.style.setProperty('--pointer-y', `${y}%`);
}

function resetCardPointerGlow(event: ReactPointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty('--pointer-x', '50%');
  event.currentTarget.style.setProperty('--pointer-y', '0%');
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="ux-evidence-empty roster-v3-empty">
      <CheckCircle2 size={25} />
      <div>
        <strong>Nothing to show.</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
