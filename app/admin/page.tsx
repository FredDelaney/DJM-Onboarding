'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Plus,
  Search,
  MessageCircle,
  Clock3,
  ShieldCheck,
  Activity,
  UserPlus,
  Copy,
  Check,
  FileText,
  Bell,
  AlertTriangle,
} from 'lucide-react';

import { AdminShell, useAdmin } from '@/components/AdminShell';
import AppExperience from '@/components/AppExperience';
import {
  fmtDate,
  localDateISO,
  supabase,
  weekStartISO,
} from '@/lib/supabase';

export default function Admin() {
  const auth = useAdmin();

  const [players, setPlayers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [travelDocs, setTravelDocs] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);

  const [search, setSearch] = useState('');

  const [invite, setInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const [busy, setBusy] = useState(false);

  const [announce, setAnnounce] = useState('');
  const [toast, setToast] = useState('');

  const [teamEmail, setTeamEmail] = useState('');
  const [teamRole, setTeamRole] = useState('scout');
  
const [
  pendingRemoveEmail,
  setPendingRemoveEmail,
] = useState('');

  const load = async () => {
    const [
      { data: p },
      { data: r },
      { data: c },
      { data: o },
      { data: a },
      { data: d },
      { data: t },
    ] = await Promise.all([
      supabase
        .from('players')
        .select('*')
        .order('updated_at', { ascending: false }),

      supabase
        .from('player_requests')
        .select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: false }),

      supabase
        .from('weekly_checkins')
        .select('*')
        .order('week_start', { ascending: false }),

      supabase
        .from('player_opportunities')
        .select('*')
        .order('updated_at', { ascending: false }),

      supabase
        .from('player_agreements')
        .select('*')
        .order('end_date', { ascending: true }),

      supabase
        .from('player_documents')
        .select('id,player_id,title,document_type,country,expires_at')
        .not('expires_at', 'is', null)
        .order('expires_at', { ascending: true }),

      supabase
        .from('admin_allowlist')
        .select('*')
        .order('created_at'),
    ]);

    setPlayers(p || []);
    setRequests(r || []);
    setChecks(c || []);
    setOpps(o || []);
    setAgreements(a || []);
    setTravelDocs(d || []);
    setTeam(t || []);
  };

  useEffect(() => {
    if (!auth.loading) load();
  }, [auth.loading]);

  const latestBy = new Map<string, any>();

  checks.forEach((c) => {
    if (!latestBy.has(c.player_id)) {
      latestBy.set(c.player_id, c);
    }
  });

  const playerInbox = requests.filter((r) =>
    ['message', 'signal'].includes(r.request_type)
  );

  const outgoingRequests = requests.filter(
    (r) => !['message', 'signal'].includes(r.request_type)
  );

  const openOpps = opps.filter(
    (o) => !['won', 'lost', 'closed'].includes(o.stage)
  );

  const thisWeek = weekStartISO();

  const filtered = players.filter((p) =>
    `${p.first_name || ''} ${p.last_name || ''} ${
      p.preferred_name || ''
    } ${p.current_club || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const attention = useMemo(
    () =>
      players
        .map((p) => {
          const req = requests.filter((r) => r.player_id === p.id);

          const incoming = req.filter((r) =>
            ['message', 'signal'].includes(r.request_type)
          );

          const outgoing = req.filter(
            (r) => !['message', 'signal'].includes(r.request_type)
          );

          const check = latestBy.get(p.id);

          const overdueCheck =
            !check || check.week_start !== thisWeek;

const due =
  p.next_action_due &&
  p.next_action_due <=
    localDateISO();

          const review =
            p.verification_status === 'reviewing' ||
            p.review_required_at;

          const expiringDoc = travelDocs.find(
            (d) =>
              d.player_id === p.id &&
              d.expires_at &&
              new Date(d.expires_at).getTime() - Date.now() <
                180 * 86400000
          );

          let score =
            incoming.length * 7 +
            outgoing.length * 3 +
            (overdueCheck ? 2 : 0) +
            (due ? 4 : 0) +
            (review ? 5 : 0) +
            (expiringDoc ? 4 : 0) +
            (p.agency_priority === 'urgent'
              ? 6
              : p.agency_priority === 'high'
              ? 3
              : 0);

          return {
            p,
            req,
            incoming,
            outgoing,
            overdueCheck,
            due,
            review,
            expiringDoc,
            score,
          };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
[
  players,
  requests,
  checks,
  travelDocs,
  thisWeek,
]
  );

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 1800);
  };

  const createInvite = async () => {
    if (!inviteEmail.trim()) return;

    setBusy(true);

    const { data, error } = await supabase.rpc(
      'create_player_invitation',
      {
        invite_email: inviteEmail.trim(),
        player_name: inviteName.trim() || null,
      }
    );

    if (error || !data?.token) {
      flash(error?.message || 'Could not create invitation');
      setBusy(false);
      return;
    }

    setInviteLink(
      `${window.location.origin}/join/${data.token}`
    );

const {
  data: invitedPlayer,
} = await supabase
  .from('players')
  .select('*')
  .eq(
    'id',
    data.player_id,
  )
  .maybeSingle();

if (invitedPlayer) {
  setPlayers(
    (current) => [
      invitedPlayer,

      ...current.filter(
        (player) =>
          player.id !==
          invitedPlayer.id,
      ),
    ],
  );
}

    setBusy(false);

    flash(
      data.existing
        ? 'Existing invitation reopened'
        : 'Invitation ready'
    );
  };

  const postAnnouncement = async () => {
    if (!announce.trim()) return;

    const { error } = await supabase
      .from('announcements')
      .insert({
        title: 'From DJM',
        body: announce.trim(),
        published: true,
        created_by: auth.user.id,
      });

    if (error) {
      flash('Could not publish announcement');
      return;
    }

    const push = await supabase.functions.invoke(
      'dispatch-player-push',
      {
        body: { reason: 'announcement' },
      }
    );

    setAnnounce('');

    const pushed = Number(push.data?.sent || 0);

    flash(
      push.error
        ? 'Announcement published · push pending'
        : pushed > 0
        ? `Announcement published · ${pushed} push${
            pushed === 1 ? '' : 'es'
          } sent`
        : 'Announcement published'
    );
  };

 const addTeamMember =
  async () => {
    const email =
      teamEmail
        .trim()
        .toLowerCase();

    if (!email) {
      return;
    }

    const {
      data: member,
      error,
    } = await supabase
      .from(
        'admin_allowlist',
      )
      .upsert(
        {
          email,
          role: teamRole,
        },
        {
          onConflict:
            'email',
        },
      )
      .select('*')
      .single();

    if (
      error ||
      !member
    ) {
      flash(
        error?.message ||
          'Could not update team access',
      );

      return;
    }

    setTeamEmail('');

    setTeam(
      (current) => [
        ...current.filter(
          (item) =>
            item.email !==
            email,
        ),

        member,
      ].sort(
        (a, b) =>
          new Date(
            a.created_at,
          ).getTime() -
          new Date(
            b.created_at,
          ).getTime(),
      ),
    );

    flash(
      teamRole === 'admin'
        ? 'Admin access ready'
        : 'Scout access ready',
    );
  };

 const removeTeamMember =
  async (
    email: string,
  ) => {
    const { error } =
      await supabase
        .from(
          'admin_allowlist',
        )
        .delete()
        .eq(
          'email',
          email,
        );

    if (error) {
      flash(
        error.message ||
          'Could not remove access',
      );

      return;
    }

    setTeam(
      (current) =>
        current.filter(
          (item) =>
            item.email !==
            email,
        ),
    );

    setPendingRemoveEmail(
      '',
    );

    flash(
      'Team access removed',
    );
  };

  if (auth.loading) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  return (
    <AdminShell>
      <main className="container admin-main">
        <div
          className="row-between"
          style={{ alignItems: 'flex-end' }}
        >
          <div>
            <div className="section-kicker">
              DJM COMMAND CENTRE
            </div>

            <h1 className="admin-title">
              What needs attention.
            </h1>
          </div>

          <button
            className="btn btn-navy btn-sm"
            onClick={() => {
              setInvite(true);
              setInviteLink('');
            }}
          >
            <UserPlus size={15} />
            Invite player
          </button>
        </div>

        <div
          className="metric-row"
          style={{ marginTop: 24 }}
        >
          <div className="metric">
            <small>PLAYERS</small>
            <strong>{players.length}</strong>
          </div>

          <div className="metric">
            <small>PLAYER INBOX</small>
            <strong>{playerInbox.length}</strong>
          </div>

          <div className="metric">
            <small>LIVE CLUB ACTIVITY</small>
            <strong>{openOpps.length}</strong>
          </div>

          <div className="metric">
            <small>CHECKED IN THIS WEEK</small>
            <strong>
              {
                players.filter(
                  (p) =>
                    latestBy.get(p.id)?.week_start ===
                    thisWeek
                ).length
              }
            </strong>
          </div>
        </div>

        <div
          className="grid-main"
          style={{ marginTop: 22 }}
        >
          <div
            className="stack"
            style={{ gap: 22 }}
          >
            <section className="admin-card">
              <div className="row-between">
                <div>
                  <div className="section-kicker">
                    TODAY
                  </div>

                  <h2 className="section-title">
                    Priority queue
                  </h2>
                </div>

                <span className="pill">
                  {attention.length} items
                </span>
              </div>

              <div
                className="list-clean"
                style={{ marginTop: 10 }}
              >
                {attention.length ? (
                  attention.map((x) => (
                    <Link
                      href={`/admin/players/${x.p.id}`}
                      className="list-row"
                      key={x.p.id}
                    >
                      <div className="avatar">
                        {
                          (
                            x.p.preferred_name ||
                            x.p.first_name ||
                            'P'
                          )[0]
                        }
                      </div>

                      <div className="list-copy">
                        <strong>
                          {[x.p.first_name, x.p.last_name]
                            .filter(Boolean)
                            .join(' ') ||
                            x.p.preferred_name}
                        </strong>

                        <span>
                          {x.incoming.length
                            ? x.incoming[0]
                                .request_type ===
                              'message'
                              ? 'New player message'
                              : x.incoming[0].title
                            : x.outgoing.length
                            ? `${
                                x.outgoing.length
                              } request${
                                x.outgoing.length > 1
                                  ? 's'
                                  : ''
                              } waiting on player`
                            : x.review
                            ? 'Player data needs review'
                            : x.expiringDoc
                            ? `${
                                x.expiringDoc.document_type?.replace(
                                  '_',
                                  ' '
                                ) ||
                                'Travel document'
                              } ${
                                new Date(
                                  x.expiringDoc.expires_at
                                ) < new Date()
                                  ? 'expired'
                                  : 'expires ' +
                                    fmtDate(
                                      x.expiringDoc
                                        .expires_at
                                    )
                              }`
                            : x.due
                            ? `DJM action due: ${
                                x.p.next_action ||
                                'follow up'
                              }`
                            : x.overdueCheck
                            ? 'Weekly check-in not received'
                            : 'Needs attention'}
                        </span>
                      </div>

                      <ArrowRight
                        size={16}
                        className="muted"
                      />
                    </Link>
                  ))
                ) : (
                  <div className="empty">
                    <Check
                      size={22}
                      style={{
                        margin: '0 auto 8px',
                      }}
                    />

                    <strong>Nothing urgent.</strong>
                  </div>
                )}
              </div>
            </section>

            <section className="admin-card">
              <div className="row-between">
                <div>
                  <div className="section-kicker">
                    PLAYERS
                  </div>

                  <h2 className="section-title">
                    Representation roster
                  </h2>
                </div>

                <div
                  style={{ position: 'relative' }}
                >
                  <Search
                    size={15}
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: 12,
                      color: 'var(--muted)',
                    }}
                  />

                  <input
                    className="input"
                    style={{
                      height: 40,
                      minHeight: 40,
                      padding:
                        '8px 12px 8px 34px',
                      width: 220,
                    }}
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
                    placeholder="Search"
                  />
                </div>
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  marginTop: 16,
                }}
              >
                <table className="player-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Status</th>
                      <th>Club</th>
                      <th>Check-in</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((p) => {
                      const c = latestBy.get(p.id);

                      return (
                        <tr
                          key={p.id}
                          onClick={() =>
                            (location.href = `/admin/players/${p.id}`)
                          }
                          style={{
                            cursor: 'pointer',
                          }}
                        >
                          <td>
                            <strong>
                              {[
                                p.first_name,
                                p.last_name,
                              ]
                                .filter(Boolean)
                                .join(' ') ||
                                p.preferred_name ||
                                'Unnamed player'}
                            </strong>

                            <div className="tiny muted">
                              {p.primary_position ||
                                'Position not set'}
                            </div>
                          </td>

                          <td>
                            <span
                              className={`pill ${
                                p.verification_status ===
                                'verified'
                                  ? 'pill-good'
                                  : p.verification_status ===
                                    'reviewing'
                                  ? 'pill-warn'
                                  : ''
                              }`}
                            >
                              {
                                p.verification_status
                              }
                            </span>
                          </td>

                          <td>
                            {p.current_club || '—'}
                          </td>

                          <td>
                            {c?.week_start ===
                            thisWeek ? (
                              <span
                                style={{
                                  color:
                                    'var(--good)',
                                }}
                              >
                                This week
                              </span>
                            ) : (
                              <span className="muted">
                                Due
                              </span>
                            )}
                          </td>

                          <td>
                            <ArrowRight size={15} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside
            className="stack admin-sidebar"
            style={{ gap: 18 }}
          >
            <section className="admin-card">
              <div className="section-kicker">
                QUICK MESSAGE
              </div>

              <h3
                style={{
                  fontSize: 18,
                  margin: '0 0 8px',
                }}
              >
                Player announcement
              </h3>

              <p
                className="small muted"
                style={{ lineHeight: 1.45 }}
              >
                A lightweight note shown on player
                Home. Use individual requests for
                anything that needs an answer.
              </p>

              <textarea
                className="textarea"
                style={{ minHeight: 88 }}
                value={announce}
                onChange={(e) =>
                  setAnnounce(e.target.value)
                }
                placeholder="Short DJM update…"
              />

              <button
                className="btn btn-dark btn-sm btn-block"
                style={{ marginTop: 10 }}
                disabled={!announce.trim()}
                onClick={postAnnouncement}
              >
                <Bell size={14} />
                Publish
              </button>
            </section>

            <section className="admin-card">
              <div className="section-kicker">
                REPRESENTATION RADAR
              </div>

              <div className="list-clean">
                {agreements
                  .filter((a) => a.end_date)
                  .slice(0, 5)
                  .map((a) => {
                    const p = players.find(
                      (x) =>
                        x.id === a.player_id
                    );

                    return (
                      <Link
                        href={`/admin/players/${a.player_id}`}
                        className="list-row"
                        key={a.id}
                      >
                        <div className="list-icon">
                          <ShieldCheck size={16} />
                        </div>

                        <div className="list-copy">
                          <strong>
                            {p?.preferred_name ||
                              p?.first_name ||
                              'Player'}
                          </strong>

                          <span>
                            {a.agreement_type} ·{' '}
                            {fmtDate(a.end_date)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}

                {agreements.filter(
                  (a) => a.end_date
                ).length === 0 && (
                  <div
                    className="empty"
                    style={{
                      padding: '18px 0',
                    }}
                  >
                    No agreement expiries
                    recorded.
                  </div>
                )}
              </div>
            </section>

            <section className="admin-card">
              <div className="section-kicker">
                TRAVEL READINESS
              </div>

              <div className="list-clean">
                {travelDocs
                  .filter(
                    (d) =>
                      d.expires_at &&
                      new Date(
                        d.expires_at
                      ).getTime() -
                        Date.now() <
                        180 * 86400000
                  )
                  .slice(0, 5)
                  .map((d) => {
                    const p = players.find(
                      (x) =>
                        x.id === d.player_id
                    );

                    const expired =
                      new Date(d.expires_at) <
                      new Date();

                    return (
                      <Link
                        href={`/admin/players/${d.player_id}`}
                        className="list-row"
                        key={d.id}
                      >
                        <div className="list-icon">
                          <AlertTriangle
                            size={16}
                          />
                        </div>

                        <div className="list-copy">
                          <strong>
                            {p?.preferred_name ||
                              p?.first_name ||
                              'Player'}{' '}
                            ·{' '}
                            {d.country ||
                              d.document_type?.replace(
                                '_',
                                ' '
                              ) ||
                              'Document'}
                          </strong>

                          <span>
                            {expired
                              ? 'Expired'
                              : 'Expires'}{' '}
                            {fmtDate(d.expires_at)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}

                {travelDocs.filter(
                  (d) =>
                    d.expires_at &&
                    new Date(
                      d.expires_at
                    ).getTime() -
                      Date.now() <
                      180 * 86400000
                ).length === 0 && (
                  <div
                    className="empty"
                    style={{
                      padding: '18px 0',
                    }}
                  >
                    No travel documents expiring
                    in the next 6 months.
                  </div>
                )}
              </div>
            </section>

            {auth.user?.id && (
              <AppExperience
                userId={auth.user.id}
                mode="admin"
              />
            )}

            <section className="admin-card">
              <div className="section-kicker">
                TEAM ACCESS
              </div>

              <div className="list-clean">
                {team.map((t) => (
                  <div
                    className="list-row"
                    key={t.email}
                  >
                    <div className="list-icon">
                      <ShieldCheck size={16} />
                    </div>

                    <div className="list-copy">
                      <strong>{t.email}</strong>
                      <span>{t.role}</span>
                    </div>

{t.email !==
  auth.profile?.email && (
  pendingRemoveEmail ===
  t.email ? (
    <div
      className="row"
      style={{
        gap: 6,
      }}
    >
      <button
        className="btn btn-quiet btn-sm"
        onClick={() =>
          setPendingRemoveEmail(
            '',
          )
        }
      >
        Cancel
      </button>

      <button
        className="btn btn-dark btn-sm"
        onClick={() =>
          removeTeamMember(
            t.email,
          )
        }
      >
        Confirm remove
      </button>
    </div>
  ) : (
    <button
      className="btn btn-quiet btn-sm"
      onClick={() =>
        setPendingRemoveEmail(
          t.email,
        )
      }
    >
      Remove
    </button>
  )
)}
                  </div>
                ))}
              </div>

              <div className="divider" />

              <div className="field">
                <label className="label">
                  Add team member
                </label>

                <input
                  className="input"
                  type="email"
                  value={teamEmail}
                  onChange={(e) =>
                    setTeamEmail(
                      e.target.value
                    )
                  }
                  placeholder="name@djmsports.com"
                />
              </div>

              <div
                className="row"
                style={{ marginTop: 10 }}
              >
                <select
                  className="select"
                  style={{ flex: 1 }}
                  value={teamRole}
                  onChange={(e) =>
                    setTeamRole(
                      e.target.value
                    )
                  }
                >
                  <option value="scout">
                    Scout · limited
                  </option>

                  <option value="admin">
                    Admin · full access
                  </option>
                </select>

                <button
                  className="btn btn-dark btn-sm"
                  onClick={addTeamMember}
                  disabled={!teamEmail.trim()}
                >
                  Add
                </button>
              </div>

              <p
                className="tiny muted"
                style={{ lineHeight: 1.45 }}
              >
                Adding an email authorises that
                person to create their DJM account.
                Scout access is intended for limited
                future use.
              </p>
            </section>
          </aside>
        </div>

        {invite && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 90,
              background: 'rgba(0,0,0,.36)',
              display: 'grid',
              placeItems: 'center',
              padding: 18,
            }}
            onClick={() => setInvite(false)}
          >
            <div
              className="card pad-lg card-shadow"
              style={{
                width: 'min(500px,100%)',
              }}
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div className="section-kicker">
                INVITE PLAYER
              </div>

              <h2 className="section-title">
                Create their private access.
              </h2>

              <p className="small muted">
                DJM creates the player record first.
                The player receives one private link
                and completes the rest.
              </p>

              {!inviteLink ? (
                <div
                  className="stack"
                  style={{ marginTop: 22 }}
                >
                  <div className="field">
                    <label className="label">
                      Player name
                    </label>

                    <input
                      className="input"
                      value={inviteName}
                      onChange={(e) =>
                        setInviteName(
                          e.target.value
                        )
                      }
                      placeholder="Full name"
                    />
                  </div>

                  <div className="field">
                    <label className="label">
                      Player email
                    </label>

                    <input
                      className="input"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) =>
                        setInviteEmail(
                          e.target.value
                        )
                      }
                      placeholder="player@email.com"
                    />
                  </div>

                  <button
                    className="btn btn-navy btn-block"
                    onClick={createInvite}
                    disabled={
                      busy ||
                      !inviteEmail.trim()
                    }
                  >
                    {busy
                      ? 'Creating…'
                      : 'Create invitation'}

                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div
                  style={{ marginTop: 22 }}
                >
                  <div className="card pad soft">
                    <div className="tiny muted">
                      PRIVATE PLAYER LINK
                    </div>

                    <div
                      style={{
                        wordBreak: 'break-all',
                        fontSize: 13,
                        marginTop: 8,
                      }}
                    >
                      {inviteLink}
                    </div>
                  </div>

                  <button
                    className="btn btn-dark btn-block"
                    style={{
                      marginTop: 12,
                    }}
                    onClick={() =>
                      navigator.clipboard.writeText(
                        inviteLink
                      )
                    }
                  >
                    <Copy size={15} />
                    Copy link
                  </button>
                </div>
              )}

              <button
                className="btn btn-quiet btn-block"
                style={{ marginTop: 10 }}
                onClick={() =>
                  setInvite(false)
                }
              >
                Close
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </AdminShell>
  );
}
