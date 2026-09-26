'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MessageCircleMore,
  Route,
  Target,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import {
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';

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

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const clean = (value: unknown) =>
  String(value || '').trim();

const human = (value: unknown) =>
  clean(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.round(parsed)
    : 0;
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
    return `${currency} ${Math.round(
      amount,
    ).toLocaleString('en-GB')}`;
  }
};

const stateCopy = (value: unknown) => {
  const state = clean(value);

  if (
    state.includes('commercially_active') ||
    state.includes('live_demand_connected')
  ) {
    return 'Active relationship';
  }

  if (
    state.includes('warm_introduction')
  ) {
    return 'Warm route available';
  }

  if (
    state.includes('access_gap') ||
    state.includes('underconnected')
  ) {
    return 'Access needs work';
  }

  if (
    state.includes('relationship_strong')
  ) {
    return 'Strong relationship';
  }

  return 'Relationship developing';
};

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
  const [busy, setBusy] =
    useState(true);

  const [error, setError] =
    useState('');

  const [account, setAccount] =
    useState<any>(null);

  const load = useCallback(
    async () => {
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
    },
    [
      invoke,
      request.organisationId,
    ],
  );

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

  const club =
    account?.club || {};

  const access =
    account?.access || {};

  const direct =
    access?.direct || {};

  const directRoutes =
    list(direct?.routes);

  const introductions =
    access?.introductions || {};

  const introRoutes =
    list(introductions?.routes);

  const network =
    access?.network_coverage || {};

  const demand =
    account?.demand || {};

  const needs =
    list(demand?.items);

  const activity =
    account?.relationship_activity ||
    {};

  const interactions =
    list(activity?.recent);

  const work =
    account?.open_work || {};

  const tasks =
    list(work?.tasks);

  const commitments =
    list(work?.commitments);

  const commercial =
    account?.commercial || {};

  const deals =
    list(commercial?.deals);

  const pursuits =
    list(account?.pursuits);

  const plays =
    list(account?.strategic_plays);

  const topPlay =
    account?.top_strategic_play ||
    plays[0] ||
    null;

  const promiseTaskIds =
    useMemo(
      () =>
        new Set(
          commitments
            .map((item: any) =>
              clean(item?.task_id),
            )
            .filter(Boolean),
        ),
      [commitments],
    );

  const taskById =
    useMemo(
      () =>
        new Map(
          tasks
            .filter((item: any) =>
              clean(item?.task_id),
            )
            .map((item: any) => [
              clean(item.task_id),
              item,
            ]),
        ),
      [tasks],
    );

  const promiseRows =
    useMemo(() => {
      const linked =
        commitments.map(
          (item: any) => {
            const task =
              taskById.get(
                clean(item?.task_id),
              ) || {};

            return {
              id:
                clean(
                  item?.commitment_id,
                ) ||
                clean(item?.task_id),

              title:
                clean(task?.title) ||
                clean(
                  item?.metadata
                    ?.title,
                ) ||
                'Agency promise',

              due_at:
                item?.due_at ||
                task?.due_at,

              owner_name:
                clean(
                  task?.owner_name,
                ),
            };
          },
        );

      const taskOnly =
        tasks
          .filter(
            (item: any) =>
              item?.task_type ===
                'commitment' &&
              !promiseTaskIds.has(
                clean(
                  item?.task_id,
                ),
              ),
          )
          .map((item: any) => ({
            id: clean(item?.task_id),
            title:
              clean(item?.title) ||
              'Agency promise',
            due_at: item?.due_at,
            owner_name: clean(
              item?.owner_name,
            ),
          }));

      return [...linked, ...taskOnly];
    }, [
      commitments,
      promiseTaskIds,
      taskById,
      tasks,
    ]);

  const followUps =
    useMemo(
      () =>
        tasks.filter(
          (item: any) =>
            item?.task_type !==
              'commitment' &&
            !promiseTaskIds.has(
              clean(
                item?.task_id,
              ),
            ),
        ),
      [promiseTaskIds, tasks],
    );

  const bestRoute =
    direct?.best_route || {};

  const bestIntro =
    introductions?.best_route || {};

  const nextMove =
    clean(
      topPlay?.recommended_action,
    ) ||
    clean(
      network
        ?.recommended_network_action,
    ) ||
    clean(
      bestIntro?.recommended_action,
    ) ||
    'Review the strongest recorded relationship before the next external move.';

  const nextMoveLabel =
    String(
      topPlay
        ?.access_route_mode || '',
    ).includes('warm')
      ? 'Prepare introduction'
      : topPlay?.play_type ===
          'source_for_confirmed_need'
        ? 'Work club need'
        : topPlay?.play_type ===
            'pitch_now'
          ? 'Review pitch route'
          : [
                'protect_live_deal',
                'remove_deal_blocker',
              ].includes(
                topPlay?.play_type,
              )
            ? 'Protect opportunity'
            : 'Prepare next move';

  const prepareNextMove = () => {
    if (!topPlay?.play_id) {
      onOpenMarket();
      return;
    }

    onOpenAction({
      key:
        `club-next-move:${topPlay.play_id}`,

      eyebrow: 'NEXT MOVE',

      title:
        topPlay.title ||
        club.name ||
        request.title,

      instruction:
        nextMove,

      label:
        nextMoveLabel,

      action:
        'play_prepare',

      payload: {
        play_id:
          topPlay.play_id,
      },

      context:
        club.name ||
        request.title,

      facts: [
        {
          label: 'Club',
          value:
            club.name ||
            request.title,
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
          label:
            'Best recorded route',
          value:
            bestRoute
              ?.person_name ||
            'Not recorded',
          detail:
            bestRoute
              ?.team_member_name
              ? `Known by ${bestRoute.team_member_name}`
              : null,
        },
        {
          label:
            'Club needs',
          value:
            `${number(
              demand?.active_needs,
            )} active`,
          detail:
            `${number(
              demand?.confirmed_needs,
            )} confirmed`,
        },
      ],

      successCondition:
        'The agency prepares the next internal relationship action from recorded evidence. Nothing is sent externally without a person confirming it.',

      confirmationLabel:
        nextMoveLabel,
    });
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
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
        aria-label={`Club details for ${
          club.name ||
          request.title
        }`}
      >
        <header
          className={
            styles.header
          }
        >
          <div
            className={
              styles.headerTop
            }
          >
            <div>
              <p
                className={
                  styles.eyebrow
                }
              >
                CLUB
              </p>

              <h2>
                {club.name ||
                  request.title}
              </h2>

              <p
                className={
                  styles.location
                }
              >
                {[
                  club.city,
                  club.country,
                  club.league_name,
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                  request.context ||
                  'Club relationship'}
              </p>
            </div>

            <button
              type="button"
              className={
                styles.close
              }
              onClick={
                onClose
              }
              aria-label="Close club"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {busy ? (
          <div
            className={
              styles.notice
            }
          >
            <LoaderCircle
              size={18}
              className={
                styles.spin
              }
            />

            <div>
              <strong>
                Loading club
              </strong>
              <span>
                Pulling together the relationship, current needs and live work.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            className={`${styles.notice} ${styles.error}`}
          >
            <CircleAlert
              size={18}
            />

            <div>
              <strong>
                Club unavailable
              </strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {!busy && !error ? (
          <div
            className={
              styles.content
            }
          >
            <section
              className={
                styles.nextMove
              }
            >
              <div>
                <span>
                  NEXT MOVE
                </span>

                <strong>
                  {nextMove}
                </strong>

                <small>
                  {stateCopy(
                    account?.account_state,
                  )}
                </small>
              </div>

              <button
                type="button"
                onClick={
                  prepareNextMove
                }
              >
                {topPlay?.play_id
                  ? nextMoveLabel
                  : 'Open Opportunities'}

                <ArrowRight
                  size={15}
                />
              </button>
            </section>

            <section
              className={
                styles.quickFacts
              }
            >
              <Fact
                label="People we know"
                value={String(
                  directRoutes.length,
                )}
                detail={
                  bestRoute
                    ?.person_name ||
                  'No direct route recorded'
                }
              />

              <Fact
                label="What they need"
                value={String(
                  number(
                    demand?.active_needs,
                  ),
                )}
                detail={`${number(
                  demand
                    ?.confirmed_needs,
                )} confirmed`}
              />

              <Fact
                label="Live opportunities"
                value={String(
                  deals.length +
                    pursuits.length,
                )}
                detail={`${deals.length} deal${
                  deals.length === 1
                    ? ''
                    : 's'
                } · ${pursuits.length} player route${
                  pursuits.length === 1
                    ? ''
                    : 's'
                }`}
              />

              <Fact
                label="Follow-up"
                value={String(
                  followUps.length +
                    promiseRows.length,
                )}
                detail={`${promiseRows.length} promise${
                  promiseRows.length === 1
                    ? ''
                    : 's'
                } to keep`}
              />
            </section>

            <section
              className={
                styles.section
              }
            >
              <SectionHead
                icon={Users}
                label="PEOPLE WE KNOW"
                title="Who gives us a route into this club"
              />

              {directRoutes.length ? (
                <div
                  className={
                    styles.people
                  }
                >
                  {directRoutes
                    .slice(0, 8)
                    .map(
                      (
                        route: any,
                      ) => (
                        <article
                          key={
                            clean(
                              route?.person_id,
                            ) ||
                            clean(
                              route?.person_name,
                            )
                          }
                          className={
                            styles.person
                          }
                        >
                          <div
                            className={
                              styles.personIcon
                            }
                          >
                            <Route
                              size={15}
                            />
                          </div>

                          <div>
                            <strong>
                              {clean(
                                route
                                  ?.person_name,
                              ) ||
                                'Club contact'}
                            </strong>

                            <span>
                              {clean(
                                route
                                  ?.role_title,
                              ) ||
                                'Role not recorded'}
                            </span>

                            <small>
                              {[
                                route
                                  ?.team_member_name
                                  ? `Known by ${route.team_member_name}`
                                  : null,

                                route
                                  ?.last_meaningful_at
                                  ? `Last meaningful ${relativeDate(
                                      route.last_meaningful_at,
                                    )}`
                                  : 'No meaningful date recorded',
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' · ',
                                )}
                            </small>
                          </div>

                          <em>
                            {human(
                              route
                                ?.route_state ||
                                'recorded',
                            )}
                          </em>
                        </article>
                      ),
                    )}
                </div>
              ) : (
                <Empty
                  title="No direct relationship recorded"
                  copy={
                    bestIntro
                      ?.intermediary
                      ?.name
                      ? `A warm introduction route is recorded through ${bestIntro.intermediary.name}.`
                      : 'ReDream will show the strongest recorded route when the agency connects a person to this club.'
                  }
                />
              )}

              {introRoutes.length ? (
                <div
                  className={
                    styles.warmRoute
                  }
                >
                  <Route
                    size={15}
                  />

                  <div>
                    <span>
                      WARM ROUTE
                    </span>

                    <strong>
                      {bestIntro
                        ?.intermediary
                        ?.name ||
                        'Introduction route recorded'}
                    </strong>

                    <small>
                      {bestIntro
                        ?.target_contact
                        ?.name
                        ? `Can introduce us to ${bestIntro.target_contact.name}`
                        : 'Target person recorded in Network'}
                    </small>
                  </div>
                </div>
              ) : null}
            </section>

            <section
              className={
                styles.section
              }
            >
              <SectionHead
                icon={Target}
                label="WHAT THEY NEED"
                title="Current club requirements"
              />

              {needs.length ? (
                <div
                  className={
                    styles.rows
                  }
                >
                  {needs
                    .slice(0, 8)
                    .map(
                      (
                        need: any,
                      ) => (
                        <article
                          className={
                            styles.row
                          }
                          key={
                            need
                              ?.club_need_id
                          }
                        >
                          <div>
                            <strong>
                              {clean(
                                need
                                  ?.title,
                              ) ||
                                clean(
                                  need
                                    ?.position,
                                ) ||
                                'Club need'}
                            </strong>

                            <span>
                              {[
                                clean(
                                  need
                                    ?.position,
                                ),
                                human(
                                  need
                                    ?.need_type ||
                                    'recorded',
                                ),
                                clean(
                                  need
                                    ?.transfer_type,
                                ),
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' · ',
                                )}
                            </span>

                            <small>
                              {need
                                ?.salary_budget
                                ? `${money(
                                    need.salary_budget,
                                    need.currency ||
                                      'EUR',
                                  )} salary budget`
                                : need
                                      ?.transfer_budget
                                  ? `${money(
                                      need.transfer_budget,
                                      need.currency ||
                                        'EUR',
                                    )} transfer budget`
                                  : clean(
                                      need
                                        ?.profile_notes,
                                    ) ||
                                    'No further brief recorded'}
                            </small>
                          </div>

                          <button
                            type="button"
                            onClick={
                              onOpenMarket
                            }
                          >
                            Work need
                            <ArrowRight
                              size={14}
                            />
                          </button>
                        </article>
                      ),
                    )}
                </div>
              ) : (
                <Empty
                  title="No active club need recorded"
                  copy="When the agency records what this club is looking for, it will appear here."
                />
              )}
            </section>

            <section
              className={
                styles.section
              }
            >
              <SectionHead
                icon={
                  MessageCircleMore
                }
                label="RECENT CONVERSATIONS"
                title="What has actually been said"
              />

              {interactions.length ? (
                <div
                  className={
                    styles.timeline
                  }
                >
                  {interactions
                    .slice(0, 8)
                    .map(
                      (
                        item: any,
                      ) => (
                        <article
                          key={
                            item
                              ?.interaction_id
                          }
                          className={
                            styles.timelineRow
                          }
                        >
                          <Clock3
                            size={14}
                          />

                          <div>
                            <strong>
                              {clean(
                                item
                                  ?.summary,
                              ) ||
                                'Conversation recorded'}
                            </strong>

                            <span>
                              {[
                                clean(
                                  item
                                    ?.person_name,
                                ),
                                item
                                  ?.occurred_at
                                  ? relativeDate(
                                      item.occurred_at,
                                    )
                                  : null,
                                human(
                                  item
                                    ?.channel,
                                ),
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' · ',
                                )}
                            </span>

                            {clean(
                              item
                                ?.team_member_name,
                            ) ? (
                              <small>
                                Recorded by{' '}
                                {
                                  item.team_member_name
                                }
                              </small>
                            ) : null}
                          </div>
                        </article>
                      ),
                    )}
                </div>
              ) : (
                <Empty
                  title="No conversation recorded yet"
                  copy="Calls, meetings and connected conversations will build the club history here."
                />
              )}
            </section>

            <section
              className={
                styles.section
              }
            >
              <SectionHead
                icon={
                  CheckCircle2
                }
                label="FOLLOW THROUGH"
                title="Promises and follow-up"
              />

              <div
                className={
                  styles.workColumns
                }
              >
                <WorkBlock
                  title="Promises"
                  items={promiseRows}
                  empty="No open promise is recorded."
                />

                <WorkBlock
                  title="Follow-up"
                  items={followUps.map(
                    (
                      item: any,
                    ) => ({
                      id:
                        clean(
                          item?.task_id,
                        ),
                      title:
                        clean(
                          item?.title,
                        ) ||
                        'Follow up',
                      due_at:
                        item?.due_at,
                      owner_name:
                        clean(
                          item?.owner_name,
                        ),
                    }),
                  )}
                  empty="Nothing is currently due."
                />
              </div>
            </section>

            <section
              className={
                styles.section
              }
            >
              <SectionHead
                icon={
                  BriefcaseBusiness
                }
                label="LIVE OPPORTUNITIES"
                title="Players and deals currently moving with this club"
              />

              {deals.length ||
              pursuits.length ? (
                <div
                  className={
                    styles.rows
                  }
                >
                  {deals
                    .slice(0, 5)
                    .map(
                      (
                        deal: any,
                      ) => (
                        <article
                          className={
                            styles.row
                          }
                          key={
                            deal
                              ?.deal_room_id
                          }
                        >
                          <div>
                            <strong>
                              {clean(
                                deal
                                  ?.title,
                              ) ||
                                'Live deal'}
                            </strong>

                            <span>
                              {human(
                                deal
                                  ?.stage ||
                                  'active',
                              )}
                            </span>

                            <small>
                              {clean(
                                deal
                                  ?.primary_blocker,
                              ) ||
                                clean(
                                  deal
                                    ?.next_action_text,
                                ) ||
                                'No blocker recorded'}
                            </small>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onOpenDeal(
                                String(
                                  deal
                                    ?.deal_room_id,
                                ),
                                clean(
                                  deal
                                    ?.title,
                                ) ||
                                  'Live deal',
                                club.name ||
                                  request.title,
                              )
                            }
                          >
                            Open deal
                            <ArrowRight
                              size={14}
                            />
                          </button>
                        </article>
                      ),
                    )}

                  {pursuits
                    .slice(0, 5)
                    .map(
                      (
                        pursuit: any,
                      ) => (
                        <article
                          className={
                            styles.row
                          }
                          key={
                            pursuit
                              ?.player_match_id
                          }
                        >
                          <div>
                            <strong>
                              {pursuit
                                ?.player
                                ?.name ||
                                'Player route'}
                            </strong>

                            <span>
                              {pursuit
                                ?.need
                                ?.title ||
                                'Recorded club demand'}
                            </span>

                            <small>
                              {pursuit
                                ?.match_reasoning
                                ?.summary ||
                                pursuit
                                  ?.interpretation ||
                                'Player route recorded'}
                            </small>
                          </div>

                          <button
                            type="button"
                            onClick={
                              onOpenMarket
                            }
                          >
                            Open opportunity
                            <ArrowRight
                              size={14}
                            />
                          </button>
                        </article>
                      ),
                    )}
                </div>
              ) : (
                <Empty
                  title="No live opportunity recorded"
                  copy="Player routes and deals will appear here when they are connected to this club."
                />
              )}
            </section>

            <p
              className={
                styles.truth
              }
            >
              ReDream shows recorded agency relationships, conversations, needs and work. It does not guess private club intent or whether a transfer will happen.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      className={
        styles.fact
      }
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  label,
  title,
}: {
  icon: typeof Users;
  label: string;
  title: string;
}) {
  return (
    <div
      className={
        styles.sectionHead
      }
    >
      <Icon size={16} />

      <div>
        <span>{label}</span>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function WorkBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    due_at?: string | null;
    owner_name?: string | null;
  }>;
  empty: string;
}) {
  return (
    <div
      className={
        styles.workBlock
      }
    >
      <div
        className={
          styles.workTitle
        }
      >
        <CalendarClock
          size={14}
        />
        <strong>{title}</strong>
        <span>{items.length}</span>
      </div>

      {items.length ? (
        <div
          className={
            styles.workList
          }
        >
          {items
            .slice(0, 6)
            .map((item) => (
              <div
                key={item.id}
                className={
                  styles.workRow
                }
              >
                <strong>
                  {item.title}
                </strong>

                <small>
                  {[
                    item.due_at
                      ? relativeDate(
                          item.due_at,
                        )
                      : 'No date',
                    item.owner_name,
                  ]
                    .filter(
                      Boolean,
                    )
                    .join(' · ')}
                </small>
              </div>
            ))}
        </div>
      ) : (
        <p
          className={
            styles.emptyText
          }
        >
          {empty}
        </p>
      )}
    </div>
  );
}

function Empty({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div
      className={
        styles.empty
      }
    >
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}
