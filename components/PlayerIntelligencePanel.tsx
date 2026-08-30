'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';

export default function PlayerIntelligencePanel({
  playerId,
  compact = false,
}: {
  playerId: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<any>({ scorecard: null, suggestions: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [manualScore, setManualScore] = useState('');
  const [manualPotential, setManualPotential] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const result: any = await djmRpc('djm_intelligence_player', {
        p_player_id: playerId,
      });
      setData(result || {});
      setManualScore(
        result?.scorecard?.manual_score == null ? '' : String(result.scorecard.manual_score),
      );
      setManualPotential(
        result?.scorecard?.manual_potential_score == null
          ? ''
          : String(result.scorecard.manual_potential_score),
      );
      setReason(result?.scorecard?.override_reason || '');
    } catch (loadError) {
      setError(friendlyError(loadError));
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const score = data?.scorecard || null;
  const basis = score?.basis || {};
  const scoreTier =
    score?.manual_score != null
      ? 'manual_override'
      : score?.score_tier || inferScoreTier(score);
  const displayScore =
    score?.manual_score ??
    score?.model_score ??
    score?.provisional_score ??
    basis?.provisional_score ??
    null;
  const potential = score?.manual_potential_score ?? score?.potential_model_score ?? null;
  const confidence =
    scoreTier === 'provisional'
      ? score?.provisional_confidence ?? score?.confidence
      : score?.confidence;
  const evidenceBand = basis?.evidence_band || basis?.score_range || null;
  const missing = normaliseMissingInputs(score?.missing_inputs ?? basis?.provisional_missing_inputs);
  const coverage =
    basis?.effective_evidence_coverage ?? score?.data_coverage ?? basis?.data_coverage ?? null;
  const competition = basis?.competition_name || basis?.current_league || 'Competition not resolved';

  const updateData = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result: any = await djmInvoke('refresh-player-data-universal', {
        mode: 'refresh',
        player_id: playerId,
      });
      if (!result?.ok) throw new Error(result?.error || 'Player data refresh failed.');

      if (String(result?.primary_provider || '').toLowerCase() === 'pitchapi') {
        try {
          await djmInvoke('refresh-player-peer-data', { player_id: playerId });
        } catch {
          // Peer plotting is additive. Core player evidence remains valid without it.
        }
      }

      setMessage(result?.message || 'Player data updated from DJM connected sources.');
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
      await djmRpc('djm_player_scorecard', { p_player_id: playerId });
      setMessage('Player Score recalculated from the currently verified evidence.');
      await load();
    } catch (recalculateError) {
      setError(friendlyError(recalculateError));
    } finally {
      setBusy(false);
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
      setMessage(clear ? 'Manual override removed.' : 'Manual override saved separately from V5.');
      await load();
    } catch (overrideError) {
      setError(friendlyError(overrideError));
    } finally {
      setBusy(false);
    }
  };

  const headline = useMemo(() => {
    if (scoreTier === 'full') return 'Full evidence-backed score';
    if (scoreTier === 'provisional') {
      const grade = String(basis?.provisional_grade || '').replaceAll('_', ' ');
      return grade ? `${capitalise(grade)} provisional` : 'Provisional score';
    }
    if (scoreTier === 'manual_override') return 'Reviewed manual override';
    return 'More evidence needed';
  }, [basis?.provisional_grade, scoreTier]);

  return (
    <section className={`ux-score-card ${compact ? 'is-compact' : ''}`}>
      <div className="ux-score-main">
        <div className="ux-score-copy">
          <span className="ux-kicker">DJM PLAYER SCORE</span>
          <h2>{headline}</h2>
          <p>
            V5 keeps missing evidence unknown. Confidence describes evidence quality, not the probability of career success.
          </p>
        </div>
        <div className="ux-score-number">
          <strong>{displayScore ?? '?'}</strong>
          <span>{scoreTierLabel(scoreTier)}</span>
        </div>
      </div>

      {error ? <div className="ux-error-line"><AlertCircle size={16} />{error}</div> : null}
      {message ? <div className="ux-success-line"><CheckCircle2 size={16} />{message}</div> : null}

      <div className="ux-score-facts">
        <Fact label="Evidence confidence" value={formatConfidence(confidence)} />
        <Fact label="Effective evidence" value={coverage == null ? 'Unknown' : `${Math.round(Number(coverage))}%`} />
        <Fact label="Potential" value={potential == null ? 'Not defensible yet' : String(potential)} />
        <Fact
          label="Evidence band"
          value={
            evidenceBand?.low != null && evidenceBand?.high != null
              ? `${evidenceBand.low}-${evidenceBand.high}`
              : 'Not available'
          }
        />
      </div>

      <div className="ux-score-actions">
        <button className="ux-primary-button" onClick={() => void updateData()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
          Update data
        </button>
        <Link className="ux-secondary-button" href={`/admin/players/${playerId}/compare`}>
          <BarChart3 size={15} />
          Compare player
        </Link>
      </div>

      <details className="ux-score-advanced">
        <summary>
          <span>
            <strong>Advanced evidence</strong>
            <small>{missing.length ? `${missing.length} Full Score inputs missing` : 'Evidence details and controls'}</small>
          </span>
          <ChevronDown size={17} />
        </summary>

        <div className="ux-score-advanced-body">
          <div className="ux-score-evidence-grid">
            <Fact label="Competition" value={competition} />
            <Fact label="Benchmark" value={basis?.league_strength_score ?? 'Not available'} />
            <Fact label="Recent minutes" value={basis?.recent_minutes_24m ?? 'Unknown'} />
            <Fact label="Recency-weighted minutes" value={basis?.effective_recent_minutes ?? basis?.weighted_recent_minutes ?? 'Unknown'} />
            <Fact label="Latest evidence" value={basis?.latest_evidence_date ?? 'Unknown'} />
            <Fact label="Performance" value={basis?.performance_score ?? 'Missing: treated as unknown'} />
            <Fact label="Role / minutes" value={basis?.role_score ?? basis?.playing_time_score ?? 'Unknown'} />
            <Fact label="Experience" value={basis?.experience_score ?? 'Not enough career history'} />
            <Fact label="Trend" value={basis?.trend_score ?? 'Missing: treated as unknown'} />
            <Fact label="Availability" value={basis?.availability_score ?? 'Unknown'} />
            <Fact label="Missing for Full" value={missing.length ? missing.map(inputLabel).join(', ') : 'None'} />
            <Fact label="Model" value={score?.model_version || 'Not calculated'} />
          </div>

          <div className="ux-score-advanced-actions">
            <button className="ux-secondary-button" onClick={() => void recalculate()} disabled={busy}>Recalculate V5</button>
            <button className="ux-secondary-button" onClick={() => setEditing((value) => !value)}>Manual override</button>
            <Link className="ux-secondary-button" href={`/brain/data?player=${playerId}`}>Open evidence tools</Link>
          </div>

          {editing ? (
            <div className="ux-score-override">
              <label>Player Score<input type="number" min="0" max="100" value={manualScore} onChange={(event) => setManualScore(event.target.value)} /></label>
              <label>Potential<input type="number" min="0" max="100" value={manualPotential} onChange={(event) => setManualPotential(event.target.value)} /></label>
              <label className="ux-form-wide">Required reason<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <div className="ux-score-advanced-actions ux-form-wide">
                <button className="ux-primary-button" onClick={() => void saveOverride()} disabled={busy || (!manualScore && !manualPotential) || !reason.trim()}>Save override</button>
                <button className="ux-secondary-button" onClick={() => setEditing(false)}>Cancel</button>
                {score?.manual_score != null || score?.manual_potential_score != null ? (
                  <button className="ux-secondary-button" onClick={() => void saveOverride(true)}>Remove override</button>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="ux-model-note">
            <ShieldCheck size={14} />
            Current-level age adjustment is not used in V5. Potential remains a separate model concept.
            {score?.calculated_at ? ` Last calculated ${compactDateTime(score.calculated_at)}.` : ''}
          </p>
        </div>
      </details>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function inferScoreTier(score: any) {
  if (score?.manual_score != null) return 'manual_override';
  if (score?.model_score != null && score?.score_status === 'calculated') return 'full';
  if (score?.provisional_score != null) return 'provisional';
  return 'unavailable';
}

function scoreTierLabel(tier: string) {
  if (tier === 'full') return 'Full Score';
  if (tier === 'provisional') return 'Provisional';
  if (tier === 'manual_override') return 'Manual override';
  return 'Unavailable';
}

function formatConfidence(value: unknown) {
  if (value == null || value === '') return 'Unknown';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Unknown';
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
    position_adjusted_performance: 'position performance',
    experience_history: 'career history',
    competition_level: 'competition level',
    trend: 'trend',
    availability: 'availability',
    role: 'role / minutes',
  };
  return labels[value] || value.replaceAll('_', ' ');
}

function capitalise(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
