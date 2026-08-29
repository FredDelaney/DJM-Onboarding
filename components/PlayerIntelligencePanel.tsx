"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleGauge,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { compactDateTime, djmRpc, friendlyError } from "@/lib/djm-os";

import styles from "./PlayerIntelligencePanel.module.css";

export default function PlayerIntelligencePanel({
  playerId,
}: {
  playerId: string;
}) {
  const [data, setData] = useState<any>({
    scorecard: null,
    evidence: [],
    runs: [],
    suggestions: [],
  });
  const [manualScore, setManualScore] = useState("");
  const [manualPotential, setManualPotential] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result: any = await djmRpc("djm_intelligence_player", {
        p_player_id: playerId,
      });
      setData(result || {});
      setManualScore(
        result?.scorecard?.manual_score == null
          ? ""
          : String(result.scorecard.manual_score),
      );
      setManualPotential(
        result?.scorecard?.manual_potential_score == null
          ? ""
          : String(result.scorecard.manual_potential_score),
      );
      setReason(result?.scorecard?.override_reason || "");
    } catch (loadError) {
      setError(friendlyError(loadError));
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const score = data.scorecard;
  const basis = score?.basis || {};
  const effective = score?.manual_score ?? score?.model_score ?? null;
  const status =
    score?.manual_score != null
      ? "manual_override"
      : score?.score_status || "not_calculated";
  const meaning = useMemo(() => scoreMeaning(status), [status]);

  const recalculate = async () => {
    setBusy(true);
    setError("");
    try {
      const result: any = await djmRpc("djm_player_scorecard", {
        p_player_id: playerId,
      });
      setMessage(
        result?.status === "not_enough_benchmark_data"
          ? "Not enough benchmark data. No score was created."
          : `Player Score ${result?.model_score ?? "not available"} calculated from verified evidence.`,
      );
      await load();
    } catch (recalculateError) {
      setError(friendlyError(recalculateError));
    } finally {
      setBusy(false);
    }
  };

  const saveOverride = async (clear = false) => {
    setBusy(true);
    setError("");
    try {
      await djmRpc("djm_player_score_override", {
        p_player_id: playerId,
        p_score: clear || manualScore === "" ? null : Number(manualScore),
        p_potential_score:
          clear || manualPotential === "" ? null : Number(manualPotential),
        p_reason: clear ? null : reason.trim() || null,
      });
      setEditing(false);
      setMessage(
        clear
          ? "Manual override removed. The underlying model value remains available."
          : "Manual override saved separately from the model value.",
      );
      await load();
    } catch (overrideError) {
      setError(friendlyError(overrideError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel}>
      <header>
        <div>
          <span>
            <CircleGauge size={14} /> DJM PLAYER SCORE
          </span>
          <h2>Current level, with its evidence attached.</h2>
          <p>
            This is not readiness, profile completeness, Club Match or
            Opportunity Probability. Potential stays separate.
          </p>
        </div>
        <div className={styles.score}>
          <strong>{effective ?? "?"}</strong>
          <span>{statusLabel(status)}</span>
        </div>
      </header>
      {error ? (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error}
        </div>
      ) : null}
      {message ? (
        <div className={styles.message}>
          <CheckCircle2 size={15} />
          {message}
        </div>
      ) : null}
      <div className={styles.body}>
        <div className={styles.meaning}>
          <span>MEANING</span>
          <strong>{meaning.title}</strong>
          <p>{meaning.copy}</p>
        </div>
        <div className={styles.facts}>
          <Fact label="Effective" value={effective ?? "Not available"} />
          <Fact label="Model" value={score?.model_score ?? "Not available"} />
          <Fact label="Manual override" value={score?.manual_score ?? "None"} />
          <Fact
            label="Potential"
            value={
              score?.manual_potential_score ??
              score?.potential_model_score ??
              "Separate / unavailable"
            }
          />
          <Fact
            label="Confidence"
            value={formatConfidence(score?.confidence)}
          />
          <Fact
            label="Freshness"
            value={
              score?.evidence_freshness ||
              (score?.stale_at ? "stale" : "unknown")
            }
          />
        </div>
        <div className={styles.basis}>
          <div>
            <span>Competition benchmark</span>
            <strong>
              {basis.league_strength_score ?? "Not enough benchmark data"}
            </strong>
          </div>
          <div>
            <span>Playing-time signal</span>
            <strong>
              {basis.playing_time_score ?? "Not enough playing-time data"}
            </strong>
          </div>
          <div>
            <span>Senior minutes considered</span>
            <strong>{basis.recent_minutes_24m ?? "Unknown"}</strong>
          </div>
          <div>
            <span>Evidence window</span>
            <strong>
              {basis.evidence_window_months
                ? `${basis.evidence_window_months} months`
                : "24 months"}
            </strong>
          </div>
        </div>
        <div className={styles.provenance}>
          <Database size={15} />
          <p>
            <strong>Model:</strong>{" "}
            {score?.model_version || "djm_player_score_v1"}
            <span>
              <strong>Calculated:</strong>{" "}
              {score?.calculated_at
                ? compactDateTime(score.calculated_at)
                : "Not calculated"}
            </span>
            {score?.stale_reason ? (
              <span>
                <strong>Blocked by:</strong> {score.stale_reason}
              </span>
            ) : null}
            {score?.override_reason ? (
              <span>
                <strong>Override reason:</strong> {score.override_reason}
              </span>
            ) : null}
          </p>
        </div>
        {editing ? (
          <div className={styles.override}>
            <div>
              <label>
                Player Score
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={manualScore}
                  onChange={(event) => setManualScore(event.target.value)}
                />
              </label>
              <label>
                Potential
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={manualPotential}
                  onChange={(event) => setManualPotential(event.target.value)}
                />
              </label>
            </div>
            <label>
              Required reason
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => void saveOverride()}
                disabled={
                  busy || (!manualScore && !manualPotential) || !reason.trim()
                }
              >
                Save override
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              {score?.manual_score != null ||
              score?.manual_potential_score != null ? (
                <button type="button" onClick={() => void saveOverride(true)}>
                  Remove override
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <footer>
        <div>
          <ShieldCheck size={15} />
          <span>
            {data.suggestions?.length || 0} evidence review
            {data.suggestions?.length === 1 ? "" : "s"} pending
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => void recalculate()}
            disabled={busy}
          >
            <RefreshCw size={14} />
            Recalculate
          </button>
          <button type="button" onClick={() => setEditing((value) => !value)}>
            Manual override
          </button>
          <Link href={`/brain/data?player=${playerId}`}>Open evidence</Link>
        </div>
      </footer>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatConfidence(value: unknown) {
  if (value == null || value === "") return "Unknown";
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return "Unknown";
  return `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`;
}
function scoreMeaning(status: string) {
  if (status === "manual_override")
    return {
      title: "Manual DJM judgment is active",
      copy: "The model value remains preserved underneath and the reason is recorded.",
    };
  if (status === "calculated")
    return {
      title: "Supported current-level estimate",
      copy: "Calculated from verified recent senior minutes and a verified competition benchmark.",
    };
  if (status === "needs_recalculation")
    return {
      title: "Evidence changed",
      copy: "The previous model result is stale and should not be treated as current.",
    };
  if (status === "not_enough_benchmark_data")
    return {
      title: "Not enough benchmark data",
      copy: "DJM will not invent a competition strength score.",
    };
  if (status === "not_enough_playing_time_data")
    return {
      title: "Not enough playing-time data",
      copy: "At least 500 verified senior minutes in the previous 24 months are required.",
    };
  return {
    title: "Not calculated",
    copy: "Verified playing-time evidence and a competition benchmark are required.",
  };
}
