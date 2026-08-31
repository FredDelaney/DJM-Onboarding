'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';
import styles from './PlayerIntelligencePanel.module.css';

type Signal = {
  key: string;
  label: string;
  score: number | null;
  quality: number | null;
  detail: string;
};

const CURRENCIES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK'];

export default function PlayerIntelligencePanel({
  playerId,
  compact = false,
}: {
  playerId: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [marketCurrency, setMarketCurrency] = useState('EUR');
  const [marketVerifiedAt, setMarketVerifiedAt] = useState<string | null>(null);
  const [marketSaving, setMarketSaving] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      const result: any = await djmRpc(
        refresh ? 'djm_refresh_player_global_intelligence' : 'djm_player_global_intelligence',
        { p_player_id: playerId },
      );
      setData(result || null);

      const { data: player, error: playerError } = await supabase
        .from('players')
        .select(
          'transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at',
        )
        .eq('id', playerId)
        .maybeSingle();
      if (playerError) throw playerError;

      setMarketValue(
        player?.transfermarkt_market_value == null
          ? ''
          : String(player.transfermarkt_market_value),
      );
      setMarketCurrency(player?.transfermarkt_market_value_currency || 'EUR');
      setMarketVerifiedAt(player?.transfermarkt_value_verified_at || null);
    },
    [playerId],
  );

  useEffect(() => {
    let active = true;
    void load(false).catch((loadError) => {
      if (active) setError(friendlyError(loadError));
    });
    return () => {
      active = false;
    };
  }, [load]);

  const score = data?.scorecard || {};
  const subject = data?.subject || {};
  const projection = data?.projection || {};
  const basis = score?.basis || {};
  const kernel = basis?.kernel || {};
  const components = basis?.components || kernel?.components_used || {};
  const provenance = score?.provenance || {};

  const rawScoreValue = numeric(
    score?.display_score ?? score?.model_score ?? score?.provisional_score,
  );
  const confidence = numeric(score?.confidence ?? kernel?.confidence);
  const coverage = numeric(score?.data_coverage ?? kernel?.data_coverage);
  const evidenceGrade = String(basis?.evidence_grade || kernel?.evidence_grade || '').toUpperCase();
  const scoreState = String(basis?.score_state || kernel?.score_state || score?.score_tier || '');
  const scorePublishable =
    score?.publishable === true ||
    ['usable', 'decision_ready', 'ready', 'elite_evidence'].includes(scoreState) ||
    (confidence != null && coverage != null && confidence >= 45 && coverage >= 40);
  const scoreValue = scorePublishable ? rawScoreValue : null;
  const evidenceBand = basis?.evidence_band || kernel?.evidence_band || null;
  const missing = normaliseMissingInputs(score?.missing_inputs ?? basis?.missing_inputs);
  const projectionAvailable = projection?.available === true;
  const forecastScore = numeric(projection?.forecast_score);
  const ceilingScore = numeric(projection?.ceiling_score);
  const projectionConfidence = numeric(projection?.confidence);
  const trajectory = Array.isArray(projection?.trajectory) ? projection.trajectory : [];

  const status = useMemo(() => {
    if (scoreState === 'usable') return { label: 'Decision ready', tone: 'good' };
    if (scoreValue != null && confidence != null && confidence >= 55) {
      return { label: 'Usable with caution', tone: 'watch' };
    }
    return { label: 'Building evidence', tone: 'neutral' };
  }, [confidence, scoreState, scoreValue]);

  const signals = useMemo<Signal[]>(() => {
    const rows: Signal[] = [
      signal('competition', 'Competition', components?.competition, 'League and competition strength'),
      signal('role', 'Role & minutes', components?.role, 'Selection trust and playing-time signal'),
      signal(
        'position_production',
        'Position production',
        components?.position_production,
        'Role-relevant output against real peers',
      ),
      signal('career_context', 'Career context', components?.career_context, 'Observed senior level and history'),
      signal('market_consensus', 'Market signal', components?.market_consensus, 'Capped external market consensus'),
      signal('team_context', 'Club strength', components?.team_context, 'ClubElo team context when matched'),
      signal('match_influence', 'Match influence', components?.match_influence, 'Match-level impact when available'),
    ];
    return rows.filter((row) => row.score != null || row.quality != null || row.key === 'match_influence');
  }, [components]);

  const updateData = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result: any = await djmInvoke('refresh-player-data-universal', {
        mode: 'refresh',
        player_id: playerId,
      });
      if (!result?.ok) throw new Error(result?.error || 'Player intelligence refresh failed.');

      if (String(result?.primary_provider || '').toLowerCase() === 'pitchapi') {
        try {
          await djmInvoke('refresh-player-peer-data', { player_id: playerId });
        } catch {
          // Peer enrichment is additive. Never block the canonical score refresh.
        }
      }

      await load(true);
      setMessage('Global intelligence refreshed and the DJM score has been rebuilt.');
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await load(true);
      setMessage('DJM Global Score and five-year outlook recalculated.');
    } catch (recalculateError) {
      setError(friendlyError(recalculateError));
    } finally {
      setBusy(false);
    }
  };

  const saveTransfermarktValue = async () => {
    const value = marketValue.trim() === '' ? null : Number(marketValue);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setError('Enter a valid Transfermarkt market value.');
      return;
    }

    setMarketSaving(true);
    setError('');
    setMessage('');
    try {
      const verifiedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('players')
        .update({
          transfermarkt_market_value: value,
          transfermarkt_market_value_currency: value == null ? null : marketCurrency,
          transfermarkt_value_verified_at: value == null ? null : verifiedAt,
        })
        .eq('id', playerId);
      if (updateError) throw updateError;

      setMarketVerifiedAt(value == null ? null : verifiedAt);
      await load(true);
      setMessage(
        value == null
          ? 'Transfermarkt value cleared and global score rebuilt.'
          : 'Verified market value saved and global score rebuilt.',
      );
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setMarketSaving(false);
    }
  };

  const ringStyle = {
    '--score-progress': `${Math.max(0, Math.min(100, scoreValue ?? 0)) * 3.6}deg`,
  } as CSSProperties;

  return (
    <section className={`${styles.shell} ${compact ? styles.compact : ''}`}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}><Sparkles size={13} /> DJM GLOBAL INTELLIGENCE</span>
            <span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span>
            <span className={styles.version}>V7.1</span>
          </div>
          <h2>One score. Global context. Explainable evidence.</h2>
          <p>
            Current level is calculated across competition strength, role, position production,
            career context and trusted external signals. Missing optional evidence reduces certainty,
            never the player by default.
          </p>
          <div className={styles.identityLine}>
            <span>{subject?.primary_position || score?.position_group || 'Position pending'}</span>
            <span>{subject?.current_club || 'Club pending'}</span>
            <span>{subject?.current_league || 'Competition pending'}</span>
          </div>
        </div>

        <div className={styles.scoreOrbit} style={ringStyle}>
          <div className={styles.orbitGlow} aria-hidden="true" />
          <div className={styles.scoreCore}>
            <span>GLOBAL LEVEL</span>
            <strong>{scoreValue == null ? '—' : Math.round(scoreValue)}</strong>
            <small>{scorePublishable ? '/ 100' : 'CALIBRATING'}</small>
          </div>
        </div>
      </header>

      {error ? <div className={styles.error}><AlertCircle size={16} />{error}</div> : null}
      {message ? <div className={styles.success}><CheckCircle2 size={16} />{message}</div> : null}

      <div className={styles.commandStrip}>
        <Metric
          icon={<ShieldCheck size={16} />}
          label="Evidence confidence"
          value={formatPercent(confidence)}
          detail="Source quality + diversity"
        />
        <Metric
          icon={<Database size={16} />}
          label="Data coverage"
          value={formatPercent(coverage)}
          detail={evidenceGrade ? `Evidence grade ${evidenceGrade}` : 'Coverage of usable model inputs'}
        />
        <Metric
          icon={<Target size={16} />}
          label="Evidence range"
          value={formatBand(evidenceBand)}
          detail="Uncertainty band, not a statistical CI"
        />
        <Metric
          icon={<Activity size={16} />}
          label="Real peer cohort"
          value={basis?.peer_count == null ? '—' : String(basis.peer_count)}
          detail="Comparable observed players"
        />
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.signalPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span>SCORE DRIVERS</span>
              <h3>Signal architecture</h3>
            </div>
            <CircleGauge size={20} />
          </div>

          <div className={styles.signals}>
            {signals.map((row) => (
              <SignalCard key={row.key} signal={row} />
            ))}
          </div>
        </section>

        <section className={styles.projectionPanel}>
          <div className={styles.projectionTop}>
            <div>
              <span className={styles.projectionKicker}><BrainCircuit size={14} /> 5Y OUTLOOK</span>
              <h3>{projectionAvailable && forecastScore != null ? Math.round(forecastScore) : '—'}</h3>
              <p>Expected level at year five</p>
            </div>
            <div className={styles.ceiling}>
              <span>UPSIDE CEILING</span>
              <strong>{projectionAvailable && ceilingScore != null ? Math.round(ceilingScore) : '—'}</strong>
            </div>
          </div>

          {projectionAvailable ? (
            <>
              <Trajectory current={scoreValue} rows={trajectory} />
              <div className={styles.projectionFacts}>
                <div>
                  <span>Projection range</span>
                  <strong>{formatProjectionRange(projection)}</strong>
                </div>
                <div>
                  <span>Projection confidence</span>
                  <strong>{formatPercent(projectionConfidence)}</strong>
                </div>
                <div>
                  <span>Age / role prior</span>
                  <strong>{projection?.age ?? '—'} · {projection?.position_group || '—'}</strong>
                </div>
              </div>
              <p className={styles.projectionNote}>
                Research-informed development prior with uncertainty. It is designed to upgrade to a
                trained longitudinal ensemble once DJM has enough player-season history, rather than
                pretending a tiny internal sample is machine learning.
              </p>
            </>
          ) : (
            <div className={styles.projectionEmpty}>
              <TrendingUp size={20} />
              <div>
                <strong>Projection input still incomplete</strong>
                <span>{projectionReason(projection?.reason)}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className={styles.actions}>
        <button className={styles.primaryAction} type="button" onClick={() => void updateData()} disabled={busy}>
          <RefreshCw size={16} className={busy ? styles.spin : ''} />
          {busy ? 'Rebuilding intelligence…' : 'Refresh intelligence'}
        </button>
        <button className={styles.secondaryAction} type="button" onClick={() => void recalculate()} disabled={busy}>
          <CircleGauge size={16} /> Recalculate global score
        </button>
        <Link className={styles.secondaryAction} href={`/admin/players/${playerId}/compare`}>
          <BarChart3 size={16} /> Compare player
        </Link>
      </div>

      <details className={styles.diagnostics}>
        <summary>
          <span>
            <strong>Analyst diagnostics</strong>
            <small>
              {missing.length
                ? `${missing.length} optional signal${missing.length === 1 ? '' : 's'} still missing`
                : 'Full model provenance and controls'}
            </small>
          </span>
          <ChevronDown size={18} />
        </summary>

        <div className={styles.diagnosticsBody}>
          <div className={styles.diagnosticGrid}>
            <Diagnostic label="Canonical model" value={prettyModel(score?.model_version)} />
            <Diagnostic label="Publication state" value={scorePublishable ? 'Published for decisions' : 'Internal prior only'} />
            <Diagnostic label="Internal model prior" value={rawScoreValue == null ? '—' : String(Math.round(rawScoreValue))} />
            <Diagnostic label="Score state" value={scoreState || 'Unknown'} />
            <Diagnostic label="Provider" value={provenance?.provider || basis?.provider || 'Unknown'} />
            <Diagnostic label="Evidence grade" value={evidenceGrade || 'Unknown'} />
            <Diagnostic label="Competition score" value={formatNumber(basis?.competition_level_score)} />
            <Diagnostic label="Role score" value={formatNumber(basis?.role_score)} />
            <Diagnostic label="Observed minutes" value={formatInteger(basis?.minutes)} />
            <Diagnostic label="Appearances / starts" value={`${basis?.appearances ?? '—'} / ${basis?.starts ?? '—'}`} />
            <Diagnostic label="Missing optional signals" value={missing.length ? missing.map(inputLabel).join(', ') : 'None'} />
            <Diagnostic label="Input fingerprint" value={basis?.input_fingerprint || 'Not available'} />
            <Diagnostic label="Last calculated" value={score?.calculated_at ? compactDateTime(score.calculated_at) : 'Unknown'} />
            <Diagnostic label="Legacy V5" value="Audit-only preview · never canonical" />
          </div>

          <div className={styles.marketControl}>
            <div className={styles.controlHeading}>
              <div>
                <span>VERIFIED MARKET INPUT</span>
                <strong>Transfermarkt value</strong>
              </div>
              <small>{marketVerifiedAt ? `Verified ${compactDateTime(marketVerifiedAt)}` : 'Not verified'}</small>
            </div>
            <div className={styles.marketFields}>
              <label>
                Value
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={marketValue}
                  onChange={(event) => setMarketValue(event.target.value)}
                  placeholder="Verified market value"
                />
              </label>
              <label>
                Currency
                <select value={marketCurrency} onChange={(event) => setMarketCurrency(event.target.value)}>
                  {CURRENCIES.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => void saveTransfermarktValue()} disabled={marketSaving}>
                {marketSaving ? 'Saving…' : 'Save + rebuild score'}
              </button>
            </div>
          </div>

          <div className={styles.diagnosticFooter}>
            <ShieldCheck size={15} />
            <span>
              Legacy V5 remains available for audit only. It no longer controls the universal score.
              Missing evidence is treated as uncertainty, never as zero performance.
            </span>
            <Link href={`/brain/data?player=${playerId}`}>Open evidence tools</Link>
          </div>
        </div>
      </details>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricIcon}>{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function SignalCard({ signal: row }: { signal: Signal }) {
  const score = row.score == null ? null : Math.max(0, Math.min(100, row.score));
  const quality = row.quality == null ? null : Math.max(0, Math.min(1, row.quality));
  return (
    <article className={styles.signalCard}>
      <div className={styles.signalTop}>
        <span>{row.label}</span>
        <strong>{score == null ? 'Pending' : Math.round(score)}</strong>
      </div>
      <div className={styles.signalTrack} aria-hidden="true">
        <span style={{ width: `${score ?? 0}%` }} />
      </div>
      <div className={styles.signalBottom}>
        <small>{row.detail}</small>
        <span>{quality == null ? 'No signal' : `${Math.round(quality * 100)}% quality`}</span>
      </div>
    </article>
  );
}

function Trajectory({ current, rows }: { current: number | null; rows: any[] }) {
  const points = [
    { label: 'Now', value: current },
    ...rows.filter((row) => Number(row?.year) > 0).map((row) => ({ label: `Y${row.year}`, value: numeric(row.score) })),
  ];
  return (
    <div className={styles.trajectory}>
      {points.map((point, index) => (
        <div className={styles.trajectoryPoint} key={`${point.label}-${index}`}>
          <span>{point.label}</span>
          <strong>{point.value == null ? '—' : Math.round(point.value)}</strong>
          {index < points.length - 1 ? <i aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.diagnostic}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function signal(key: string, label: string, source: any, detail: string): Signal {
  return {
    key,
    label,
    score: numeric(source?.score),
    quality: numeric(source?.quality),
    detail,
  };
}

function numeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value: unknown) {
  const number = numeric(value);
  if (number == null) return '—';
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}

function formatBand(band: any) {
  const low = numeric(band?.low);
  const high = numeric(band?.high);
  return low == null || high == null ? '—' : `${Math.round(low)}–${Math.round(high)}`;
}

function formatProjectionRange(projection: any) {
  const low = numeric(projection?.range_low);
  const high = numeric(projection?.range_high);
  return low == null || high == null ? '—' : `${Math.round(low)}–${Math.round(high)}`;
}

function formatNumber(value: unknown) {
  const number = numeric(value);
  return number == null ? '—' : number.toFixed(1).replace(/\.0$/, '');
}

function formatInteger(value: unknown) {
  const number = numeric(value);
  return number == null ? '—' : Math.round(number).toLocaleString();
}

function normaliseMissingInputs(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function inputLabel(value: string) {
  const labels: Record<string, string> = {
    match_influence: 'match influence',
    team_context: 'club strength',
    position_production: 'position production',
    market_consensus: 'market signal',
    career_context: 'career context',
    competition: 'competition strength',
    role: 'role / minutes',
  };
  return labels[value] || value.replaceAll('_', ' ');
}

function projectionReason(value: unknown) {
  const reasons: Record<string, string> = {
    subject_not_found: 'Universal player identity is still being resolved.',
    current_score_missing: 'Build the global current-level score first.',
    current_score_unavailable: 'Build the global current-level score first.',
    current_score_not_yet_projection_grade: 'The current score needs stronger evidence before DJM publishes a development forecast.',
    date_of_birth_missing: 'Add a verified date of birth to unlock the development curve.',
    date_of_birth_required: 'Add a verified date of birth to unlock the development curve.',
    position_group_required: 'Resolve the player’s role before publishing a development curve.',
  };
  return reasons[String(value || '')] || 'More verified context is required before publishing a forecast.';
}

function prettyModel(value: unknown) {
  const raw = String(value || '');
  if (!raw) return 'Not calculated';
  if (raw.includes('global_score_v7_1')) return 'DJM Global Score V7.1';
  if (raw.includes('global_score_v7')) return 'DJM Global Score V7';
  if (raw.includes('player_score_v5')) return 'DJM Player Score V5';
  return raw.replaceAll('_', ' ');
}
