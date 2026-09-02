'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { compactDateTime, friendlyError } from '@/lib/djm-os';
import {
  aggregateFootballStats,
  distinctFootballValues,
  headlineSeasonRows,
  resolveHeadlineSeason,
} from '@/lib/football-season-stats';
import { supabase } from '@/lib/supabase';
import styles from './PlayerStatsPanel.module.css';

type CareerRow = {
  id: string;
  season_label: string | null;
  stats_year: number | null;
  club_name: string | null;
  league: string | null;
  country: string | null;
  appearances: number | null;
  starts: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  source_name: string | null;
  source_provider: string | null;
  source_url: string | null;
  source_reviewed_at: string | null;
  source_synced_at: string | null;
};

type PlayerRow = {
  current_season_label: string | null;
  current_club: string | null;
  current_league: string | null;
  current_country: string | null;
  primary_position: string | null;
};

type StatCard = {
  label: string;
  value: string;
  detail: string;
};

const numeric = (value: unknown) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integer = (value: unknown) => {
  const parsed = numeric(value);
  return parsed == null ? 0 : Math.max(0, Math.round(parsed));
};

const seasonSort = (left: string, right: string) =>
  right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' });

const validRows = (rows: CareerRow[]) =>
  rows.filter(
    (row) =>
      row.appearances != null ||
      row.starts != null ||
      row.minutes != null ||
      row.goals != null ||
      row.assists != null,
  );

function aggregate(rows: CareerRow[]) {
  const usable = validRows(rows);
  const sum = (key: 'appearances' | 'starts' | 'minutes' | 'goals' | 'assists') => {
    const known = usable.filter((row) => row[key] != null);
    if (!known.length) return null;
    return known.reduce((total, row) => total + integer(row[key]), 0);
  };

  return {
    appearances: sum('appearances'),
    starts: sum('starts'),
    minutes: sum('minutes'),
    goals: sum('goals'),
    assists: sum('assists'),
  };
}

function ratePer90(value: number | null, minutes: number | null) {
  if (value == null || minutes == null || minutes < 90) return 'Not enough minutes';
  return ((value * 90) / minutes).toFixed(2);
}

function formatInteger(value: number | null) {
  return value == null ? 'Not available' : Math.round(value).toLocaleString('en-GB');
}

export default function PlayerStatsPanel({
  playerId,
  compact = false,
}: {
  playerId: string;
  compact?: boolean;
}) {
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [rows, setRows] = useState<CareerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [playerResult, careerResult] = await Promise.all([
      supabase
        .from('players')
        .select(
          'current_season_label,current_club,current_league,current_country,primary_position',
        )
        .eq('id', playerId)
        .maybeSingle(),
      supabase
        .from('career_entries')
        .select(
          'id,season_label,stats_year,club_name,league,country,appearances,starts,minutes,goals,assists,source_name,source_provider,source_url,source_reviewed_at,source_synced_at',
        )
        .eq('player_id', playerId)
        .order('season_label', { ascending: false })
        .order('source_synced_at', { ascending: false, nullsFirst: false }),
    ]);

    if (playerResult.error) throw playerResult.error;
    if (careerResult.error) throw careerResult.error;

    setPlayer((playerResult.data || null) as PlayerRow | null);
    setRows((careerResult.data || []) as CareerRow[]);
  }, [playerId]);

  useEffect(() => {
    let active = true;
    void load().catch((loadError) => {
      if (active) setError(friendlyError(loadError));
    });
    return () => {
      active = false;
    };
  }, [load]);

  const currentSeason = useMemo(
    () => resolveHeadlineSeason(rows, player?.current_season_label),
    [player?.current_season_label, rows],
  );

  const currentRows = useMemo(
    () => headlineSeasonRows(rows, currentSeason),
    [currentSeason, rows],
  );

  const current = useMemo(() => aggregateFootballStats(currentRows), [currentRows]);

  const clubs = useMemo(
    () => distinctFootballValues(currentRows, 'club_name'),
    [currentRows],
  );
  const competitions = useMemo(
    () => distinctFootballValues(currentRows, 'league'),
    [currentRows],
  );
  const clubContext =
    clubs.length > 1
      ? clubs.join(' + ')
      : clubs[0] || player?.current_club || 'Not available';
  const competitionContext =
    competitions.length > 1
      ? 'All competitions'
      : competitions[0] || player?.current_league || 'Not available';

  const sourceNames = useMemo(
    () =>
      Array.from(
        new Set(
          currentRows
            .map((row) => row.source_name || row.source_provider)
            .filter(Boolean)
            .map(String),
        ),
      ),
    [currentRows],
  );

  const lastUpdated = useMemo(() => {
    const timestamps = rows
      .flatMap((row) => [row.source_synced_at, row.source_reviewed_at])
      .filter(Boolean)
      .map(String)
      .sort()
      .reverse();
    return timestamps[0] || null;
  }, [rows]);

  const cards = useMemo<StatCard[]>(() => {
    const contributions =
      current.goals == null && current.assists == null
        ? null
        : current.contributions;

    return [
      {
        label: 'Apps',
        value: formatInteger(current.appearances),
        detail: `${currentSeason || 'Current season'}${competitions.length > 1 ? ' · all competitions' : ''}`,
      },
      {
        label: 'Starts',
        value: formatInteger(current.starts),
        detail: 'Recorded starts',
      },
      {
        label: 'Minutes',
        value: formatInteger(current.minutes),
        detail: 'Recorded playing time',
      },
      {
        label: 'Goals',
        value: formatInteger(current.goals),
        detail: `Per 90: ${ratePer90(current.goals, current.minutes)}`,
      },
      {
        label: 'Assists',
        value: formatInteger(current.assists),
        detail: `Per 90: ${ratePer90(current.assists, current.minutes)}`,
      },
      {
        label: 'G+A',
        value: formatInteger(contributions),
        detail: 'Goal contributions',
      },
    ];
  }, [competitions.length, current, currentSeason]);

  const refreshStats = async () => {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const { data, error: refreshError } = await supabase.functions.invoke(
        'refresh-player-stats-free',
        {
          body: {
            player_id: playerId,
          },
        },
      );

      if (refreshError) throw refreshError;
      if (!data?.ok) throw new Error(data?.error || 'No free source returned usable stats.');

      await load();

      const refreshedSources = [
        data?.thesportsdb?.ok ? 'TheSportsDB' : null,
        data?.api_football?.ok ? 'API-Football' : null,
      ].filter(Boolean);

      setMessage(
        refreshedSources.length
          ? `Stats refreshed from ${refreshedSources.join(' + ')}.`
          : 'Existing free-source stats are already fresh.',
      );
    } catch (refreshFailure) {
      setError(friendlyError(refreshFailure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${styles.shell} ${compact ? styles.compact : ''}`}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>
            <BarChart3 size={14} />
            PLAYER STATS
          </div>
          <h2>Verified football data, without invented intelligence.</h2>
          <p>
            DJM is showing sourced player statistics only. Scoring, projections and player
            comparison are intentionally hidden until the underlying data is strong enough.
          </p>
        </div>

        <div className={styles.mode}>
          <ShieldCheck size={16} />
          <span>STATS ONLY</span>
        </div>
      </header>

      {error ? (
        <div className={styles.error}>
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      {message ? (
        <div className={styles.success}>
          <CheckCircle2 size={16} />
          {message}
        </div>
      ) : null}

      <div className={styles.context}>
        <div>
          <span>Season</span>
          <strong>{currentSeason || 'No sourced season yet'}</strong>
        </div>
        <div>
          <span>Club</span>
          <strong>{clubContext}</strong>
        </div>
        <div>
          <span>Competition</span>
          <strong>{competitionContext}</strong>
        </div>
        <div>
          <span>Position</span>
          <strong>{player?.primary_position || 'Not available'}</strong>
        </div>
      </div>

      <div className={styles.cards}>
        {cards.map((card) => (
          <article className={styles.card} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </div>

      <div className={styles.metaRow}>
        <div className={styles.sources}>
          <Database size={15} />
          <span>
            {sourceNames.length
              ? `Sources: ${sourceNames.join(', ')}`
              : 'No sourced current-season stats yet'}
          </span>
        </div>
        <div className={styles.synced}>
          <Clock3 size={15} />
          <span>{lastUpdated ? `Updated ${compactDateTime(lastUpdated)}` : 'Not synced yet'}</span>
        </div>
        <button
          className={styles.refresh}
          type="button"
          onClick={() => void refreshStats()}
          disabled={busy}
        >
          <RefreshCw size={16} className={busy ? styles.spin : ''} />
          {busy ? 'Checking free sources...' : 'Refresh free stats'}
        </button>
      </div>

      <details className={styles.history}>
        <summary>Season history</summary>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>Club</th>
                <th>Competition</th>
                <th>Apps</th>
                <th>Starts</th>
                <th>Minutes</th>
                <th>Goals</th>
                <th>Assists</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {validRows(rows).length ? (
                validRows(rows).map((row) => (
                  <tr key={row.id}>
                    <td>{row.season_label || '-'}</td>
                    <td>{row.club_name || '-'}</td>
                    <td>{row.league || '-'}</td>
                    <td>{row.appearances ?? '-'}</td>
                    <td>{row.starts ?? '-'}</td>
                    <td>{row.minutes ?? '-'}</td>
                    <td>{row.goals ?? '-'}</td>
                    <td>{row.assists ?? '-'}</td>
                    <td>{row.source_name || row.source_provider || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className={styles.empty}>
                    No sourced season statistics yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
