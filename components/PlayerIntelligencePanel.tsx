"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleGauge,
  Database,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { compactDateTime, djmInvoke, djmRpc, friendlyError } from "@/lib/djm-os";
import { supabase } from "@/lib/supabase";

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
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncConfigured, setSyncConfigured] = useState<boolean | null>(null);
  const [marketValue, setMarketValue] = useState("");
  const [marketCurrency, setMarketCurrency] = useState("EUR");
  const [marketVerifiedAt, setMarketVerifiedAt] = useState<string | null>(null);
  const [transfermarktUrl, setTransfermarktUrl] = useState("");
  const [marketSaving, setMarketSaving] = useState(false);
  const [marketSchemaReady, setMarketSchemaReady] = useState(true);

  const load = useCallback(async () => {
    try {
      const result: any = await djmRpc("djm_intelligence_player", {
        p_player_id: playerId,
      });
      setData(result || {});

      const playerResult = await supabase
        .from("players")
        .select(
          "transfermarkt_url,transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at",
        )
        .eq("id", playerId)
        .maybeSingle();

      if (playerResult.error) {
        setMarketSchemaReady(false);
        const fallback = await supabase
          .from("players")
          .select("transfermarkt_url")
          .eq("id", playerId)
          .maybeSingle();
        setTransfermarktUrl(fallback.data?.transfermarkt_url || "");
      } else {
        setMarketSchemaReady(true);
        const player = playerResult.data as any;
        setTransfermarktUrl(player?.transfermarkt_url || "");
        setMarketValue(
          player?.transfermarkt_market_value == null
            ? ""
            : String(player.transfermarkt_market_value),
        );
        setMarketCurrency(player?.transfermarkt_market_value_currency || "EUR");
        setMarketVerifiedAt(player?.transfermarkt_value_verified_at || null);
      }

      try {
        const status: any = await djmInvoke("refresh-player-data-universal", {
          mode: "status",
        });
        setSyncConfigured(Boolean(status?.configured));
      } catch {
        setSyncConfigured(false);
      }

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
  const scoreTier =
    score?.manual_score != null
      ? "manual_override"
      : score?.score_tier || basis?.score_tier || inferScoreTier(score);
  const effective =
    score?.manual_score ??
    score?.model_score ??
    score?.provisional_score ??
    basis?.provisional_score ??
    null;
  const rawStatus = score?.score_status || "not_calculated";
  const status =
    scoreTier === "manual_override"
      ? "manual_override"
      : scoreTier === "provisional"
        ? "provisional"
        : normalisedScoreStatus(rawStatus, basis);
  const meaning = useMemo(
    () => scoreMeaning(status, basis, scoreTier),
    [status, basis, scoreTier],
  );
  const competition = basis.competition_name || basis.current_league || null;
  const benchmarkRequired = status === "benchmark_required";
  const benchmarkUrl = `/brain/benchmarks/import?player=${encodeURIComponent(
    playerId,
  )}${competition ? `&competition=${encodeURIComponent(competition)}` : ""}`;
  const missingInputs = normaliseMissingInputs(
    score?.missing_inputs ?? basis?.provisional_missing_inputs,
  );
  const effectiveConfidence =
    scoreTier === "provisional"
      ? score?.provisional_confidence ?? basis?.provisional_confidence
      : score?.confidence;

  const recalculate = async () => {
    setBusy(true);
    setError("");
    try {
      const result: any = await djmRpc("djm_player_scorecard", {
        p_player_id: playerId,
      });

      if (result?.score_tier === "provisional") {
        const missing = normaliseMissingInputs(result?.missing_inputs);
        setMessage(
          `Provisional Player Score ${result?.provisional_score ?? "available"} calculated at ${
            result?.provisional_confidence ?? "unknown"
          }% confidence.${
            missing.length
              ? ` Missing for a Full Score: ${missing.map(inputLabel).join(", ")}.`
              : ""
          }`,
        );
      } else if (result?.score_tier === "full") {
        setMessage(
          `Full Player Score ${result?.model_score ?? "available"} calculated from verified evidence.`,
        );
      } else if (result?.status === "benchmark_required") {
        setMessage(
          `${
            result?.basis?.competition_name || "Competition"
          } is resolved. A verified competition benchmark is the next required Player Score input.`,
        );
      } else if (result?.status === "competition_evidence_required") {
        setMessage(
          "Recent playing evidence is present, but the competition still needs to be resolved before a benchmark can be selected.",
        );
      } else if (result?.status === "not_enough_playing_time_data") {
        setMessage(
          "Player Score needs at least 500 verified senior minutes with defensible playing dates inside the previous 24 months.",
        );
      } else if (result?.status === "performance_data_required") {
        setMessage(
          "League and playing-time evidence are ready. DJM can publish a Provisional Score when coverage allows, while a Full Score still needs verified position-adjusted performance evidence.",
        );
      } else {
        setMessage("Player Score recalculated from the currently verified evidence.");
      }
      await load();
    } catch (recalculateError) {
      setError(friendlyError(recalculateError));
    } finally {
      setBusy(false);
    }
  };

  const refreshPlayerData = async () => {
    setSyncBusy(true);
    setError("");
    setMessage("");
    try {
      const result: any = await djmInvoke("refresh-player-data-universal", {
        mode: "refresh",
        player_id: playerId,
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Player data refresh failed.");
      }
      setMessage(
        result?.message ||
          "Player data refresh completed across DJM's available provider ladder.",
      );
      await load();
      window.setTimeout(() => window.location.reload(), 650);
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setSyncBusy(false);
    }
  };

  const saveTransfermarktValue = async () => {
    if (!marketSchemaReady) {
      setError(
        "The player sync database migration must be applied before saving a structured Transfermarkt value.",
      );
      return;
    }

    const number = marketValue.trim() === "" ? null : Number(marketValue);
    if (number != null && (!Number.isFinite(number) || number < 0)) {
      setError("Enter a valid Transfermarkt market value.");
      return;
    }

    setMarketSaving(true);
    setError("");
    try {
      const verifiedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("players")
        .update({
          transfermarkt_market_value: number,
          transfermarkt_market_value_currency:
            number == null ? null : marketCurrency,
          transfermarkt_value_verified_at: number == null ? null : verifiedAt,
        })
        .eq("id", playerId);

      if (updateError) throw updateError;
      setMarketVerifiedAt(number == null ? null : verifiedAt);
      setMessage(
        number == null
          ? "Transfermarkt value cleared."
          : "Transfermarkt value saved and marked verified now.",
      );
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setMarketSaving(false);
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
          ? "Manual override removed. The underlying Full or Provisional model value remains preserved."
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
            Full Scores use deep position-adjusted performance evidence.
            Provisional Scores remain useful when coverage is thinner, but the
            missing inputs and confidence stay visible.
          </p>
        </div>
        <div className={styles.score}>
          <strong>{effective ?? "?"}</strong>
          <span>{scoreTierLabel(scoreTier, status)}</span>
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
          <Fact label="Score tier" value={scoreTierLabel(scoreTier, status)} />
          <Fact label="Full model" value={score?.model_score ?? "Not available"} />
          <Fact
            label="Provisional"
            value={
              score?.provisional_score ??
              basis?.provisional_score ??
              "Not required / unavailable"
            }
          />
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
            value={formatConfidence(effectiveConfidence)}
          />
          <Fact
            label="Data coverage"
            value={
              score?.data_coverage != null
                ? `${score.data_coverage}%`
                : basis.data_coverage != null
                  ? `${basis.data_coverage}%`
                  : "Unknown"
            }
          />
          <Fact
            label="Freshness"
            value={
              score?.evidence_freshness ||
              (score?.stale_at ? "stale" : "unknown")
            }
          />
          <Fact
            label="Missing for Full Score"
            value={
              missingInputs.length
                ? missingInputs.map(inputLabel).join(", ")
                : scoreTier === "full"
                  ? "None"
                  : "See evidence status"
            }
          />
        </div>

        <div className={styles.basis}>
          <div>
            <span>Competition</span>
            <strong>{competition || "Competition evidence required"}</strong>
          </div>
          <div>
            <span>Competition basis</span>
            <strong>{competitionBasisLabel(basis.competition_basis)}</strong>
          </div>
          <div>
            <span>Competition benchmark</span>
            <strong>
              {basis.league_strength_score ??
                (benchmarkRequired ? "Benchmark required" : "Not available")}
            </strong>
          </div>
          <div>
            <span>Benchmark source</span>
            <strong>
              {basis.league_benchmark_provider ||
                basis.recommended_benchmark_source ||
                "Not available"}
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
          <div>
            <span>Current status</span>
            <strong>{basis.current_club || "Unattached / not recorded"}</strong>
          </div>
          <div>
            <span>Position-adjusted performance</span>
            <strong>
              {basis.performance_score ??
                (scoreTier === "provisional"
                  ? "Missing: provisional uses neutral 50"
                  : "Performance evidence required")}
            </strong>
          </div>
          <div>
            <span>Role / minutes</span>
            <strong>
              {basis.role_score ??
                basis.playing_time_score ??
                "Not available"}
            </strong>
          </div>
          <div>
            <span>Experience</span>
            <strong>
              {basis.experience_score ??
                "Not enough benchmarked career evidence"}
            </strong>
          </div>
          <div>
            <span>Recent trend</span>
            <strong>
              {basis.trend_score ??
                (scoreTier === "provisional"
                  ? "Missing: provisional uses neutral 50"
                  : "Needs two recent performance windows")}
            </strong>
          </div>
          <div>
            <span>Availability</span>
            <strong>
              {basis.availability_score ??
                "Not enough possible-minutes data"}
            </strong>
          </div>
          <div>
            <span>Ability core</span>
            <strong>
              {basis.ability_core_score ??
                score?.ability_core_score ??
                "Not available"}
            </strong>
          </div>
          <div>
            <span>Age adjustment</span>
            <strong>
              {formatAdjustment(
                basis.age_performance_adjustment ?? score?.age_adjustment,
              )}
            </strong>
          </div>
        </div>

        <div className={styles.override}>
          <div>
            <div>
              <span>UNIVERSAL PLAYER DATA</span>
              <strong>One-click evidence refresh</strong>
              <p>
                DJM checks PitchAPI for deep current performance first,
                TheSportsDB for broader current/basic evidence second,
                API-Football for historical/profile fallback, and preserves
                reviewed DJM evidence throughout. Missing data stays missing.
              </p>
            </div>
            <div>
              <span>TRANSFERMARKT VALUE</span>
              <strong>
                {marketValue
                  ? formatMarketValue(Number(marketValue), marketCurrency)
                  : "Not recorded"}
              </strong>
              <p>
                {marketVerifiedAt
                  ? `Verified ${compactDateTime(marketVerifiedAt)}`
                  : "Save the current value from the linked Transfermarkt profile."}
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => void refreshPlayerData()}
              disabled={syncBusy || syncConfigured === false}
            >
              <RefreshCw size={14} />
              {syncBusy ? "Refreshing player..." : "Refresh player data"}
            </button>
            {transfermarktUrl ? (
              <a href={transfermarktUrl} target="_blank" rel="noreferrer">
                Transfermarkt <ExternalLink size={13} />
              </a>
            ) : null}
          </div>

          {syncConfigured === false ? (
            <p>
              Universal stats refresh is unavailable. Check the deployed
              refresh functions and server-side provider configuration.
            </p>
          ) : null}

          <div>
            <label>
              Transfermarkt value
              <input
                type="number"
                min="0"
                step="1000"
                value={marketValue}
                onChange={(event) => setMarketValue(event.target.value)}
                placeholder="e.g. 500000"
                disabled={!marketSchemaReady}
              />
            </label>
            <label>
              Currency
              <select
                value={marketCurrency}
                onChange={(event) => setMarketCurrency(event.target.value)}
                disabled={!marketSchemaReady}
              >
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="AUD">AUD</option>
                <option value="NZD">NZD</option>
                <option value="SEK">SEK</option>
              </select>
            </label>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => void saveTransfermarktValue()}
              disabled={marketSaving || !marketSchemaReady}
            >
              {marketSaving ? "Saving..." : "Save verified TM value"}
            </button>
          </div>
        </div>

        <div className={styles.provenance}>
          <Database size={15} />
          <p>
            <strong>Model:</strong>{" "}
            {score?.model_version || "djm_player_score_v3_coverage_aware"}
            <span>
              <strong>Calculated:</strong>{" "}
              {score?.calculated_at
                ? compactDateTime(score.calculated_at)
                : "Not calculated"}
            </span>
            {scoreTier === "provisional" ? (
              <span>
                <strong>Provisional method:</strong>{" "}
                {basis.provisional_methodology ||
                  "Missing components are neutral-imputed at 50 and confidence is capped. No missing performance statistic is fabricated."}
              </span>
            ) : null}
            {basis.competition_basis ===
            "most_recent_verified_competition" ? (
              <span>
                <strong>Level basis:</strong> Most recent verified senior
                competition. This does not imply the player is currently
                contracted there.
              </span>
            ) : null}
            {basis.league_benchmark_verified_at ? (
              <span>
                <strong>Benchmark verified:</strong>{" "}
                {compactDateTime(basis.league_benchmark_verified_at)}
              </span>
            ) : null}
            {basis.league_benchmark_methodology ? (
              <span>
                <strong>Benchmark method:</strong>{" "}
                {basis.league_benchmark_methodology}
              </span>
            ) : null}
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
                <button
                  type="button"
                  onClick={() => void saveOverride(true)}
                >
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
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            Manual override
          </button>
          {missingInputs.includes("position_adjusted_performance") ||
          status === "performance_data_required" ? (
            <Link href={`/brain/performance?player=${playerId}`}>
              Add performance evidence
            </Link>
          ) : benchmarkRequired ? (
            <Link href={benchmarkUrl}>Resolve benchmark</Link>
          ) : (
            <Link href={`/brain/data?player=${playerId}`}>Open evidence</Link>
          )}
        </div>
      </footer>
    </section>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function inferScoreTier(score: any) {
  if (score?.manual_score != null) return "manual_override";
  if (score?.model_score != null && score?.score_status === "calculated") {
    return "full";
  }
  if (score?.provisional_score != null) return "provisional";
  return "unavailable";
}

function scoreTierLabel(tier: string, status: string) {
  if (tier === "full") return "Full Score";
  if (tier === "provisional") return "Provisional";
  if (tier === "manual_override") return "Manual Override";
  return statusLabel(status);
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

function normalisedScoreStatus(status: string, basis: any) {
  if (
    status === "not_enough_benchmark_data" &&
    Number(basis?.recent_minutes_24m || 0) >= 500
  ) {
    return basis?.competition_name || usableCompetition(basis?.current_league)
      ? "benchmark_required"
      : "competition_evidence_required";
  }
  return status;
}

function usableCompetition(value: unknown) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return (
    text &&
    !["n/a", "na", "none", "unknown", "all competitions"].includes(text)
  );
}

function competitionBasisLabel(value: unknown) {
  if (value === "current_competition") return "Verified current competition";
  if (value === "current_league_text") return "Current league record";
  if (value === "most_recent_verified_competition") {
    return "Most recent verified competition";
  }
  return "Not resolved";
}

function scoreMeaning(status: string, basis: any, scoreTier: string) {
  if (status === "manual_override") {
    return {
      title: "Manual DJM judgment is active",
      copy: "The Full or Provisional model value remains preserved underneath and the reason is recorded.",
    };
  }

  if (scoreTier === "provisional" || status === "provisional") {
    return {
      title: "Useful provisional current-level estimate",
      copy:
        "DJM has enough verified recent playing and competition evidence to publish a provisional rating. Missing model components are neutral-imputed at 50, never invented. Confidence is capped and the score upgrades automatically when deeper performance evidence becomes available.",
    };
  }

  if (status === "calculated") {
    return {
      title: "Evidence-backed Full Player Score",
      copy:
        "League level, position-adjusted performance, recent role, decayed experience and available trend evidence are combined transparently. Old evidence loses weight.",
    };
  }

  if (status === "needs_recalculation") {
    return {
      title: "Evidence changed",
      copy: "The previous model result is stale and should not be treated as current.",
    };
  }

  if (status === "benchmark_required") {
    return {
      title: "Competition benchmark is the next input",
      copy: `${
        basis?.competition_name || "The competition"
      } is resolved. DJM has enough recent playing evidence and will auto-resolve the benchmark where the league tier is recognised.`,
    };
  }

  if (status === "competition_evidence_required") {
    return {
      title: "Competition evidence required",
      copy:
        "DJM cannot select a trustworthy benchmark until the current or most recent valid senior competition is resolved.",
    };
  }

  if (status === "performance_data_required") {
    return {
      title: "Deep performance evidence can upgrade this player",
      copy:
        "DJM will not manufacture position-adjusted ability data. When enough context exists, a clearly labelled Provisional Score can still be published while the Full Score waits for a relevant peer dataset.",
    };
  }

  if (status === "not_enough_model_coverage") {
    return {
      title: "More model coverage required",
      copy:
        "DJM preserves the available evidence and can publish a Provisional Score when the minimum context threshold is met. A Full Score still needs deeper verified coverage.",
    };
  }

  if (status === "not_enough_playing_time_data") {
    return {
      title: "Not enough recent playing-time data",
      copy:
        "At least 500 verified senior minutes with defensible playing dates in the previous 24 months are required. Older football does not count as current evidence.",
    };
  }

  return {
    title: "Not calculated",
    copy:
      "Verified recent playing-time evidence and a trustworthy competition context are required before DJM publishes a rating.",
  };
}

function normaliseMissingInputs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return [];
}

function inputLabel(value: string) {
  const labels: Record<string, string> = {
    position_adjusted_performance: "position-adjusted performance",
    role_minutes: "role / minutes",
    experience: "benchmarked experience",
    trend: "recent trend",
    availability: "availability",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function formatAdjustment(value: unknown) {
  if (value == null || value === "") return "None";
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "None";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}`;
}

function formatMarketValue(value: number, currency: string) {
  if (!Number.isFinite(value)) return "Not recorded";
  const symbols: Record<string, string> = {
    EUR: "€",
    GBP: "£",
    USD: "$",
    AUD: "A$",
    NZD: "NZ$",
    SEK: "SEK ",
  };
  const symbol = symbols[currency] || `${currency} `;
  if (value >= 1_000_000) {
    return `${symbol}${(value / 1_000_000)
      .toFixed(value >= 10_000_000 ? 0 : 1)
      .replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}k`;
  return `${symbol}${Math.round(value).toLocaleString("en-GB")}`;
}
