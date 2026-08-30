'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  RefreshCw,
  Target,
  TrendingUp,
  UsersRound,
} from 'lucide-react';

import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';

type ComparisonTab = 'profile' | 'peers' | 'leagues' | 'development';

type MetricDefinition = {
  key: string;
  label: string;
  short: string;
  unit?: string;
  higherIsBetter?: boolean;
};

const METRICS: MetricDefinition[] = [
  { key: 'rating', label: 'Match rating', short: 'Rating' },
  { key: 'goals90', label: 'Goals per 90', short: 'Goals / 90' },
  { key: 'assists90', label: 'Assists per 90', short: 'Assists / 90' },
  { key: 'xg90', label: 'Expected goals per 90', short: 'xG / 90' },
  { key: 'xa90', label: 'Expected assists per 90', short: 'xA / 90' },
  { key: 'keyPasses90', label: 'Key passes per 90', short: 'Key passes' },
  { key: 'progressivePasses90', label: 'Progressive passes per 90', short: 'Prog. passes' },
  { key: 'progressiveCarries90', label: 'Progressive carries per 90', short: 'Prog. carries' },
  { key: 'passes90', label: 'Passes per 90', short: 'Passes' },
  { key: 'passAccuracy', label: 'Pass accuracy', short: 'Pass %', unit: '%' },
  { key: 'tackles90', label: 'Tackles per 90', short: 'Tackles' },
  { key: 'interceptions90', label: 'Interceptions per 90', short: 'Interceptions' },
  { key: 'aerialWinRate', label: 'Aerial duel win rate', short: 'Aerial win %', unit: '%' },
  { key: 'sprints90', label: 'Sprints per 90', short: 'Sprints' },
  { key: 'topSpeedMax', label: 'Top speed', short: 'Top speed' },
];

const PROFILE_METRICS = [
  ['overall_performance_percentile', 'Overall'],
  ['attacking_percentile', 'Attacking'],
  ['creativity_percentile', 'Creativity'],
  ['progression_percentile', 'Progression'],
  ['possession_percentile', 'Possession'],
  ['defending_percentile', 'Defending'],
  ['aerial_percentile', 'Aerial'],
  ['physical_percentile', 'Physical'],
  ['discipline_percentile', 'Discipline'],
  ['goalkeeping_percentile', 'Goalkeeping'],
] as const;

const numeric = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

const playerLabel = (player: any) =>
  player?.preferred_name ||
  [player?.first_name, player?.last_name].filter(Boolean).join(' ') ||
  'Player';

const formatMetric = (value: unknown, metric: MetricDefinition) => {
  const number = numeric(value);
  if (number == null) return '-';
  const rounded = Math.abs(number) >= 10 ? number.toFixed(1) : number.toFixed(2);
  return `${rounded}${metric.unit || ''}`;
};

export default function PlayerComparisonExplorer({ playerId }: { playerId: string }) {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<ComparisonTab>('profile');
  const [metric, setMetric] = useState('rating');
  const [team, setTeam] = useState('all');
  const [leagueCompare, setLeagueCompare] = useState('');
  const [leagueChoice, setLeagueChoice] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [leagueMetric, setLeagueMetric] = useState('rating');
  const [targetTeam, setTargetTeam] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(
    async (compareCompetitionId?: string | null) => {
      setError('');
      try {
        const result: any = await djmRpc('djm_player_comparison', {
          p_player_id: playerId,
          p_compare_competition_id: compareCompetitionId || null,
        });
        setData(result || null);
      } catch (loadError) {
        setError(friendlyError(loadError));
      }
    },
    [playerId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const player = data?.player || {};
  const score = data?.scorecard || {};
  const performance = data?.performance || null;
  const provider = data?.provider_snapshot || null;
  const peers = Array.isArray(data?.peers) ? data.peers : [];
  const targetPeers = Array.isArray(data?.target_peers) ? data.target_peers : [];
  const targetPeerContext = data?.target_peer_context || null;
  const cachedPeerLeagues = Array.isArray(data?.cached_peer_leagues)
    ? data.cached_peer_leagues
    : [];
  const benchmarks = Array.isArray(data?.benchmarks) ? data.benchmarks : [];
  const competitions = Array.isArray(data?.competitions) ? data.competitions : [];
  const currentProviderPlayerId = String(provider?.provider_player_id || '');
  const currentObservedMetrics =
    provider?.metrics?.current_window || provider?.metrics?.current_season || {};
  const currentObservedMinutes = numeric(currentObservedMetrics?.minutes);
  const targetRole =
    String(
      provider?.metrics?.current_window?.role ||
        provider?.metrics?.current_season?.role ||
        performance?.metadata?.provider_role ||
        '',
    ) || null;

  const currentBenchmark = useMemo(() => {
    const currentId = String(player?.current_competition_id || '');
    return benchmarks.find((row: any) => String(row.competition_id || '') === currentId) || null;
  }, [benchmarks, player?.current_competition_id]);

  const targetBenchmark = useMemo(
    () => benchmarks.find((row: any) => String(row.competition_id || '') === leagueCompare) || null,
    [benchmarks, leagueCompare],
  );
  const targetCompetition = useMemo(
    () => competitions.find((row: any) => String(row.competition_id || '') === leagueCompare) || null,
    [competitions, leagueCompare],
  );
  const selectedCatalogLeague = useMemo(
    () => leagueChoice.startsWith('pitch:')
      ? catalog.find((row: any) => `pitch:${row.id}` === leagueChoice) || null
      : null,
    [catalog, leagueChoice],
  );

  useEffect(() => {
    if (tab !== 'leagues' || catalog.length) return;
    let active = true;
    void djmInvoke<any>('refresh-player-peer-data', { mode: 'catalog' })
      .then((result) => {
        if (active) setCatalog(Array.isArray(result?.leagues) ? result.leagues : []);
      })
      .catch(() => {
        if (active) setCatalog([]);
      });
    return () => { active = false; };
  }, [tab, catalog.length]);

  const teams = useMemo(
    () =>
      [...new Set(peers.map((row: any) => String(row.team_name || '')).filter(Boolean))].sort(),
    [peers],
  );

  const visiblePeers = useMemo(
    () => peers.filter((row: any) => team === 'all' || String(row.team_name || '') === team),
    [peers, team],
  );

  const targetRolePeers = useMemo(
    () =>
      targetPeers.filter(
        (row: any) => !targetRole || String(row.provider_position || '') === targetRole,
      ),
    [targetPeers, targetRole],
  );

  const targetTeams = useMemo(
    () =>
      [...new Set(targetRolePeers.map((row: any) => String(row.team_name || '')).filter(Boolean))].sort(),
    [targetRolePeers],
  );

  const targetVisiblePeers = useMemo(
    () =>
      targetRolePeers.filter(
        (row: any) => targetTeam === 'all' || String(row.team_name || '') === targetTeam,
      ),
    [targetRolePeers, targetTeam],
  );

  const availableMetrics = useMemo(
    () =>
      METRICS.filter(
        (definition) =>
          visiblePeers.filter((row: any) => numeric(row?.metrics?.[definition.key]) != null).length >= 4,
      ),
    [visiblePeers],
  );

  useEffect(() => {
    if (availableMetrics.length && !availableMetrics.some((row) => row.key === metric)) {
      setMetric(availableMetrics[0].key);
    }
  }, [availableMetrics, metric]);

  const targetAvailableMetrics = useMemo(
    () =>
      METRICS.filter((definition) => {
        if (numeric(currentObservedMetrics?.[definition.key]) == null) return false;
        return (
          targetVisiblePeers.filter(
            (row: any) => numeric(row?.metrics?.[definition.key]) != null,
          ).length >= 6
        );
      }),
    [currentObservedMetrics, targetVisiblePeers],
  );

  useEffect(() => {
    if (
      targetAvailableMetrics.length &&
      !targetAvailableMetrics.some((row) => row.key === leagueMetric)
    ) {
      setLeagueMetric(targetAvailableMetrics[0].key);
    }
  }, [leagueMetric, targetAvailableMetrics]);

  const updateData = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await djmInvoke('refresh-player-data-universal', { player_id: playerId });
      try {
        await djmInvoke('refresh-player-peer-data', { player_id: playerId });
      } catch {
        // Player refresh can still be useful when the provider has no peer coverage.
      }
      await load(leagueCompare || null);
      setMessage('Player data and available comparison evidence updated.');
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusy(false);
    }
  };

  const selectLeague = async (choice: string) => {
    setLeagueChoice(choice);
    setTargetTeam('all');
    if (choice.startsWith('djm:')) {
      const competitionId = choice.slice(4);
      setLeagueCompare(competitionId);
      await load(competitionId || null);
    } else {
      setLeagueCompare('');
    }
  };

  const refreshTargetLeague = async () => {
    if (!leagueChoice && !leagueCompare) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let result: any;
      if (selectedCatalogLeague) {
        result = await djmInvoke('refresh-player-peer-data', {
          provider_competition_id: selectedCatalogLeague.id,
          competition_name: selectedCatalogLeague.name,
          country_code: selectedCatalogLeague.country_code,
        });
      } else if (leagueCompare) {
        result = await djmInvoke('refresh-player-peer-data', { competition_id: leagueCompare });
      } else {
        return;
      }
      const comparisonId = String(result?.competition_id || leagueCompare || '');
      if (comparisonId) {
        setLeagueCompare(comparisonId);
        setLeagueChoice(`djm:${comparisonId}`);
        await load(comparisonId);
      }
      setMessage(
        result?.peer_count
          ? `${result.peer_count} observed comparison players refreshed.`
          : 'Comparison league checked. No trustworthy peer sample was created.',
      );
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setBusy(false);
    }
  };

  const displayScore = numeric(score?.display_score);
  const potentialScore = numeric(score?.potential_score);
  const currentLeagueStrength = numeric(currentBenchmark?.strength_score);
  const targetLeagueStrength = numeric(targetBenchmark?.strength_score);
  const currentPeerCache = cachedPeerLeagues.find(
    (row: any) => String(row.competition_id || '') === String(player?.current_competition_id || ''),
  );
  const targetPeerCache = cachedPeerLeagues.find(
    (row: any) => String(row.competition_id || '') === leagueCompare,
  );
  const selectedMetric = METRICS.find((row) => row.key === metric) || METRICS[0];
  const selectedLeagueMetric =
    METRICS.find((row) => row.key === leagueMetric) || METRICS[0];
  const targetLeagueName =
    targetBenchmark?.league_name ||
    targetCompetition?.league_name ||
    targetPeerContext?.display_name ||
    selectedCatalogLeague?.name ||
    'Target league';
  const targetLeagueCountry =
    targetBenchmark?.country ||
    targetCompetition?.country ||
    targetPeerContext?.country ||
    selectedCatalogLeague?.country ||
    '';
  const targetPitchId =
    targetCompetition?.provider_ids?.pitchapi ||
    targetBenchmark?.provider_ids?.pitchapi ||
    targetPeerContext?.provider_competition_id ||
    selectedCatalogLeague?.id ||
    null;

  const crossLeagueMarkerId = '__djm_current_player__';
  const currentCrossLeaguePoint =
    currentProviderPlayerId && currentObservedMinutes != null
      ? {
          provider_player_id: crossLeagueMarkerId,
          provider_team_id: '__current_club__',
          player_name: playerLabel(player),
          team_name: player?.current_club || 'Current club',
          provider_position: targetRole,
          minutes: currentObservedMinutes,
          metrics: currentObservedMetrics,
        }
      : null;

  const crossLeaguePoints = currentCrossLeaguePoint
    ? [...targetVisiblePeers, currentCrossLeaguePoint]
    : targetVisiblePeers;

  return (
    <div className="ux-compare-shell">
      <div className="ux-compare-topbar">
        <div>
          <Link className="ux-back-link" href={`/admin/players/${playerId}`}>
            <ArrowLeft size={15} /> Player record
          </Link>
          <p className="ux-eyebrow">DJM FOOTBALL INTELLIGENCE</p>
          <h1>{playerLabel(player)} comparison room</h1>
          <p className="ux-subtitle">
            Current evidence, real provider peers, competition context and development potential kept separate so DJM can see what each signal actually means.
          </p>
        </div>
        <button className="ux-primary-action" type="button" onClick={() => void updateData()} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'spin' : ''} />
          {busy ? 'Updating...' : 'Update data'}
        </button>
      </div>

      {error ? <div className="ux-alert ux-alert-error">{error}</div> : null}
      {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

      <section className="ux-compare-hero">
        <div>
          <span>Current level</span>
          <strong>{displayScore ?? '-'}</strong>
          <small>{score?.score_tier || score?.score_status || 'Evidence pending'}</small>
        </div>
        <div>
          <span>Evidence confidence</span>
          <strong>{score?.confidence == null ? '-' : `${score.confidence}%`}</strong>
          <small>Not a probability of career success</small>
        </div>
        <div>
          <span>Current competition</span>
          <strong className="ux-hero-text">{player?.current_league || 'Unknown'}</strong>
          <small>{currentLeagueStrength == null ? 'Benchmark unavailable' : `League strength ${currentLeagueStrength}`}</small>
        </div>
        <div>
          <span>Potential</span>
          <strong>{potentialScore ?? '-'}</strong>
          <small>{potentialScore == null ? 'Not defensible yet' : 'DJM stored potential'}</small>
        </div>
      </section>

      <nav className="ux-compare-tabs" aria-label="Player comparison views">
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={<BarChart3 size={16} />} label="Position profile" />
        <TabButton active={tab === 'peers'} onClick={() => setTab('peers')} icon={<UsersRound size={16} />} label="League peers" />
        <TabButton active={tab === 'leagues'} onClick={() => setTab('leagues')} icon={<Target size={16} />} label="Other leagues" />
        <TabButton active={tab === 'development'} onClick={() => setTab('development')} icon={<TrendingUp size={16} />} label="Development" />
      </nav>

      {tab === 'profile' ? (
        <section className="ux-comparison-panel">
          <PanelHeading
            title="Where he sits in his position"
            text="Verified provider percentiles against the peer cohort used by DJM. Missing categories stay missing."
          />
          {performance ? (
            <div className="ux-percentile-list">
              {PROFILE_METRICS.map(([key, label]) => {
                const value = numeric(performance?.[key]);
                if (value == null) return null;
                return <PercentileRow key={key} label={label} value={value} />;
              })}
            </div>
          ) : (
            <EvidenceEmpty
              title="No trustworthy position profile yet"
              text="Update data. DJM will only create percentiles when the provider sample is large enough."
            />
          )}
          {performance?.peer_group_description ? (
            <p className="ux-evidence-note">Cohort: {performance.peer_group_description}</p>
          ) : null}
        </section>
      ) : null}

      {tab === 'peers' ? (
        <section className="ux-comparison-panel">
          <PanelHeading
            title="Current league and team"
            text="Every dot is an observed provider player. Filter to his current team or another team without changing the underlying evidence."
          />
          <div className="ux-filter-row">
            <label>
              Team
              <select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="all">All same-role league peers</option>
                {teams.map((name) => (
                  <option value={name} key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Metric
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                {availableMetrics.map((row) => (
                  <option value={row.key} key={row.key}>{row.label}</option>
                ))}
              </select>
            </label>
          </div>
          {visiblePeers.length >= 6 && availableMetrics.length ? (
            <PeerScatter
              peers={visiblePeers}
              metric={selectedMetric}
              targetProviderId={currentProviderPlayerId}
              targetName={playerLabel(player)}
            />
          ) : (
            <EvidenceEmpty
              title="Peer dots need a larger real sample"
              text="DJM will not draw synthetic players. Refresh the player when PitchAPI has current competition coverage."
            />
          )}
          <p className="ux-evidence-note">
            {currentPeerCache?.synced_at
              ? `Peer cache updated ${compactDateTime(currentPeerCache.synced_at)}.`
              : 'No peer cache timestamp yet.'}
          </p>
        </section>
      ) : null}

      {tab === 'leagues' ? (
        <section className="ux-comparison-panel">
          <PanelHeading
            title="What changes if we move the comparison league?"
            text="League strength and player performance are separate signals. When the same provider covers both leagues, DJM can also place his actual current metrics against real same-position players in the target league."
          />

          <div className="ux-filter-row">
            <label>
              Compare with
              <select value={leagueChoice} onChange={(event) => void selectLeague(event.target.value)}>
                <option value="">Choose league</option>
                {competitions.filter((row: any) => String(row.competition_id || '') !== String(player?.current_competition_id || '')).length ? (
                  <optgroup label="DJM leagues">
                    {competitions
                      .filter((row: any) => String(row.competition_id || '') !== String(player?.current_competition_id || ''))
                      .map((row: any) => (
                        <option key={row.competition_id} value={`djm:${row.competition_id}`}>
                          {row.league_name}{row.country ? ` · ${row.country}` : ''}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
                {catalog.length ? (
                  <optgroup label="PitchAPI catalogue">
                    {catalog
                      .filter((row: any) => row.name !== player?.current_league)
                      .slice(0, 500)
                      .map((row: any) => (
                        <option key={`pitch:${row.id}`} value={`pitch:${row.id}`}>
                          {row.name}{row.country ? ` · ${row.country}` : ''}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </div>

          <div className="ux-league-bars">
            <LeagueBar
              label={player?.current_league || 'Current league'}
              value={currentLeagueStrength}
              detail="Current competition"
            />
            <LeagueBar
              label={targetLeagueName}
              value={targetLeagueStrength}
              detail={targetLeagueCountry || (targetLeagueStrength == null ? 'Strength benchmark not available yet' : 'League benchmark')}
            />
          </div>

          {leagueChoice || leagueCompare ? (
            <div className="ux-cross-league-block">
              <div className="ux-cross-league-head">
                <div>
                  <p className="ux-eyebrow">SAME PROVIDER · DIFFERENT LEAGUE</p>
                  <h3>{targetLeagueName} position cohort</h3>
                  <p>
                    The highlighted point is {playerLabel(player)}'s actual current PitchAPI metric. DJM does not translate that into a fake target-league percentile.
                  </p>
                </div>
                {targetPitchId ? (
                  <button type="button" className="ux-secondary-action" onClick={() => void refreshTargetLeague()} disabled={busy}>
                    <RefreshCw size={15} className={busy ? 'spin' : ''} />
                    {targetPeers.length ? 'Refresh league peers' : 'Load league peers'}
                  </button>
                ) : null}
              </div>

              {targetPitchId ? (
                <>
                  <div className="ux-filter-row">
                    <label>
                      Team
                      <select value={targetTeam} onChange={(event) => setTargetTeam(event.target.value)}>
                        <option value="all">All same-role league peers</option>
                        {targetTeams.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Metric
                      <select value={leagueMetric} onChange={(event) => setLeagueMetric(event.target.value)}>
                        {targetAvailableMetrics.map((row) => (
                          <option value={row.key} key={row.key}>{row.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {crossLeaguePoints.length >= 7 && targetAvailableMetrics.length ? (
                    <PeerScatter
                      peers={crossLeaguePoints}
                      metric={selectedLeagueMetric}
                      targetProviderId={crossLeagueMarkerId}
                      targetName={playerLabel(player)}
                      crossLeague
                    />
                  ) : (
                    <EvidenceEmpty
                      title="Target league peer evidence is not ready"
                      text="Load the target league cohort. DJM requires at least six real same-role peers and a shared observed metric before drawing this comparison."
                    />
                  )}
                  <p className="ux-evidence-note">
                    {targetPeerCache?.synced_at
                      ? `Target peer cache updated ${compactDateTime(targetPeerCache.synced_at)}.`
                      : targetPeerContext?.provider_competition_id
                        ? 'Target league identity resolved. Peer cache has not been populated yet.'
                        : 'Target league provider identity has not been resolved.'}
                  </p>
                </>
              ) : (
                <EvidenceEmpty
                  title="League-strength comparison only"
                  text="This competition does not yet have a verified PitchAPI identity in DJM, so no player dots are shown."
                />
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'development' ? (
        <section className="ux-comparison-panel">
          <PanelHeading
            title="Current level and development ceiling"
            text="Current level comes from V5. Potential is shown only when DJM has a stored evidence-backed or reviewed potential value."
          />
          {displayScore != null ? (
            <div className="ux-development-track">
              <div className="ux-development-axis">
                <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
              </div>
              <div className="ux-development-line">
                <div className="ux-current-marker" style={{ left: `${Math.max(0, Math.min(100, displayScore))}%` }}>
                  <strong>{displayScore}</strong><span>Current</span>
                </div>
                {potentialScore != null ? (
                  <div className="ux-potential-marker" style={{ left: `${Math.max(0, Math.min(100, potentialScore))}%` }}>
                    <strong>{potentialScore}</strong><span>Potential</span>
                  </div>
                ) : null}
              </div>
              <div className="ux-development-notes">
                <div><CircleGauge size={18} /><span><strong>V5 current level</strong>{score?.evidence_band_low != null && score?.evidence_band_high != null ? ` · evidence band ${score.evidence_band_low}-${score.evidence_band_high}` : ''}</span></div>
                <div><TrendingUp size={18} /><span><strong>Potential</strong>{potentialScore == null ? ' · not enough evidence for a defensible forecast' : ' · stored DJM potential, separate from current level'}</span></div>
              </div>
            </div>
          ) : (
            <EvidenceEmpty title="Current level is not available" text="V5 needs enough trusted evidence before DJM can show a current-level marker." />
          )}
          <div className="ux-method-note">
            <CheckCircle2 size={18} />
            <p>
              This is not presented as SciSports SciSkill or a scientifically calibrated future-career probability. DJM should only calibrate its own predictive potential after it has a sufficiently large labelled longitudinal player dataset.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

function PanelHeading({ title, text }: { title: string; text: string }) {
  return <div className="ux-panel-heading"><h2>{title}</h2><p>{text}</p></div>;
}

function PercentileRow({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="ux-percentile-row">
      <div><strong>{label}</strong><span>{Math.round(safe)}th percentile</span></div>
      <div className="ux-percentile-track">
        <span className="ux-quarter ux-q1" /><span className="ux-quarter ux-q2" /><span className="ux-quarter ux-q3" />
        <i style={{ left: `${safe}%` }} />
      </div>
    </div>
  );
}

function PeerScatter({
  peers,
  metric,
  targetProviderId,
  targetName,
  crossLeague = false,
}: {
  peers: any[];
  metric: MetricDefinition;
  targetProviderId: string;
  targetName: string;
  crossLeague?: boolean;
}) {
  const points = peers
    .map((peer) => ({
      peer,
      x: numeric(peer.minutes),
      y: numeric(peer?.metrics?.[metric.key]),
    }))
    .filter((point) => point.x != null && point.y != null) as Array<{ peer: any; x: number; y: number }>;

  if (points.length < 2) {
    return <div className="ux-mini-empty">Not enough comparable points for this metric.</div>;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = Math.max(1, maxX - minX);
  const ySpan = Math.max(0.0001, maxY - minY);
  const plotX = (value: number) => 7 + ((value - minX) / xSpan) * 86;
  const plotY = (value: number) => 88 - ((value - minY) / ySpan) * 76;
  const target = points.find((point) => String(point.peer.provider_player_id || '') === targetProviderId);

  return (
    <div className="ux-scatter-wrap">
      <div className="ux-scatter-axis-label ux-scatter-y">{metric.short}</div>
      <div className="ux-scatter">
        <span className="ux-grid ux-grid-v1" /><span className="ux-grid ux-grid-v2" /><span className="ux-grid ux-grid-h1" /><span className="ux-grid ux-grid-h2" />
        {points.map((point, index) => {
          const isTarget = String(point.peer.provider_player_id || '') === targetProviderId;
          return (
            <button
              key={`${point.peer.provider_player_id || index}-${point.peer.provider_team_id || ''}`}
              type="button"
              className={`ux-dot ${isTarget ? 'is-target' : ''}`}
              style={{ left: `${plotX(point.x)}%`, top: `${plotY(point.y)}%` }}
              title={`${point.peer.player_name || 'Player'} · ${point.peer.team_name || 'Team'} · ${Math.round(point.x)} min · ${formatMetric(point.y, metric)}`}
              aria-label={`${point.peer.player_name || 'Player'}, ${formatMetric(point.y, metric)}`}
            />
          );
        })}
      </div>
      <div className="ux-scatter-axis"><span>{Math.round(minX)} min</span><strong>Minutes</strong><span>{Math.round(maxX)} min</span></div>
      <div className="ux-scatter-summary">
        {target ? (
          <><strong>{targetName}</strong><span>{formatMetric(target.y, metric)} · {Math.round(target.x)} min{crossLeague ? ' · current-league observed metric placed against target-league cohort' : ''}</span></>
        ) : (
          <><strong>Target player not in this filtered cohort</strong><span>Change the team filter to show his dot.</span></>
        )}
      </div>
    </div>
  );
}

function LeagueBar({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  const safe = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ux-league-row">
      <div><strong>{label}</strong><span>{detail}</span></div>
      <div className="ux-league-track"><i style={{ width: `${safe}%` }} /></div>
      <b>{value ?? '-'}</b>
    </div>
  );
}

function EvidenceEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="ux-evidence-empty">
      <CircleGauge size={25} />
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  );
}
