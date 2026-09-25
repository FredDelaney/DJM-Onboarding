'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BriefcaseBusiness,
  ContactRound,
  Search,
  Target,
  UserRound,
  X,
} from 'lucide-react';

import {
  useTenantRuntime,
} from '@/components/TenantRuntimeProvider';
import {
  friendlyError,
  platformInvoke,
} from '@/lib/platform-client';

type SearchItem = {
  key: string;
  kind: 'player' | 'club' | 'need' | 'deal';
  title: string;
  subtitle: string;
  detail?: string;
  href: string;
};

export default function WorkspaceSearch() {
  const runtime = useTenantRuntime();

  const tenantId =
    runtime.tenant_id || '';

  const [open, setOpen] =
    useState(false);

  const [query, setQuery] =
    useState('');

  const [index, setIndex] =
    useState<SearchItem[]>([]);

  const [loadedTenant, setLoadedTenant] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  useEffect(() => {
    const onKey = (
      event: KeyboardEvent,
    ) => {
      if (
        (event.metaKey ||
          event.ctrlKey) &&
        event.key.toLowerCase() ===
          'k'
      ) {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      onKey,
    );

    return () =>
      window.removeEventListener(
        'keydown',
        onKey,
      );
  }, []);

  useEffect(() => {
    if (
      !open ||
      !tenantId ||
      loadedTenant === tenantId
    ) {
      return;
    }

    let active = true;

    setLoading(true);
    setError('');

    void Promise.all([
      platformInvoke<any>(
        'agency-os',
        {
          action: 'roster_command',
          tenant_id: tenantId,
          limit: 100,
        },
      ),
      platformInvoke<any>(
        'agency-os',
        {
          action: 'club_accounts',
          tenant_id: tenantId,
          limit: 100,
        },
      ),
      platformInvoke<any>(
        'agency-os',
        {
          action:
            'demand_control_fast',
          tenant_id: tenantId,
          limit: 100,
        },
      ),
      platformInvoke<any>(
        'agency-os',
        {
          action: 'deal_portfolio',
          tenant_id: tenantId,
          limit: 50,
        },
      ),
    ])
      .then(
        ([
          rosterResult,
          clubResult,
          demandResult,
          dealResult,
        ]) => {
          if (!active) return;

          const next: SearchItem[] =
            [];

          for (const item of
            rosterResult?.roster
              ?.items || []) {
            const player =
              item?.player || {};

            next.push({
              key: `player:${item.player_id}`,
              kind: 'player',
              title:
                player.name ||
                'Player',
              subtitle: [
                player.current_club,
                player.primary_position,
              ]
                .filter(Boolean)
                .join(' · '),
              detail:
                item.primary_focus
                  ? String(
                      item.primary_focus,
                    ).replaceAll(
                      '_',
                      ' ',
                    )
                  : '',
              href:
                '/agency?view=players',
            });
          }

          for (const club of
            clubResult?.clubs?.clubs ||
            []) {
            next.push({
              key: `club:${club.organisation_id}`,
              kind: 'club',
              title:
                club.name || 'Club',
              subtitle: [
                club.country,
                club.league_name,
              ]
                .filter(Boolean)
                .join(' · '),
              detail:
                club.access
                  ?.best_direct_contact
                  ? `Best recorded contact: ${club.access.best_direct_contact}`
                  : '',
              href:
                '/agency?view=relationships',
            });
          }

          for (const item of
            demandResult?.coverage
              ?.items || []) {
            next.push({
              key: `need:${item.club_need_id}`,
              kind: 'need',
              title:
                item.need?.title ||
                item.need?.position ||
                'Club need',
              subtitle: [
                item.club?.name,
                item.need?.position,
              ]
                .filter(Boolean)
                .join(' · '),
              detail:
                item.coverage_state
                  ? String(
                      item.coverage_state,
                    ).replaceAll(
                      '_',
                      ' ',
                    )
                  : '',
              href:
                '/agency?view=market',
            });
          }

          for (const deal of
            dealResult?.deals?.deals ||
            []) {
            next.push({
              key: `deal:${deal.deal_room_id}`,
              kind: 'deal',
              title:
                deal.title ||
                'Live deal',
              subtitle: [
                deal.organisation,
                deal.stage,
              ]
                .filter(Boolean)
                .join(' · '),
              detail:
                deal.next_best_move
                  ?.instruction ||
                deal.primary_blocker ||
                '',
              href:
                '/agency?view=deals',
            });
          }

          setIndex(next);
          setLoadedTenant(
            tenantId,
          );
        },
      )
      .catch((loadError) => {
        if (!active) return;

        setError(
          friendlyError(loadError),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    open,
    tenantId,
    loadedTenant,
    index.length,
  ]);

  const results = useMemo(() => {
    const value = query
      .trim()
      .toLowerCase();

    if (!value) {
      return index.slice(0, 10);
    }

    return index
      .filter((item) =>
        [
          item.title,
          item.subtitle,
          item.detail,
          item.kind,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(value),
      )
      .slice(0, 20);
  }, [index, query]);

  const iconFor = (
    kind: SearchItem['kind'],
  ) => {
    if (kind === 'player') {
      return <UserRound size={16} />;
    }

    if (kind === 'club') {
      return (
        <ContactRound size={16} />
      );
    }

    if (kind === 'deal') {
      return (
        <BriefcaseBusiness
          size={16}
        />
      );
    }

    return <Target size={16} />;
  };

  return (
    <>
      <button
        type="button"
        className="djm-os-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search ReDream"
      >
        <Search size={16} />
        <span>Search ReDream</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div
          className="djm-os-search-overlay"
          onMouseDown={() =>
            setOpen(false)
          }
        >
          <div
            className="djm-os-search-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="djm-os-search-modal-head">
              <Search size={18} />

              <input
                autoFocus
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
                placeholder="Search this agency's players, clubs, needs and deals"
              />

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                aria-label="Close search"
              >
                <X size={17} />
              </button>
            </div>

            <div className="djm-os-search-results">
              {loading ? (
                <div
                  className="djm-os-empty"
                  style={{
                    minHeight: 110,
                  }}
                >
                  <p>
                    Loading this agency...
                  </p>
                </div>
              ) : null}

              {error ? (
                <div
                  className="djm-os-empty"
                  style={{
                    minHeight: 110,
                  }}
                >
                  <p>{error}</p>
                </div>
              ) : null}

              {!loading &&
              !error &&
              query.trim() &&
              results.length === 0 ? (
                <div
                  className="djm-os-empty"
                  style={{
                    minHeight: 110,
                  }}
                >
                  <p>
                    No results in this
                    agency workspace.
                  </p>
                </div>
              ) : null}

              {!loading &&
              !error &&
              !query.trim() &&
              results.length === 0 ? (
                <div
                  className="djm-os-empty"
                  style={{
                    minHeight: 110,
                  }}
                >
                  <p>
                    Nothing searchable has
                    been recorded in this
                    agency yet.
                  </p>
                </div>
              ) : null}

              {results.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() =>
                    setOpen(false)
                  }
                  className="djm-os-search-result"
                >
                  <span
                    className="djm-os-kicker"
                    style={{
                      display: 'flex',
                      alignItems:
                        'center',
                      gap: 6,
                    }}
                  >
                    {iconFor(
                      item.kind,
                    )}
                    {item.kind}
                  </span>

                  <strong>
                    {item.title}
                  </strong>

                  {item.subtitle ? (
                    <p>
                      {item.subtitle}
                    </p>
                  ) : null}

                  {item.detail ? (
                    <small>
                      {item.detail}
                    </small>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
