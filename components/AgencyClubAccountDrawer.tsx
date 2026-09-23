'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Network,
  Target,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import styles from './AgencyClubAccountDrawer.module.css';

export type AgencyClubAccountRequest = {
  key: string;
  organisationId: string;
  title: string;
  context?: string | null;
};

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const number = (value: unknown, fallback = '0') => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? String(Math.round(parsed))
    : fallback;
};

const money = (
  value: unknown,
  currency = 'EUR',
) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'Not recorded';
  }

  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
  }
};

function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export default function AgencyClubAccountDrawer({
  request,
  invoke,
  onClose,
  onOpenAction,
  onOpenDeal,
  onOpenMarket,
}: {
  request: AgencyClubAccountRequest;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenDeal: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onOpenMarket: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [account, setAccount] = useState<any>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const response = await invoke(
        'club_account',
        {
          organisation_id:
            request.organisationId,
        },
      );

      setAccount(
        response?.club ||
          response?.result ||
          null,
      );
    } catch (loadError) {
      setError(
        friendlyError(loadError),
      );
    } finally {
      setBusy(false);
    }
  }, [
    invoke,
    request.organisationId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const keydown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      keydown,
    );

    return () => {
      document.body.style.overflow =
        previous;
      window.removeEventListener(
        'keydown',
        keydown,
      );
    };
  }, [onClose]);

  const club = account?.club || {};
  const coverage =
    account?.network_coverage || {};
  const access =
    account?.access || {};
  const direct =
    access?.direct || {};
  const directRoute =
    direct?.best_route || {};
  const introductions =
    access?.introductions || {};
  const introRoute =
    introductions?.best_route || {};
  const demand =
    account?.demand || {};
  const pursuits =
    list(account?.pursuits);
  const commercial =
    account?.commercial || {};
  const deals =
    list(commercial?.deals);
  const currencies =
    list(commercial?.by_currency);
  const work =
    account?.open_work || {};
  const tasks =
    list(work?.tasks);
  const commitments =
    list(work?.commitments);
  const plays =
    list(account?.strategic_plays);
  const evidenceRisk =
    list(account?.evidence_risk);

  const bestAction =
    coverage?.recommended_network_action ||
    introRoute?.recommended_action ||
    plays[0]?.recommended_action ||
    'Review the strongest recorded route before the next external move.';

  const preparePlay = (
    play: any,
  ) => {
    if (!play?.play_id) return;

    onOpenAction({
      key:
        `club-account-play:${play.play_id}`,
      eyebrow:
        'CLUB RELATIONSHIP PLAY',
      title:
        play.title ||
        request.title,
      instruction:
        play.recommended_action ||
        'Prepare the strongest recorded relationship play.',
      label:
        String(
          play.access_route_mode || '',
        ).includes('warm')
          ? 'Prepare introduction'
          : 'Prepare relationship play',
      action: 'play_prepare',
      payload: {
        play_id: play.play_id,
      },
      context:
        request.title,
      facts: [
        {
          label: 'Club',
          value: request.title,
          detail:
            [
              club.city,
              club.country,
              club.league_name,
            ]
              .filter(Boolean)
              .join(' · ') ||
            null,
        },
        {
          label: 'Play',
          value: human(
            play.play_type ||
              'relationship play',
          ),
          detail:
            play.rationale || null,
        },
        {
          label:
            'Direct route',
          value:
            directRoute.person_name ||
            'Not recorded',
          detail:
            directRoute.role_title ||
            null,
        },
        {
          label:
            'Introduction route',
          value:
            introRoute.intermediary
              ?.name ||
            'Not recorded',
          detail:
            introRoute.target_contact
              ?.name
              ? `To ${introRoute.target_contact.name}`
              : null,
        },
      ],
      successCondition:
        'A controlled internal relationship task is prepared from recorded agency evidence. No external message is sent automatically.',
      confirmationLabel:
        'Create relationship task',
    });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Club Account Room"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Recorded club intelligence
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close Club Account Room"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>
            CLUB ACCOUNT ROOM
          </p>

          <h2>
            {club.name ||
              request.title}
          </h2>

          <p className={styles.subhead}>
            {request.context ||
              [
                club.city,
                club.country,
                club.league_name,
              ]
                .filter(Boolean)
                .join(' · ') ||
              'Relationship, market and commercial context for this club.'}
          </p>
        </header>

        {busy ? (
          <div className={styles.notice}>
            <LoaderCircle
              size={18}
              className={styles.spin}
            />

            <div>
              <strong>
                Building the club operating picture
              </strong>
              <span>
                Loading recorded access, demand, pursuits, live business and relationship work.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            className={`${styles.notice} ${styles.error}`}
          >
            <CircleAlert size={18} />

            <div>
              <strong>
                Club account unavailable
              </strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {!busy && !error ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>ACCOUNT POSITION</p>

                <h3>
                  {human(
                    account?.account_state ||
                      coverage?.coverage_state ||
                      'recorded',
                  )}
                </h3>

                <span>
                  {bestAction}
                </span>
              </div>

              <div className={styles.heroSide}>
                <Network size={18} />

                <strong>
                  {coverage.single_threaded
                    ? 'Single-threaded'
                    : human(
                        coverage.coverage_state ||
                          'recorded',
                      )}
                </strong>

                <span>
                  network coverage
                </span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Active needs"
                value={number(
                  demand.active_needs,
                )}
                detail={`${number(
                  demand.confirmed_needs,
                )} confirmed`}
              />

              <Fact
                label="Active deals"
                value={number(
                  commercial.active_deals,
                )}
                detail="Recorded live commercial processes"
              />

              <Fact
                label="Direct routes"
                value={number(
                  direct.route_count,
                )}
                detail={human(
                  directRoute.route_state ||
                    'not recorded',
                )}
              />

              <Fact
                label="Warm routes"
                value={number(
                  introductions.route_count,
                )}
                detail={human(
                  introRoute.introduction_state ||
                    'not recorded',
                )}
              />
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Users size={17} />

                <div>
                  <p>ACCESS MAP</p>
                  <h3>
                    Direct access versus the strongest introduction path
                  </h3>
                </div>
              </div>

              <div className={styles.routeGrid}>
                <article className={styles.route}>
                  <span>DIRECT ROUTE</span>

                  <strong>
                    {directRoute.person_name ||
                      'No direct route recorded'}
                  </strong>

                  <p>
                    {directRoute.role_title ||
                      'Decision-maker role not recorded'}
                  </p>

                  {directRoute.route_score !==
                  undefined ? (
                    <small>
                      {number(
                        directRoute.route_score,
                      )}
                      /100 deterministic route ranking
                    </small>
                  ) : null}

                  {directRoute.why_this_route ? (
                    <em>
                      {
                        directRoute.why_this_route
                      }
                    </em>
                  ) : null}

                  {directRoute.team_member_name ? (
                    <em>
                      Relationship owner:{' '}
                      {
                        directRoute.team_member_name
                      }
                    </em>
                  ) : null}
                </article>

                <article className={styles.route}>
                  <span>WARM INTRODUCTION</span>

                  <strong>
                    {introRoute.intermediary
                      ?.name ||
                      'No introduction route recorded'}
                  </strong>

                  <p>
                    {introRoute.target_contact
                      ?.name
                      ? `To ${introRoute.target_contact.name}${
                          introRoute.target_contact
                            ?.role_title
                            ? ` · ${introRoute.target_contact.role_title}`
                            : ''
                        }`
                      : 'Target contact not recorded'}
                  </p>

                  {introRoute.introduction_score !==
                  undefined ? (
                    <small>
                      {number(
                        introRoute.introduction_score,
                      )}
                      /100 deterministic introduction ranking
                    </small>
                  ) : null}

                  {introRoute.why_this_path ? (
                    <em>
                      {
                        introRoute.why_this_path
                      }
                    </em>
                  ) : null}

                  {introRoute.intermediary
                    ?.relationship_owner_name ? (
                    <em>
                      Relationship owner:{' '}
                      {
                        introRoute.intermediary
                          .relationship_owner_name
                      }
                    </em>
                  ) : null}
                </article>
              </div>

              <p className={styles.truth}>
                Route rankings compare recorded relationship evidence. They are not probabilities that a person will reply, make an introduction or complete a deal.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Target size={17} />

                <div>
                  <p>MARKET POSITION</p>
                  <h3>
                    Current demand and player routes into this club
                  </h3>
                </div>
              </div>

              <div className={styles.rows}>
                {pursuits
                  .slice(0, 6)
                  .map((item: any) => (
                    <article
                      className={styles.row}
                      key={
                        item.player_match_id
                      }
                    >
                      <div>
                        <strong>
                          {item.player
                            ?.name ||
                            'Player'}
                          {' '}→{' '}
                          {club.name ||
                            request.title}
                        </strong>

                        <span>
                          {item.need?.title ||
                            'Recorded club demand'}
                          {' '}·{' '}
                          {human(
                            item.readiness_state ||
                              'recorded',
                          )}
                        </span>

                        <small>
                          {item.match_reasoning
                            ?.summary ||
                            item.interpretation ||
                            'Recorded pursuit evidence'}
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={onOpenMarket}
                      >
                        <ArrowRight
                          size={14}
                        />
                        Open Market
                      </button>
                    </article>
                  ))}

                {!pursuits.length ? (
                  <div className={styles.empty}>
                    <Target size={17} />

                    <div>
                      <strong>
                        No active player route is recorded for this club.
                      </strong>

                      <span>
                        New club needs and player matches will appear here when they are recorded.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <BriefcaseBusiness
                  size={17}
                />

                <div>
                  <p>LIVE BUSINESS</p>
                  <h3>
                    Commercial exposure attached to this relationship
                  </h3>
                </div>
              </div>

              {currencies.length ? (
                <div
                  className={
                    styles.currencyGrid
                  }
                >
                  {currencies.map(
                    (item: any) => (
                      <Fact
                        key={
                          item.currency
                        }
                        label={`${item.currency} pipeline`}
                        value={money(
                          item.expected_commission,
                          item.currency,
                        )}
                        detail={`${money(
                          item.weighted_commission,
                          item.currency,
                        )} weighted · ${number(
                          item.active_deals,
                        )} active`}
                      />
                    ),
                  )}
                </div>
              ) : null}

              <div className={styles.rows}>
                {deals
                  .slice(0, 6)
                  .map((item: any) => (
                    <article
                      className={styles.row}
                      key={
                        item.deal_room_id
                      }
                    >
                      <div>
                        <strong>
                          {item.title ||
                            'Live deal'}
                        </strong>

                        <span>
                          {human(
                            item.stage ||
                              'recorded',
                          )}
                          {' '}·{' '}
                          {money(
                            item.expected_commission,
                            item.currency ||
                              'EUR',
                          )}{' '}
                          forecast commission
                        </span>

                        <small>
                          {item.primary_blocker ||
                            item.next_action_text ||
                            'No blocker recorded'}
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenDeal(
                            String(
                              item.deal_room_id,
                            ),
                            item.title ||
                              'Live deal',
                            club.name ||
                              request.title,
                          )
                        }
                      >
                        <ArrowRight
                          size={14}
                        />
                        War room
                      </button>
                    </article>
                  ))}

                {!deals.length ? (
                  <div className={styles.empty}>
                    <BriefcaseBusiness
                      size={17}
                    />

                    <div>
                      <strong>
                        No live deal is recorded against this club.
                      </strong>

                      <span>
                        Commercial exposure stays empty until a real deal record exists.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {currencies.length > 1 ? (
                <p className={styles.truth}>
                  Currency totals remain separate. The platform does not invent an FX conversion.
                </p>
              ) : null}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Network size={17} />

                <div>
                  <p>STRATEGIC PLAYS</p>
                  <h3>
                    The highest-value relationship moves supported by current evidence
                  </h3>
                </div>
              </div>

              <div className={styles.rows}>
                {plays
                  .slice(0, 5)
                  .map((play: any) => (
                    <article
                      className={styles.row}
                      key={play.play_id}
                    >
                      <div>
                        <strong>
                          {play.title ||
                            request.title}
                        </strong>

                        <span>
                          {human(
                            play.play_type ||
                              'relationship play',
                          )}
                          {' '}·{' '}
                          evidence{' '}
                          {human(
                            play.evidence_gate ||
                              'recorded',
                          )}
                        </span>

                        <small>
                          {play.recommended_action ||
                            play.rationale ||
                            'Recorded relationship play'}
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          preparePlay(play)
                        }
                      >
                        <ArrowRight
                          size={14}
                        />
                        Prepare
                      </button>
                    </article>
                  ))}

                {!plays.length ? (
                  <div className={styles.empty}>
                    <CheckCircle2
                      size={17}
                    />

                    <div>
                      <strong>
                        No strategic relationship play is currently recorded.
                      </strong>

                      <span>
                        The room will stay quiet rather than inventing an action.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <CheckCircle2 size={17} />

                <div>
                  <p>OPEN WORK</p>
                  <h3>
                    Existing tasks, commitments and evidence risks around this club
                  </h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact
                  label="Open tasks"
                  value={number(
                    tasks.length,
                  )}
                  detail={
                    tasks[0]?.title ||
                    'No task recorded'
                  }
                />

                <Fact
                  label="Commitments"
                  value={number(
                    commitments.length,
                  )}
                  detail={
                    commitments[0]
                      ?.title ||
                    commitments[0]
                      ?.summary ||
                    'No commitment recorded'
                  }
                />

                <Fact
                  label="Evidence risks"
                  value={number(
                    evidenceRisk.length,
                  )}
                  detail={
                    evidenceRisk[0]
                      ?.title ||
                    'No evidence risk recorded'
                  }
                />

                <Fact
                  label="Last direct touch"
                  value={
                    directRoute.last_meaningful_at
                      ? relativeDate(
                          directRoute.last_meaningful_at,
                        )
                      : 'Not recorded'
                  }
                  detail={
                    directRoute.person_name ||
                    null
                  }
                />
              </div>
            </section>

            <p className={styles.truth}>
              Club Account Room combines recorded relationship, market and commercial evidence. It does not infer private relationships, club intent, transfer outcomes or whether an introduction will happen.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
