'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CircleAlert,
  Clock3,
  GitBranch,
  Network,
  Route,
  Search,
  TimerReset,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import AgencyContactIntelligenceDrawer from '@/components/AgencyContactIntelligenceDrawer';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyClubAccountRequest } from '@/components/AgencyClubAccountDrawer';
import { relativeDate } from '@/lib/platform-client';

import styles from './AgencyNetworkWorkspace.module.css';

type NetworkView = 'clubs' | 'people';

type NetworkFocus =
  | 'all'
  | 'attention'
  | 'warm'
  | 'strong'
  | 'cooling';

type Rpc = <T,>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysSince = (value: unknown) => {
  if (!value) return null;

  const time = Date.parse(String(value));
  if (!Number.isFinite(time)) return null;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - time) /
        (24 * 60 * 60 * 1000),
    ),
  );
};

const clubNeedsAttention = (club: any) => {
  const access = club?.access || {};
  const commercial = club?.commercial || {};
  const demand = club?.demand || {};

  const direct = number(access?.direct_score);
  const introduction = number(
    access?.introduction_score,
  );

  const liveContext =
    number(commercial?.active_deals) > 0 ||
    number(demand?.confirmed_needs) > 0;

  return (
    number(commercial?.deals_needing_action) > 0 ||
    (liveContext &&
      direct < 60 &&
      introduction < 65)
  );
};

const clubHasWarmRoute = (club: any) => {
  const access = club?.access || {};
  const direct = number(access?.direct_score);
  const introduction = number(
    access?.introduction_score,
  );

  return (
    introduction >= 65 &&
    introduction > direct
  );
};

const clubHasStrongRoute = (club: any) =>
  number(club?.access?.direct_score) >= 75;

const clubIsCooling = (club: any) => {
  const lastAt =
    club?.activity?.last_interaction_at;

  const age = daysSince(lastAt);

  if (age === null || age <= 45) {
    return false;
  }

  const commercial =
    club?.commercial || {};
  const demand =
    club?.demand || {};

  return (
    number(commercial?.active_deals) > 0 ||
    number(demand?.confirmed_needs) > 0 ||
    number(club?.access?.direct_score) >= 60
  );
};

const personNeedsAttention = (item: any) => {
  const work = item?.work || {};
  const clubContext =
    item?.club_context || {};

  return (
    number(work?.overdue_tasks) > 0 ||
    number(
      clubContext?.deals_needing_action,
    ) > 0 ||
    (number(
      clubContext?.confirmed_needs,
    ) > 0 &&
      number(
        item?.relationship?.route_score,
      ) < 60)
  );
};

const personHasStrongRoute = (item: any) =>
  number(
    item?.relationship?.route_score,
  ) >= 75;

const personIsCooling = (item: any) => {
  const relationship =
    item?.relationship || {};

  const activity =
    item?.activity || {};

  const lastAt =
    activity?.last_interaction_at ||
    relationship?.last_meaningful_at;

  const age = daysSince(lastAt);

  return (
    age !== null &&
    age > 45 &&
    number(
      relationship?.route_score,
    ) > 0
  );
};

function Empty({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.empty}>
      <Network size={20} />
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

export default function AgencyNetworkWorkspace({
  data,
  rpc,
  onRefresh,
  onOpenAction,
  onOpenClubAccount,
}: {
  data: any;
  rpc: Rpc;
  onRefresh: () => Promise<void>;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenClubAccount: (request: AgencyClubAccountRequest) => void;
}) {
  const [view, setView] = useState<NetworkView>('clubs');
  const [focus, setFocus] =
    useState<NetworkFocus>('all');
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<any>(null);

  const accounts = data?.accounts || {};
  const clubs = list(accounts?.clubs);
  const clubSummary = accounts?.summary || {};

  const contactData = data?.contacts || {};
  const people = list(contactData?.items);
  const peopleSummary = contactData?.summary || {};

  const searchValue = search.trim().toLowerCase();

  const peopleByClub = useMemo(() => {
    const grouped = new Map<string, any[]>();

    people.forEach((item: any) => {
      const organisationId = String(
        item?.employment?.organisation_id || '',
      );
      if (!organisationId) return;

      const current = grouped.get(organisationId) || [];
      current.push(item);
      grouped.set(organisationId, current);
    });

    grouped.forEach((items) => {
      items.sort(
        (a, b) =>
          number(b?.relationship?.route_score) -
          number(a?.relationship?.route_score),
      );
    });

    return grouped;
  }, [people]);

  const filteredClubs = useMemo(() => {
    return clubs.filter((club: any) => {
      const matchesSearch =
        !searchValue ||
        [
          club?.name,
          club?.city,
          club?.country,
          club?.league_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue);

      if (!matchesSearch) {
        return false;
      }

      if (focus === 'attention') {
        return clubNeedsAttention(club);
      }

      if (focus === 'warm') {
        return clubHasWarmRoute(club);
      }

      if (focus === 'strong') {
        return clubHasStrongRoute(club);
      }

      if (focus === 'cooling') {
        return clubIsCooling(club);
      }

      return true;
    });
  }, [clubs, focus, searchValue]);

  const filteredPeople = useMemo(() => {
    return people.filter((item: any) => {
      const person = item?.person || {};
      const employment = item?.employment || {};

      const matchesSearch =
        !searchValue ||
        [
          person?.full_name,
          person?.preferred_name,
          person?.country,
          person?.city,
          employment?.role_title,
          employment?.department,
          employment?.organisation_name,
          employment?.organisation_country,
          employment?.organisation_city,
          employment?.league_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue);

      if (!matchesSearch) {
        return false;
      }

      if (focus === 'attention') {
        return personNeedsAttention(item);
      }

      if (focus === 'strong') {
        return personHasStrongRoute(item);
      }

      if (focus === 'cooling') {
        return personIsCooling(item);
      }

      return focus !== 'warm';
    });
  }, [focus, people, searchValue]);

  const strongestRoutes = people.filter(
    (item: any) => number(item?.relationship?.route_score) > 0,
  ).length;

  const followUps = number(
    peopleSummary?.contacts_with_open_follow_up,
  );

  const attentionClubs =
    clubs.filter(
      clubNeedsAttention,
    ).length;

  const warmRouteClubs =
    clubs.filter(
      clubHasWarmRoute,
    ).length;

  const strongPeople =
    people.filter(
      personHasStrongRoute,
    ).length;

  const coolingPeople =
    people.filter(
      personIsCooling,
    ).length;

  const selectFocus = (
    next: NetworkFocus,
  ) => {
    if (focus === next) {
      setFocus('all');
      return;
    }

    setFocus(next);
    setSearch('');

    if (
      next === 'warm' ||
      next === 'attention'
    ) {
      setView('clubs');
      return;
    }

    if (
      next === 'strong' ||
      next === 'cooling'
    ) {
      setView('people');
    }
  };

  const openClubFromPerson = (clubName: string) => {
    setSelectedContact(null);
    setView('clubs');
    setSearch(clubName);
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>NETWORK</p>
          <h2>Know the person. Know the club. Know the next move.</h2>
          <p>
            ReDream keeps the relationship context underneath so the agency
            can see who matters, what is happening and the best route forward.
          </p>
        </div>

        <div className={styles.heroSummary}>
          <div>
            <strong>
              {clubSummary?.relevant_clubs ?? clubs.length}
            </strong>
            <span>clubs</span>
          </div>
          <div>
            <strong>
              {peopleSummary?.club_contacts ?? people.length}
            </strong>
            <span>people</span>
          </div>
          <div>
            <strong>{followUps}</strong>
            <span>follow-ups</span>
          </div>
        </div>
      </section>

      <section
        className={styles.intelligence}
        aria-label="Network focus"
      >
        <div className={styles.intelligenceHead}>
          <div>
            <p className={styles.eyebrow}>
              WHERE TO FOCUS
            </p>
            <strong>
              Use recorded relationship evidence to decide the next move.
            </strong>
          </div>

          {focus !== 'all' ? (
            <button
              type="button"
              className={styles.clearFocus}
              onClick={() => setFocus('all')}
            >
              Show all network
            </button>
          ) : null}
        </div>

        <div className={styles.intelligenceGrid}>
          <button
            type="button"
            className={
              focus === 'attention'
                ? styles.intelligenceActive
                : styles.intelligenceCard
            }
            onClick={() =>
              selectFocus('attention')
            }
          >
            <CircleAlert size={17} />
            <span>NEEDS ATTENTION</span>
            <strong>{attentionClubs}</strong>
            <small>
              Live clubs with a due deal action or weak recorded access.
            </small>
          </button>

          <button
            type="button"
            className={
              focus === 'warm'
                ? styles.intelligenceActive
                : styles.intelligenceCard
            }
            onClick={() =>
              selectFocus('warm')
            }
          >
            <GitBranch size={17} />
            <span>WARM ROUTES</span>
            <strong>{warmRouteClubs}</strong>
            <small>
              Clubs where a recorded introduction route is stronger than direct access.
            </small>
          </button>

          <button
            type="button"
            className={
              focus === 'strong'
                ? styles.intelligenceActive
                : styles.intelligenceCard
            }
            onClick={() =>
              selectFocus('strong')
            }
          >
            <Route size={17} />
            <span>STRONG ROUTES</span>
            <strong>{strongPeople}</strong>
            <small>
              People with a strong recorded direct agency route.
            </small>
          </button>

          <button
            type="button"
            className={
              focus === 'cooling'
                ? styles.intelligenceActive
                : styles.intelligenceCard
            }
            onClick={() =>
              selectFocus('cooling')
            }
          >
            <TimerReset size={17} />
            <span>GOING QUIET</span>
            <strong>{coolingPeople}</strong>
            <small>
              Recorded relationships with no captured activity for more than 45 days.
            </small>
          </button>
        </div>

        <p className={styles.intelligenceTruth}>
          These signals use recorded activity, follow-up, direct relationship evidence and current club work. They are not predictions of influence, response or deal success.
        </p>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={view === 'clubs' ? styles.tabActive : styles.tab}
            onClick={() => {
              setView('clubs');
              setFocus('all');
            }}
          >
            <BriefcaseBusiness size={15} />
            Clubs
            <span>{clubs.length}</span>
          </button>

          <button
            type="button"
            className={view === 'people' ? styles.tabActive : styles.tab}
            onClick={() => {
              setView('people');
              setFocus('all');
            }}
          >
            <Users size={15} />
            People
            <span>{people.length}</span>
          </button>
        </div>

        <label className={styles.search}>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              view === 'clubs'
                ? 'Search club, country or league'
                : 'Search person, club, role or country'
            }
            aria-label="Search Network"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')}>
              Clear
            </button>
          ) : null}
        </label>
      </section>

      <section className={styles.signalBar}>
        <div>
          <span>Recorded routes</span>
          <strong>{strongestRoutes}</strong>
        </div>
        <div>
          <span>Open follow-ups</span>
          <strong>{followUps}</strong>
        </div>
        <div>
          <span>Network principle</span>
          <strong>One relationship, one next move</strong>
        </div>
      </section>

      {view === 'clubs' ? (
        <section className={styles.grid}>
          {filteredClubs.map((club: any) => {
            const clubName = club?.name || 'Club';
            const access = club?.access || {};
            const demand = club?.demand || {};
            const commercial = club?.commercial || {};
            const topPlay = club?.top_play || {};

            const clubPeople =
              peopleByClub.get(
                String(club?.organisation_id || ''),
              ) || [];

            const keyPeople = clubPeople.slice(0, 3);

            const useWarmRoute =
              number(access?.introduction_score) >
              number(access?.direct_score);

            const routeName = useWarmRoute
              ? access?.introduction_via || 'Warm introduction'
              : access?.best_direct_contact || 'No recorded contact';

            const routeDetail = useWarmRoute
              ? access?.introduction_target
                ? `Introduction to ${access.introduction_target}`
                : 'Warm route recorded'
              : access?.best_direct_role ||
                human(access?.direct_state || 'route not recorded');

            const directPerson =
              clubPeople.find(
                (item: any) =>
                  item?.person?.full_name ===
                  access?.best_direct_contact,
              );

            const routeOwner =
              directPerson?.relationship
                ?.owner_name;

            const routeDisplay =
              !useWarmRoute && routeOwner
                ? `${routeOwner} → ${routeName}`
                : routeName;

            const clubSignal =
              clubNeedsAttention(club)
                ? 'Needs attention'
                : clubHasWarmRoute(club)
                  ? 'Warm route available'
                  : clubHasStrongRoute(club)
                    ? 'Strong route'
                    : clubIsCooling(club)
                      ? 'Going quiet'
                      : human(
                          club?.account_state ||
                            'relationship recorded',
                        );

            const playType = String(topPlay?.play_type || '');
            const playLabel = String(
              topPlay?.recommended_action || '',
            ).trim();

            const primaryActionLabel = String(
              topPlay?.access_route_mode || '',
            ).includes('warm')
              ? 'Prepare introduction'
              : ['protect_live_deal', 'remove_deal_blocker'].includes(
                    playType,
                  )
                ? 'Protect opportunity'
                : playType === 'source_for_confirmed_need'
                  ? 'Work club need'
                  : playType === 'pitch_now'
                    ? 'Review pitch route'
                    : 'Prepare next move';

            return (
              <article
                className={styles.clubCard}
                key={club?.organisation_id || clubName}
              >
                <div className={styles.entityTop}>
                  <div className={styles.clubMark}>
                    {initials(clubName) || 'C'}
                  </div>

                  <div className={styles.identity}>
                    <p className={styles.eyebrow}>
                      {clubSignal}
                    </p>
                    <h3>{clubName}</h3>
                    <p>
                      {[club?.city, club?.country, club?.league_name]
                        .filter(Boolean)
                        .join(' · ') || 'Club context recorded'}
                    </p>
                  </div>
                </div>

                <div className={styles.primaryFact}>
                  <span>BEST ROUTE</span>
                  <strong>{routeDisplay}</strong>
                  <small>{routeDetail}</small>
                </div>

                <div className={styles.clubContext}>
                  <div>
                    <span>WHAT THEY NEED</span>
                    <strong>
                      {number(demand?.active_needs)} active need
                      {number(demand?.active_needs) === 1 ? '' : 's'}
                    </strong>
                    <small>
                      {number(demand?.confirmed_needs)} confirmed
                    </small>
                  </div>

                  <div>
                    <span>LIVE OPPORTUNITIES</span>
                    <strong>
                      {number(commercial?.active_deals)} active
                    </strong>
                    <small>
                      {number(commercial?.deals_needing_action)} need action
                    </small>
                  </div>
                </div>

                <div className={styles.peopleBlock}>
                  <div className={styles.sectionLabel}>
                    <span>PEOPLE WE KNOW</span>
                    {clubPeople.length > keyPeople.length ? (
                      <small>
                        +{clubPeople.length - keyPeople.length} more
                      </small>
                    ) : null}
                  </div>

                  {keyPeople.length ? (
                    <div className={styles.peopleList}>
                      {keyPeople.map((item: any) => {
                        const person = item?.person || {};
                        const employment = item?.employment || {};

                        return (
                          <button
                            type="button"
                            className={styles.personRow}
                            key={item?.person_id}
                            onClick={() => setSelectedContact(item)}
                          >
                            <span className={styles.personAvatar}>
                              {initials(
                                person?.full_name || 'Person',
                              ) || 'P'}
                            </span>

                            <span className={styles.personIdentity}>
                              <strong>
                                {person?.full_name || 'Club contact'}
                              </strong>
                              <small>
                                {employment?.role_title || 'Club contact'}
                              </small>
                            </span>

                            <ArrowRight size={14} />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.muted}>
                      No person is linked to this club yet.
                    </p>
                  )}
                </div>

                {playLabel ? (
                  <div className={styles.nextMove}>
                    <span>NEXT MOVE</span>
                    <strong>{playLabel}</strong>
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() =>
                      onOpenClubAccount({
                        key: `club-account:${club?.organisation_id}`,
                        organisationId: String(club?.organisation_id || ''),
                        title: clubName,
                        context:
                          [club?.city, club?.country, club?.league_name]
                            .filter(Boolean)
                            .join(' · ') || null,
                      })
                    }
                  >
                    <BriefcaseBusiness size={14} />
                    Open club
                  </button>

                  {topPlay?.play_id ? (
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={() =>
                        onOpenAction({
                          key: `relationship-play:${topPlay.play_id}`,
                          eyebrow: 'NEXT MOVE',
                          title: topPlay?.title || clubName,
                          instruction:
                            playLabel ||
                            'Prepare the strongest recorded relationship route.',
                          label: primaryActionLabel,
                          action: 'play_prepare',
                          payload: {
                            play_id: topPlay.play_id,
                          },
                          context: clubName,
                          facts: [
                            {
                              label: 'Club',
                              value: clubName,
                              detail:
                                [club?.city, club?.country, club?.league_name]
                                  .filter(Boolean)
                                  .join(' · ') || null,
                            },
                            {
                              label: 'Best route',
                              value: routeName,
                              detail: routeDetail,
                            },
                            {
                              label: 'Club needs',
                              value: `${number(demand?.active_needs)} active`,
                              detail: `${number(demand?.confirmed_needs)} confirmed`,
                            },
                          ],
                          successCondition:
                            'The next relationship action is prepared from recorded agency information. Nothing is sent externally without a person confirming it.',
                          confirmationLabel: primaryActionLabel,
                          fallbackHref:
                            playType === 'pitch_now' ||
                            playType === 'source_for_confirmed_need' ||
                            ['protect_live_deal', 'remove_deal_blocker'].includes(
                              playType,
                            )
                              ? '?view=opportunities'
                              : '?view=network',
                          fallbackLabel:
                            playType === 'pitch_now' ||
                            playType === 'source_for_confirmed_need' ||
                            ['protect_live_deal', 'remove_deal_blocker'].includes(
                              playType,
                            )
                              ? 'Open Opportunities'
                              : 'Return to Network',
                        })
                      }
                    >
                      {primaryActionLabel}
                      <ArrowRight size={14} />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!filteredClubs.length ? (
            <Empty
              title={
                search
                  ? 'No clubs match this search'
                  : 'No club relationships yet'
              }
              copy={
                search
                  ? 'Try another club, country or league.'
                  : 'Clubs appear here as people, opportunities and agency work are connected.'
              }
            />
          ) : null}
        </section>
      ) : (
        <section className={styles.grid}>
          {filteredPeople.map((item: any) => {
            const person = item?.person || {};
            const employment = item?.employment || {};
            const relationship = item?.relationship || {};
            const activity = item?.activity || {};
            const clubContext = item?.club_context || {};
            const work = item?.work || {};

            const fullName =
              person?.full_name || person?.preferred_name || 'Club contact';

            const clubName =
              employment?.organisation_name || 'Club not recorded';

            const lastInteraction = activity?.last_interaction_at
              ? relativeDate(activity.last_interaction_at)
              : 'Not recorded';

            const nextFollowUp = work?.next_task_due
              ? relativeDate(work.next_task_due)
              : number(work?.open_tasks)
                ? `${number(work?.open_tasks)} open`
                : 'Nothing due';

            const personSignal =
              personNeedsAttention(item)
                ? 'Needs attention'
                : personIsCooling(item)
                  ? 'Going quiet'
                  : personHasStrongRoute(item)
                    ? 'Strong route'
                    : human(
                        item?.operating_state ||
                          'relationship recorded',
                      );

            return (
              <article
                className={styles.personCard}
                key={item?.person_id || fullName}
              >
                <div className={styles.entityTop}>
                  <div className={styles.personMark}>
                    {initials(fullName) || 'P'}
                  </div>

                  <div className={styles.identity}>
                    <p className={styles.eyebrow}>
                      {personSignal}
                    </p>
                    <h3>{fullName}</h3>
                    <p>
                      {[employment?.role_title, clubName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <div className={styles.primaryFact}>
                  <span>OUR ROUTE</span>
                  <strong>
                    {relationship?.owner_name || 'No owner recorded'}
                  </strong>
                  <small>
                    {human(
                      relationship?.route_state || 'route not recorded',
                    )}
                  </small>
                </div>

                <div className={styles.personFacts}>
                  <div>
                    <Clock3 size={15} />
                    <span>
                      <small>LAST MEANINGFUL CONTACT</small>
                      <strong>{lastInteraction}</strong>
                    </span>
                  </div>

                  <div>
                    <BriefcaseBusiness size={15} />
                    <span>
                      <small>CLUB CONTEXT</small>
                      <strong>
                        {number(clubContext?.active_deals)} live opportunity
                        {number(clubContext?.active_deals) === 1 ? '' : 'ies'}
                      </strong>
                    </span>
                  </div>

                  <div>
                    <ArrowRight size={15} />
                    <span>
                      <small>NEXT FOLLOW-UP</small>
                      <strong>{nextFollowUp}</strong>
                    </span>
                  </div>
                </div>

                {number(clubContext?.confirmed_needs) > 0 ? (
                  <div className={styles.nextMove}>
                    <span>CURRENT SIGNAL</span>
                    <strong>
                      {number(clubContext?.confirmed_needs)} confirmed club need
                      {number(clubContext?.confirmed_needs) === 1 ? '' : 's'}
                    </strong>
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => setSelectedContact(item)}
                  >
                    Open person
                    <ArrowRight size={14} />
                  </button>

                  {employment?.organisation_name ? (
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => openClubFromPerson(clubName)}
                    >
                      Open club
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!filteredPeople.length ? (
            <Empty
              title={
                search
                  ? 'No people match this search'
                  : 'No people recorded yet'
              }
              copy={
                search
                  ? 'Search by person, club, role, country or city.'
                  : 'Decision-makers and relationship routes appear here as they are captured.'
              }
            />
          ) : null}
        </section>
      )}

      {selectedContact ? (
        <AgencyContactIntelligenceDrawer
          contact={selectedContact}
          rpc={rpc}
          onClose={() => setSelectedContact(null)}
          onRefresh={onRefresh}
          onOpenClub={(clubName) => openClubFromPerson(clubName)}
        />
      ) : null}
    </div>
  );
}
