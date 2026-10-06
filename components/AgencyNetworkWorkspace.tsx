'use client';

import {
  ArrowRight,
  ChevronRight,
  BriefcaseBusiness,
  CircleAlert,
  Clock3,
  GitBranch,
  Network,
  Plus,
  Route,
  Search,
  TimerReset,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';


import EntityActionsMenu from '@/components/EntityActionsMenu';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyClubAccountRequest } from '@/components/AgencyClubAccountDrawer';
import { relativeDate } from '@/lib/platform-client';

import {useWorkspaceListMemory,rememberListPosition,useRestoreListPosition} from '@/components/useWorkspaceListMemory';
import styles from './AgencyNetworkWorkspace.module.css';

const AgencyContactIntelligenceDrawer = dynamic(
  () => import('@/components/AgencyContactIntelligenceDrawer'),
);

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
  stateScope = '',
  canManageRecords = true,
  canCreateRecords = true,
  data,
  basePath,
  rpc,
  onRefresh,
  onCreate,
  onOpenAction,
  onOpenClubAccount,
}: {
  stateScope?: string;
  canManageRecords?: boolean;
  canCreateRecords?: boolean;
  data: any;
  basePath: string;
  rpc: Rpc;
  onRefresh: () => Promise<void>;
  onCreate: (kind: 'club' | 'contact') => void;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenClubAccount: (request: AgencyClubAccountRequest) => void;
}) {
  const restricted = !canManageRecords || Boolean(data?.access?.restricted);
  const memory=useWorkspaceListMemory(stateScope,'network',{view:'clubs',focus:'all',search:''});
  const view=(memory.state.view==='people'?'people':'clubs') as NetworkView;
  const focus=(!restricted && ['all','attention','warm','strong','cooling'].includes(memory.state.focus)?memory.state.focus:'all') as NetworkFocus;
  const search=memory.state.search;
  const setView=(value:NetworkView)=>memory.update({view:value});
  const setFocus=(value:NetworkFocus)=>memory.update({focus:value});
  const setSearch=(value:string)=>memory.update({search:value});
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [archiveItems, setArchiveItems] = useState<any[]>([]);
  const searchParams = useSearchParams();

  const reloadArchives = useCallback(async () => {
    if (restricted) { setArchiveItems([]); return; }
    const result = await rpc<any>('redream_entity_archives');
    setArchiveItems(Array.isArray(result?.items) ? result.items : []);
  }, [rpc,restricted]);

  const refreshEntities = useCallback(async () => {
    await Promise.all([onRefresh(), reloadArchives()]);
  }, [onRefresh, reloadArchives]);

  useEffect(() => {
    void reloadArchives().catch(() => undefined);
  }, [reloadArchives]);

  const archived = useMemo(
    () => new Set(archiveItems.map((item: any) => `${String(item?.entity_type || '')}:${String(item?.entity_id || '')}`)),
    [archiveItems],
  );
  const requestedPersonId = String(searchParams.get('person') || '').trim();
  const requestedClubId = String(searchParams.get('club') || '').trim();

  const accounts = useMemo(() => data?.accounts || {}, [data?.accounts]);
  const clubs = useMemo(
    () => list(accounts?.clubs).filter((club: any) =>
      !archived.has(`club:${String(club?.organisation_id || '')}`),
    ),
    [accounts?.clubs, archived],
  );
  const clubSummary = accounts?.summary || {};

  const contactData = useMemo(() => data?.contacts || {}, [data?.contacts]);
  const people = useMemo(
    () => list(contactData?.items).filter((item: any) =>
      !archived.has(`club_contact:${String(item?.person_id || item?.id || '')}`),
    ),
    [archived, contactData?.items],
  );
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

  const personId = (item: any) => String(item?.person_id || item?.id || '').trim();

  const clubRequestFor = useCallback(
    (club: any): AgencyClubAccountRequest => ({
      key: `club-account:${club?.organisation_id}`,
      organisationId: String(club?.organisation_id || ''),
      title: club?.name || 'Club',
      context:
        [club?.city, club?.country, club?.league_name]
          .filter(Boolean)
          .join(' · ') || null,
    }),
    [],
  );

  useEffect(() => {
    if (!requestedPersonId) {
      setSelectedContact(null);
      return;
    }
    const match = people.find((item: any) => personId(item) === requestedPersonId);
    setSelectedContact(match || {person_id: requestedPersonId});
  }, [people, requestedPersonId]);

  useEffect(() => {
    if (!requestedClubId || requestedPersonId) return;
    const match = clubs.find(
      (club: any) =>
        String(club?.organisation_id || '') === requestedClubId,
    );
    if (match) onOpenClubAccount(clubRequestFor(match));
    else onOpenClubAccount(clubRequestFor({organisation_id: requestedClubId}));
  }, [clubRequestFor, clubs, onOpenClubAccount, requestedClubId, requestedPersonId]);

  useRestoreListPosition(stateScope,'network',memory.ready&&!requestedPersonId&&!requestedClubId);

  const openPerson = (item: any) => {
    rememberListPosition(stateScope,'network');
    const id = personId(item);
    if (!id) return;
    setSelectedContact(item);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'network');
    params.set('person', id);
    params.delete('club');
    window.history.pushState(null, '', `${basePath}?${params.toString()}`);
  };

  const closePerson = () => {
    setSelectedContact(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'network');
    params.delete('person');
    window.history.pushState(null, '', `${basePath}?${params.toString()}`);
  };

  const openClub = (club: any) => {
    rememberListPosition(stateScope,'network');
    const id = String(club?.organisation_id || '').trim();
    if (!id) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'network');
    params.set('club', id);
    params.delete('person');
    window.history.pushState(
      null,
      '',
      `${basePath}?${params.toString()}`,
    );
    onOpenClubAccount(clubRequestFor(club));
  };

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
    closePerson();
    setView('clubs');
    setSearch(clubName);
  };

  if (selectedContact && personId(selectedContact) === requestedPersonId) {
    return (
      <AgencyContactIntelligenceDrawer
        key={requestedPersonId}
        contact={selectedContact}
        rpc={rpc}
        presentation="page"
        onClose={closePerson}
        onRefresh={onRefresh}
        onOpenClub={(clubName) => openClubFromPerson(clubName)}
      />
    );
  }

  return (
    <div className={styles.workspace}>
      {restricted ? <p className={styles.scopeNotice}>Shared clubs and contacts. Your contact pages show your own activity. Agency-wide commercial details are only shown to admins.</p> : null}
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>NETWORK</p>
          <h2>{restricted ? 'Your shared clubs and contacts' : 'Know the person. Know the club. Know the next move.'}</h2>
          <p>
            {restricted ? 'Browse club and contact details. Your contact pages show your own conversations and follow-ups. Agency-wide commercial details are only shown to admins.' : 'ReDream keeps the relationship context underneath so the agency can see who matters, what is happening and the best route forward.'}
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
          {!restricted ? <div><strong>{followUps}</strong><span>follow-ups</span></div> : null}
        </div>
      </section>

{!restricted ? <>
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
              Use what you know about the relationship to decide the next move.
            </strong>
          </div>

          {focus !== 'all' ? (
            <button
              type="button"
              data-ui-button="tertiary"
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
              Live clubs with a due deal action or a weak contact route.
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
              Clubs where a warm introduction is stronger than going direct.
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
              People where your agency already has a strong direct relationship.
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
              Relationships with no activity for more than 45 days.
            </small>
          </button>
        </div>

        <p className={styles.intelligenceTruth}>
          These signals use your activity, follow-ups, relationships and current club work. They are not predictions of influence, response or deal success.
        </p>
      </section>


</> : null}
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

        <div className={styles.toolbarTools}>
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
              <button data-ui-button="tertiary" type="button" onClick={() => setSearch('')}>
                Clear
              </button>
            ) : null}
          </label>

          {!requestedClubId && canCreateRecords ? (
            <button
              type="button"
              data-ui-button="secondary"
              className={styles.addEntityButton}
              onClick={() => onCreate(view === 'clubs' ? 'club' : 'contact')}
            >
              <Plus size={14} />
              {view === 'clubs' ? 'Add club' : 'Add contact'}
            </button>
          ) : null}
        </div>
      </section>

{!restricted ? <>
      <section className={styles.signalBar}>
        <div>
          <span>Known contact routes</span>
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


</> : null}
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
              : access?.best_direct_contact || 'No contact yet';

            const routeDetail = useWarmRoute
              ? access?.introduction_target
                ? `Introduction to ${access.introduction_target}`
                : 'Warm introduction available'
              : access?.best_direct_role ||
                human(access?.direct_state || 'route not set');

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

            const clubSignal = restricted ? 'Club identity' :
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
                            'relationship',
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
                        .join(' · ') || 'Club details'}
                    </p>
                  </div>
                  {!restricted ? <EntityActionsMenu
                    kind="club"
                    entityId={String(club?.organisation_id || '')}
                    label={clubName}
                    rpc={rpc}
                    onChanged={refreshEntities}
                    fields={[
                      { key: 'name', label: 'Club name', value: clubName },
                      { key: 'country', label: 'Country', value: club?.country },
                      { key: 'city', label: 'City', value: club?.city },
                      { key: 'website_url', label: 'Website', value: club?.website_url, type: 'url' },
                    ]}
                  /> : null}
                </div>

{!restricted ? <>
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


</> : null}
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
                            onClick={() => openPerson(item)}
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

                            <ChevronRight size={16} />
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

                <div
                  className={
                    topPlay?.play_id
                      ? styles.actions
                      : `${styles.actions} ${styles.actionsSolo}`
                  }
                >
                  <button
                    type="button"
                    data-ui-button="secondary"
              className={styles.secondaryAction}
                    onClick={() => openClub(club)}
                    aria-label={`Open ${clubName}`}
                    title="Open club"
                  >
                    <BriefcaseBusiness size={14} />
                    Open club
                  </button>

                  {topPlay?.play_id ? (
                    <button
                      type="button"
                      data-ui-button="primary"
              className={styles.primaryAction}
                      onClick={() =>
                        onOpenAction({
                          key: `relationship-play:${topPlay.play_id}`,
                          eyebrow: 'NEXT MOVE',
                          title: topPlay?.title || clubName,
                          instruction:
                            playLabel ||
                            'Prepare the strongest relationship route.',
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
                            'The next relationship action is based on the information your agency has. Nothing is sent externally without a person confirming it.',
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
                      <ChevronRight size={16} />
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
              employment?.organisation_name || 'Club not set';

            const lastInteraction = activity?.last_interaction_at
              ? relativeDate(activity.last_interaction_at)
              : 'Not set';

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
                          'relationship',
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
                      {restricted ? 'Contact identity' : personSignal}
                    </p>
                    <h3>{fullName}</h3>
                    <p>
                      {[employment?.role_title, clubName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {!restricted ? <EntityActionsMenu
                    kind="club_contact"
                    entityId={personId(item)}
                    label={fullName}
                    rpc={rpc}
                    onChanged={refreshEntities}
                    fields={[
                      { key: 'full_name', label: 'Full name', value: person?.full_name },
                      { key: 'preferred_name', label: 'Preferred name', value: person?.preferred_name },
                      { key: 'role_title', label: 'Role', value: employment?.role_title },
                      { key: 'country', label: 'Country', value: person?.country },
                      { key: 'city', label: 'City', value: person?.city },
                    ]}
                  /> : null}
                </div>

{!restricted ? <>
                <div className={styles.relationshipSummary}>
                  <div>
                    <span>RELATIONSHIP OWNER</span>
                    <strong>{relationship?.owner_name || 'Unassigned'}</strong>
                  </div>
                  <small className={styles.relationshipState}>
                    {human(relationship?.route_state || 'route not set')}
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


</> : null}
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
                    data-ui-button="primary"
              className={styles.primaryAction}
                    onClick={() => openPerson(item)}
                  >
                    Open person
                    <ChevronRight size={16} />
                  </button>

                  {employment?.organisation_name ? (
                    <button
                      type="button"
                      data-ui-button="tertiary"
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
                  : 'No people yet'
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

    </div>
  );
}
