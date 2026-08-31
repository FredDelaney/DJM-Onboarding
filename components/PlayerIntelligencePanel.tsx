'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

type ScoreComponent = {
  score?: number | null;
  quality?: number | null;
  weight?: number | null;
  eligible?: boolean;
};

type GlobalIntelligence = {
  available?: boolean;
  subject?: {
    subject_id?: string;
    external_data_status?: string;
    external_data_checked_at?: string | null;
    external_data_error?: string | null;
  };
  scorecard?: {
    display_score?: number | null;
    score_tier?: string;
    confidence?: number | null;
    data_coverage?: number | null;
    position_group?: string | null;
    model_version?: string | null;
    calculated_at?: string | null;
    definition?: string | null;
    score_state?: string | null;
    evidence_grade?: string | null;
    evidence_band?: { low?: number; high?: number } | null;
    components?: Record<string, ScoreComponent>;
    missing_inputs?: string[];
    identity_quality?: number | null;
    season_recency_quality?: number | null;
    advanced_data_required?: boolean;
  } | null;
  evidence?: {
    provider_snapshot_count?: number;
    match_snapshot_count?: number;
    career_entry_count?: number;
    latest_provider?: string | null;
    season_label?: string | null;
    competition_name?: string | null;
    data_depth?: string | null;
    snapshot_confidence?: number | null;
    latest_observed_at?: string | null;
    latest_synced_at?: string | null;
    source_name?: string | null;
    source_url?: string | null;
  };
  automation?: {
    status?: string | null;
    target_confidence?: number | null;
    current_confidence?: number | null;
    missing_evidence?: string[];
    last_attempt_at?: string | null;
    next_attempt_at?: string | null;
    attempts?: number;
    last_error?: string | null;
  };
};

const componentOrder = [
  ['competition', 'Competition strength'],
  ['team_context', 'Team level'],
  ['role', 'Selection role'],
  ['position_production', 'Position output'],
  ['match_influence', 'Match influence'],
  ['market_consensus', 'Market signal'],
  ['career_context', 'Career context'],
] as const;

export default function PlayerIntelligencePanel({
  playerId,
  compact = false,
}: {
  playerId: string;
  compact?: boolean;
}) {
  const [legacyData, setLegacyData] = useState<any>({ scorecard: null, suggestions: [] });
  const [globalData, setGlobalData] = useState<GlobalIntelligence>({ available: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [manualScore, setManualScore] = useState('');
  const [manualPotential, setManualPotential] = useState('');
  const [reason, setReason] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [marketCurrency, setMarketCurrency] = useState('EUR');
  const [marketVerifiedAt, setMarketVerifiedAt] = useState<string | null>(null);
  const [marketSaving, setMarketSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const [legacyResult, intelligenceResult, playerResult] = await Promise.allSettled([
      djmRpc('djm_intelligence_player', { p_player_id: playerId }),
      djmRpc('djm_player_global_intelligence', { p_player_id: playerId }),
      supabase
        .from('players')
        .select('transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at')
        .eq('id', playerId)
        .maybeSingle(),
    ]);

    if (legacyResult.status === 'fulfilled') {
      const result: any = legacyResult.value || {};
      setLegacyData(result);
      setManualScore(
        result?.scorecard?.manual_score == null ? '' : String(result.scorecard.manual_score),
      );
      setManualPotential(
        result?.scorecard?.manual_potential_score == null
          ? ''
          : String(result.scorecard.manual_potential_score),
      );
      setReason(result?.scorecard?.override_reason || '');
    }

    if (intelligenceResult.status === 'fulfilled') {
      setGlobalData((intelligenceResult.value || { available: false }) as GlobalIntelligence);
    }

    if (playerResult.status === 'fulfilled') {
      const player = playerResult.value.data;
      setMarketValue(
        player?.transfermarkt_market_value == null
          ? ''
          : String(player.transfermarkt_market_value),
      );
      setMarketCurrency(player?.transfermarkt_market_value_currency || 'EUR');
      setMarketVerifiedAt(player?.transfermarkt_value_verified_at || null);
    }

    if (
      legacyResult.status === 'rejected' &&
      intelligenceResult.status === 'rejected'
    ) {
      setError(friendlyError(intelligenceResult.reason || legacyResult.reason));
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const globalScore = globalData?.scorecard || null;
  const legacyScore = legacyData?.scorecard || null;
  const legacyBasis = legacyScore?.basis || {};
  const globalAvailable = Boolean(globalData?.available && globalScore);
  const scoreTier = globalAvailable
    ? globalScore?.score_tier || 'provisional'
    : legacyScore?.score_tier || inferScoreTier(legacyScore);
  const displayScore = globalAvailable
    ? globalScore?.display_score ?? null
    : legacyScore?.manual_score ?? legacyScore?.model_score ?? legacyScore?.provisional_score ?? null;
  const confidence = globalAvailable
    ? globalScore?.confidence
    : legacyScore?.provisional_confidence ?? legacyScore?.confidence;
  const coverage = globalAvailable
    ? globalScore?.data_coverage
    : legacyBasis?.effective_evidence_coverage ?? legacyScore?.data_coverage ?? null;
  const evidenceBand = globalAvailable
    ? globalScore?.evidence_band
    : legacyBasis?.evidence_band || legacyBasis?.score_range || null;
  const missing = normaliseMissingInputs(
    globalAvailable
      ? globalScore?.missing_inputs
      : legacyScore?.missing_inputs ?? legacyBasis?.provisional_missing_inputs,
  );
  const automation = globalData?.automation || {};
  const evidence = globalData?.evidence || {};
  const components = globalScore?.components || {};
  const manualReviewActive =
    legacyScore?.manual_score != null || legacyScore?.manual_potential_score != null;

  const updateData = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const jobs: Promise<any>[] = [
        djmInvoke('refresh-player-data-universal', {
          mode: 'refresh',
          player_id: playerId,
        }),
      ];

      if (globalData?.subject?.subject_id) {
        jobs.push(
          djmInvoke('refresh-official-football-data', {
            mode: 'refresh_subject',
            subject_id: globalData.subject.subject_id,
          }),
        );
      }

      const results = await Promise.allSettled(jobs);
      if (results.every((result) => result.status === 'rejected')) {
        const failed = results.find((result) => result.status === 'rejected');
        throw failed && failed.status === 'rejected'
          ? failed.reason
          : new Error('Player data refresh failed.');
      }

      await djmRpc('djm_refresh_player_global_intelligence', {
        p_player_id: playerId,
      });

      const officialResult = results[1];
      const officialSucceeded =
        officialResult?.status === 'fulfilled' &&
        Number(officialResult.value?.refreshed || 0) > 0;
      setMessage(
        officialSucceeded
          ? 'Official evidence, peer context and Global Intelligence are now current.'
          : 'Stored evidence was recalculated. Any unavailable source will retry automatically.',
      );
      await load();
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_refresh_player_global_intelligence', {
        p_player_id: playerId,
      });
      setMessage('Global Intelligence recalculated from the verified database record.');
      await load();
    } catch (recalculateError) {
      setError(friendlyError(recalculateError));
    } finally {
      setBusy(false);
    }
  };

  const saveTransfermarktValue = async () => {
    const number = marketValue.trim() === '' ? null : Number(marketValue);
    if (number != null && (!Number.isFinite(number) || number < 0)) {
      setError('Enter a valid Transfermarkt market value.');
      return;
    }

    setMarketSaving(true);
    setError('');
    try {
      const verifiedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('players')
        .update({
          transfermarkt_market_value: number,
          transfermarkt_market_value_currency: number == null ? null : marketCurrency,
          transfermarkt_value_verified_at: number == null ? null : verifiedAt,
        })
        .eq('id', playerId);
      if (updateError) throw updateError;
      await djmRpc('djm_refresh_player_global_intelligence', {
        p_player_id: playerId,
      });
      setMarketVerifiedAt(number == null ? null : verifiedAt);
      setMessage(
        number == null
          ? 'Reviewed market value removed and the model recalculated.'
          : 'Reviewed market value saved and the model recalculated.',
      );
      await load();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setMarketSaving(false);
    }
  };

  const saveOverride = async (clear = false) => {
    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_player_score_override', {
        p_player_id: playerId,
        p_score: clear || manualScore === '' ? null : Number(manualScore),
        p_potential_score:
          clear || manualPotential === '' ? null : Number(manualPotential),
        p_reason: clear ? null : reason.trim() || null,
      });
      setEditing(false);
      setMessage(
        clear
          ? 'Reviewed exception removed.'
          : 'Reviewed exception saved separately from the automated model.',
      );
      await load();
    } catch (overrideError) {
      setError(friendlyError(overrideError));
    } finally {
      setBusy(false);
    }
  };

  const headline = intelligenceHeadline(globalAvailable, globalScore?.score_state);

  return (
    <section className={`ux-score-card ux-global-intelligence ${compact ? 'is-compact' : ''}`}>
      <div className="ux-intelligence-hero">
        <div className="ux-intelligence-score" data-state={globalScore?.score_state || 'enriching'}>
          <span>Current level</span>
          <strong>{displayScore ?? '?'}</strong>
          <small>{globalScore?.evidence_grade || scoreTierLabel(scoreTier)}</small>
        </div>

        <div className="ux-score-copy">
          <span className="ux-kicker">GLOBAL PLAYER INTELLIGENCE</span>
          <h2>{headline}</h2>
          <p>
            Competition, team, role, position output, match influence, market signal and career context are fused only when verified evidence exists. Missing data is never scored as zero.
          </p>
          <div className="ux-intelligence-model-line">
            <Sparkles size={14} />
            <span>{globalAvailable ? 'V7.1 diversity-calibrated model' : 'Verified evidence fallback'}</span>
            <span>{globalScore?.position_group || 'Role resolving'}</span>
          </div>
        </div>
      </div>

      {error ? <div className="ux-error-line"><AlertCircle size={16} />{error}</div> : null}
      {message ? <div className="ux-success-line"><CheckCircle2 size={16} />{message}</div> : null}

      <div className="ux-score-facts ux-intelligence-facts">
        <Fact label="Evidence grade" value={globalScore?.evidence_grade || 'Building'} />
        <Fact label="Evidence confidence" value={formatConfidence(confidence)} />
        <Fact label="Verified coverage" value={coverage == null ? 'Collecting' : `${Math.round(Number(coverage))}%`} />
        <Fact
          label="Evidence range"
          value={
            evidenceBand?.low != null && evidenceBand?.high != null
              ? `${evidenceBand.low}-${evidenceBand.high}`
              : 'Collecting'
          }
        />
      </div>

      {globalAvailable ? (
        <div className="ux-intelligence-body">
          <div className="ux-intelligence-components">
            <div className="ux-intelligence-section-head">
              <div>
                <span className="ux-kicker">MODEL SIGNALS</span>
                <h3>What is shaping the score</h3>
              </div>
              <small>Quality-adjusted, never zero-imputed</small>
            </div>
            <div className="ux-component-grid">
              {componentOrder.map(([key, label]) => (
                <ComponentBar key={key} label={label} component={components[key]} />
              ))}
            </div>
          </div>

          <aside className="ux-intelligence-automation">
            <div className="ux-intelligence-section-head">
              <div>
                <span className="ux-kicker">AUTOMATED COVERAGE</span>
                <h3>{automationHeadline(automation.status, missing.length)}</h3>
              </div>
              <AutomationPulse status={automation.status} />
            </div>

            {missing.length ? (
              <div className="ux-collection-list">
                {missing.slice(0, 4).map((item) => (
                  <div key={item}>
                    <Clock3 size={14} />
                    <span>
                      <strong>{inputLabel(item)}</strong>
                      <small>{collectionStatus(item)}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ux-automation-ready">
                <CheckCircle2 size={18} />
                <span><strong>Core model complete</strong><small>Weekly refresh remains active.</small></span>
              </div>
            )}

            <div className="ux-source-proof">
              <Database size={15} />
              <span>
                <strong>{providerLabel(evidence.latest_provider)}</strong>
                <small>
                  {evidence.competition_name || 'Competition resolving'}
                  {evidence.season_label ? ` · ${evidence.season_label}` : ''}
                </small>
              </span>
              <span className="ux-source-proof-count">
                {Number(evidence.provider_snapshot_count || 0) + Number(evidence.match_snapshot_count || 0) + Number(evidence.career_entry_count || 0)} records
              </span>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="ux-score-actions">
        <button className="ux-primary-button" onClick={() => void updateData()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
          Refresh intelligence
        </button>
        <Link className="ux-secondary-button" href={`/admin/players/${playerId}/compare`}>
          <BarChart3 size={15} />
          Compare player
        </Link>
        <span className="ux-refresh-cadence">
          <CheckCircle2 size={14} /> Official data refreshes weekly
        </span>
      </div>

      <details className="ux-score-advanced">
        <summary>
          <span>
            <strong>Advanced evidence and exceptions</strong>
            <small>Normally no action is required</small>
          </span>
          <ChevronDown size={17} />
        </summary>

        <div className="ux-score-advanced-body">
          <div className="ux-score-evidence-grid">
            <Fact label="Latest provider" value={providerLabel(evidence.latest_provider)} />
            <Fact label="Data depth" value={capitalise(String(evidence.data_depth || 'Collecting').replaceAll('_', ' '))} />
            <Fact label="Provider confidence" value={formatConfidence(evidence.snapshot_confidence)} />
            <Fact label="Provider records" value={evidence.provider_snapshot_count ?? 0} />
            <Fact label="Match records" value={evidence.match_snapshot_count ?? 0} />
            <Fact label="Career records" value={evidence.career_entry_count ?? 0} />
            <Fact label="Identity quality" value={formatConfidence(globalScore?.identity_quality)} />
            <Fact label="Season recency" value={formatConfidence(globalScore?.season_recency_quality)} />
            <Fact label="Missing evidence" value={missing.length ? missing.map(inputLabel).join(', ') : 'None'} />
            <Fact label="Collection state" value={capitalise(String(automation.status || 'Ready').replaceAll('_', ' '))} />
            <Fact label="Last source observation" value={evidence.latest_observed_at ? compactDateTime(evidence.latest_observed_at) : 'Not available'} />
            <Fact label="Model" value={globalScore?.model_version || legacyScore?.model_version || 'Not calculated'} />
          </div>

          <p className="ux-model-note">
            <ShieldCheck size={14} />
            This is a current-level intelligence score, not a talent verdict or a probability of career success. The evidence range is heuristic, not a statistical confidence interval. Missing: treated as unknown.
          </p>

          <div className="ux-score-override">
            <label>
              Reviewed Transfermarkt value
              <input
                type="number"
                min="0"
                step="1"
                value={marketValue}
                onChange={(event) => setMarketValue(event.target.value)}
                placeholder="Optional verified market reference"
              />
            </label>
            <label>
              Currency
              <select value={marketCurrency} onChange={(event) => setMarketCurrency(event.target.value)}>
                {['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK'].map((currency) => (
                  <option value={currency} key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <div className="ux-score-advanced-actions ux-form-wide">
              <button
                className="ux-secondary-button"
                type="button"
                onClick={() => void saveTransfermarktValue()}
                disabled={marketSaving}
              >
                Save reviewed value
              </button>
              <span className="ux-model-note">
                {marketVerifiedAt ? `Reviewed ${compactDateTime(marketVerifiedAt)}` : 'Optional and capped inside the model'}
              </span>
            </div>
          </div>

          <div className="ux-score-advanced-actions">
            <button className="ux-secondary-button" onClick={() => void recalculate()} disabled={busy}>Recalculate from database</button>
            <button className="ux-secondary-button" onClick={() => setEditing((value) => !value)}>
              {manualReviewActive ? 'Review stored exception' : 'Add reviewed exception'}
            </button>
            <Link className="ux-secondary-button" href={`/brain/data?player=${playerId}`}>Open evidence operations</Link>
          </div>

          {editing ? (
            <div className="ux-score-override">
              <label>Legacy Player Score<input type="number" min="0" max="100" value={manualScore} onChange={(event) => setManualScore(event.target.value)} /></label>
              <label>Potential review<input type="number" min="0" max="100" value={manualPotential} onChange={(event) => setManualPotential(event.target.value)} /></label>
              <label className="ux-form-wide">Required reason<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <div className="ux-score-advanced-actions ux-form-wide">
                <button className="ux-primary-button" onClick={() => void saveOverride()} disabled={busy || (!manualScore && !manualPotential) || !reason.trim()}>Save separate exception</button>
                <button className="ux-secondary-button" onClick={() => setEditing(false)}>Cancel</button>
                {manualReviewActive ? (
                  <button className="ux-secondary-button" onClick={() => void saveOverride(true)}>Remove exception</button>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="ux-model-note">
            Advanced data is not required for a usable score. Official match and deeper event evidence improve precision when legally available. V5 remains stored for audit compatibility but cannot overwrite V7.1.
            {globalScore?.calculated_at ? ` Last calculated ${compactDateTime(globalScore.calculated_at)}.` : ''}
          </p>
        </div>
      </details>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ComponentBar({ label, component }: { label: string; component?: ScoreComponent }) {
  const score = component?.score == null ? null : Number(component.score);
  const quality = component?.quality == null ? null : Number(component.quality);
  const hasSignal = Number.isFinite(score) && Number.isFinite(quality) && Number(quality) > 0;
  return (
    <div className={`ux-component-row ${hasSignal ? '' : 'is-collecting'}`}>
      <div>
        <span>{label}</span>
        <small>{hasSignal ? `${Math.round(Number(quality) * 100)}% evidence quality` : 'Collecting verified evidence'}</small>
      </div>
      <div className="ux-component-track" aria-hidden="true">
        <span style={{ width: hasSignal ? `${Math.max(4, Math.min(100, score || 0))}%` : '0%' }} />
      </div>
      <strong>{hasSignal ? Math.round(score || 0) : '·'}</strong>
    </div>
  );
}

function AutomationPulse({ status }: { status?: string | null }) {
  const active = ['queued', 'running', 'enriching', 'failed'].includes(String(status || '').toLowerCase());
  return <span className={`ux-automation-pulse ${active ? 'is-active' : ''}`}>{active ? 'Auto collecting' : 'Current'}</span>;
}

function intelligenceHeadline(available: boolean, state?: string | null) {
  if (!available) return 'Building the verified player record';
  if (state === 'elite_evidence') return 'Elite evidence depth';
  if (state === 'ready') return 'Decision-ready current level';
  if (state === 'usable') return 'Usable current-level model';
  return 'Current level is enriching';
}

function inferScoreTier(score: any) {
  if (score?.manual_score != null) return 'manual_override';
  if (score?.model_score != null && score?.score_status === 'calculated') return 'full';
  if (score?.provisional_score != null) return 'provisional';
  return 'unavailable';
}

function scoreTierLabel(tier: string) {
  if (tier === 'global' || tier === 'full') return 'Global';
  if (tier === 'provisional') return 'Building';
  if (tier === 'manual_override') return 'Reviewed';
  return 'Collecting';
}

function formatConfidence(value: unknown) {
  if (value == null || value === '') return 'Collecting';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Collecting';
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
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
    position_adjusted_performance: 'Position performance',
    position_specific_peer_production: 'Position peer production',
    experience_history: 'Career history',
    verified_career_context: 'Verified career context',
    competition_level: 'Competition level',
    competition_strength: 'Competition strength',
    trend: 'Recent trend',
    availability: 'Availability',
    role: 'Role and minutes',
    role_minutes: 'Role and minutes',
    match_influence: 'Match influence',
    market_consensus: 'Market consensus',
    verified_identity: 'Verified identity',
  };
  return labels[value] || capitalise(value.replaceAll('_', ' '));
}

function collectionStatus(value: string) {
  if (value === 'market_consensus') return 'Reviewed only, never scraped';
  if (value === 'verified_identity') return 'Identity checks retry automatically';
  if (value === 'match_influence') return 'Official match feed queued';
  return 'Source enrichment queued automatically';
}

function automationHeadline(status: string | null | undefined, missingCount: number) {
  if (!missingCount) return 'Evidence is current';
  if (String(status).toLowerCase() === 'running') return 'Sources are updating';
  return `${missingCount} signal${missingCount === 1 ? '' : 's'} still collecting`;
}

function providerLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    official_league: 'Official league data',
    pitchapi: 'PitchAPI',
    api_football: 'API-Football',
    thesportsdb: 'TheSportsDB',
    wyscout: 'Wyscout',
  };
  return labels[String(value || '').toLowerCase()] || 'Verified DJM evidence';
}

function capitalise(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
