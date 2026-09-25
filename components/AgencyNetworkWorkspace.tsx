'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  Network,
  Search,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import AgencyContactIntelligenceDrawer from '@/components/AgencyContactIntelligenceDrawer';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyClubAccountRequest } from '@/components/AgencyClubAccountDrawer';
import { relativeDate } from '@/lib/platform-client';

import styles from './AgencyNetworkWorkspace.module.css';

type NetworkView = 'clubs' | 'people';

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
    if (!searchValue) return clubs;

    return clubs.filter((club: any) =>
      [
        club?.name,
        club?.city,
        club?.country,
        club?.league_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchValue),
    );
  }, [clubs, searchValue]);

  const filteredPeople = useMemo(() => {
    if (!searchValue) return people;

    return people.filter((item: any) => {
      const person = item?.person || {};
      const employment = item?.employment || {};

      return [
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
    });
  }, [people, searchValue]);

  const strongestRoutes = people.filter(
    (item: any) => number(item?.relationship?.route_score) > 0,
  ).length;

  const followUps = number(
    peopleSummary?.contacts_with_open_follow_up,
  );

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

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={view === 'clubs' ? styles.tabActive : styles.tab}
            onClick={() => setView('clubs')}
          >
            <BriefcaseBusiness size={15} />
            Clubs
            <span>{clubs.length}</span>
          </button>

          <button
            type="button"
            className={view === 'people' ? styles.tabActive : styles.tab}
            onClick={() => setView('people')}
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
                      {human(club?.account_state || 'relationship recorded')}
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
                  <strong>{routeName}</strong>
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
                      {human(item?.operating_state || 'relationship recorded')}
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
