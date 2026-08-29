"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  CircleGauge,
  Database,
  ExternalLink,
  FileSearch,
  History,
  RefreshCw,
  Save,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import DjmOsShell from "@/components/DjmOsShell";
import {
  compactDateTime,
  djmInvoke,
  djmRpc,
  friendlyError,
} from "@/lib/djm-os";
import {
  buildEvidencePreview,
  parseManualSeasonCsv,
  parseManualSeasonJson,
  type NormalisedSeasonRecord,
} from "@/lib/football-data";

import styles from "./page.module.css";

type View = "coverage" | "import" | "review" | "benchmarks" | "runs";

const EMPTY_BENCHMARK = {
  id: "",
  competition_id: "",
  display_name: "",
  country: "",
  gender: "male",
  level_tier: "",
  aliases: "",
  strength_score: "",
  source_url: "",
  source_note: "",
  verified_at: new Date().toISOString().slice(0, 10),
  review_cadence_days: "365",
};

const METRICS = [
  ["players", "Players"],
  ["players_with_source_links", "With source links"],
  ["players_with_verified_career", "Verified career evidence"],
  ["players_eligible_for_score", "Eligible for Player Score"],
  ["blocked_missing_benchmark", "Missing benchmark"],
  ["blocked_insufficient_minutes", "Insufficient minutes"],
  ["stale_scores", "Scores needing recalculation"],
  ["unresolved_suggestions", "Evidence reviews"],
] as const;

export default function IntelligenceDataPage() {
  const [data, setData] = useState<any>({
    metrics: {},
    players: [],
    gaps: [],
    benchmarks: [],
    competitions: [],
    suggestions: [],
    runs: [],
  });
  const [providers, setProviders] = useState<any[]>([]);
  const [view, setView] = useState<View>("coverage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [sourceName, setSourceName] = useState("Authorised manual export");
  const [sourceUrl, setSourceUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [preview, setPreview] = useState<NormalisedSeasonRecord[]>([]);
  const [benchmark, setBenchmark] = useState<any>(EMPTY_BENCHMARK);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result: any = await djmRpc("djm_intelligence_data");
      setData(result || {});
      try {
        const capabilities: any = await djmInvoke("import-player-stats", {
          mode: "capabilities",
        });
        setProviders(capabilities?.providers || []);
      } catch {
        setProviders([
          {
            provider: "wyscout",
            capability: "disabled",
            configured: false,
            label: "API not configured",
            reason:
              "Provider status could not be reached. Core DJM data remains available.",
          },
          {
            provider: "manual",
            capability: "manual_import",
            configured: true,
            label: "CSV or JSON import",
            reason: "Authorised manual import remains available.",
          },
          {
            provider: "transfermarkt",
            capability: "reference_only",
            configured: true,
            label: "Reference only",
            reason: "Open saved links or record authorised values manually.",
          },
        ]);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const requestedPlayer = new URLSearchParams(window.location.search).get(
      "player",
    );
    if (requestedPlayer) {
      setPlayerId(requestedPlayer);
      setView("import");
    }
    void load();
  }, [load]);

  const selectedPlayer = useMemo(
    () => data.players?.find((player: any) => player.id === playerId),
    [data.players, playerId],
  );

  const parsePreview = () => {
    setError("");
    setMessage("");
    try {
      const records =
        importFormat === "json"
          ? parseManualSeasonJson(importText)
          : parseManualSeasonCsv(importText).records;
      setPreview(records);
    } catch (parseError) {
      setPreview([]);
      setError(friendlyError(parseError));
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Use a CSV or JSON file smaller than 2 MB.");
      return;
    }
    const text = await file.text();
    setImportFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setImportText(text);
    setPreview([]);
  };

  const createEvidence = async () => {
    if (!playerId || !preview.length || !sourceName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result: any = await djmRpc("djm_intelligence_manual_import", {
        p_player_id: playerId,
        p_source_name: sourceName.trim(),
        p_source_url: sourceUrl.trim() || null,
        p_records: preview,
      });
      if (result?.status === "failed") {
        throw new Error(
          result.error ||
            "The import failed. Existing DJM data was not changed.",
        );
      }
      setMessage(
        `${result.facts_discovered} season record${result.facts_discovered === 1 ? "" : "s"} added to evidence review. Canonical DJM data has not changed.`,
      );
      setPreview([]);
      setImportText("");
      setView("review");
      await load();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const review = async (
    id: string,
    decision: "accepted" | "rejected" | "kept_current" | "review_later",
  ) => {
    setBusy(true);
    setError("");
    try {
      await djmRpc("djm_intelligence_review_suggestion", {
        p_suggestion_id: id,
        p_decision: decision,
      });
      setMessage(
        decision === "accepted"
          ? "Evidence accepted and canonical season record updated."
          : "Review decision saved.",
      );
      await load();
    } catch (reviewError) {
      setError(friendlyError(reviewError));
    } finally {
      setBusy(false);
    }
  };

  const saveBenchmark = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await djmRpc("djm_intelligence_benchmark_upsert", {
        p_id: benchmark.id || null,
        p_competition_id: benchmark.competition_id || null,
        p_display_name: benchmark.display_name.trim(),
        p_country: benchmark.country.trim() || null,
        p_gender: benchmark.gender || null,
        p_level_tier: numberOrNull(benchmark.level_tier),
        p_aliases: commaList(benchmark.aliases),
        p_provider_ids: {},
        p_strength_score: numberOrNull(benchmark.strength_score),
        p_source_url: benchmark.source_url.trim() || null,
        p_source_note: benchmark.source_note.trim() || null,
        p_verified_at: benchmark.verified_at
          ? new Date(`${benchmark.verified_at}T12:00:00Z`).toISOString()
          : null,
        p_review_cadence_days: Number(benchmark.review_cadence_days || 365),
      });
      setBenchmark(EMPTY_BENCHMARK);
      setMessage(
        "Verified competition benchmark saved. Affected Player Scores are now marked for recalculation.",
      );
      await load();
    } catch (benchmarkError) {
      setError(friendlyError(benchmarkError));
    } finally {
      setBusy(false);
    }
  };

  const editBenchmark = (item: any) => {
    setBenchmark({
      id: item.id,
      competition_id: item.competition_id || "",
      display_name: item.display_name || item.league_name || "",
      country: item.country || "",
      gender: item.gender || "male",
      level_tier: item.level_tier ?? "",
      aliases: (item.aliases || []).join(", "),
      strength_score: item.strength_score ?? "",
      source_url: item.source_url || "",
      source_note: item.source_note || "",
      verified_at: item.verified_at
        ? String(item.verified_at).slice(0, 10)
        : "",
      review_cadence_days: String(item.review_cadence_days || 365),
    });
    setView("benchmarks");
  };

  const deleteBenchmark = async (item: any) => {
    if (
      !window.confirm(
        `Remove the verified benchmark for ${item.display_name || item.league_name}? Affected scores will require recalculation.`,
      )
    )
      return;
    try {
      await djmRpc("djm_intelligence_benchmark_delete", { p_id: item.id });
      setMessage(
        "Benchmark removed. No competition identity or player data was deleted.",
      );
      await load();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    }
  };

  const recalculate = async (id: string) => {
    try {
      const score: any = await djmRpc("djm_player_scorecard", {
        p_player_id: id,
      });
      setMessage(
        score?.status === "not_enough_benchmark_data"
          ? "Not enough benchmark data. No score was invented."
          : `Player Score result: ${statusLabel(score?.status)}.`,
      );
      await load();
    } catch (scoreError) {
      setError(friendlyError(scoreError));
    }
  };

  return (
    <DjmOsShell
      eyebrow="Evidence, provenance and freshness"
      title="Intelligence Data"
    >
      <div className={styles.toolbar}>
        <Link href="/brain" className="djm-os-secondary-button">
          <ArrowLeft size={15} /> Brain
        </Link>
        <button
          type="button"
          className="djm-os-secondary-button"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      ) : null}
      {message ? (
        <div className={styles.success} role="status">
          <Check size={16} />
          {message}
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <span>
            <ShieldCheck size={14} /> Trusted intelligence operations
          </span>
          <h2>Evidence first. DJM truth second.</h2>
          <p>
            Import licensed or authorised data, compare it with the current
            record, review conflicts and keep every score explainable.
          </p>
        </div>
        <div className={styles.heroRule}>
          <Database size={19} />
          <strong>Provider failure never changes canonical data</strong>
          <small>Career, CV, Market, Brain and Deals remain independent.</small>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Intelligence Data sections">
        {(
          [
            ["coverage", "Coverage", BarChart3],
            ["import", "Import evidence", Upload],
            [
              "review",
              `Review${data.suggestions?.length ? ` (${data.suggestions.length})` : ""}`,
              FileSearch,
            ],
            ["benchmarks", "Benchmarks", CircleGauge],
            ["runs", "Run history", History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            className={view === key ? styles.activeTab : ""}
            onClick={() => setView(key)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {view === "coverage" ? (
        <Coverage
          data={data}
          providers={providers}
          onRecalculate={recalculate}
        />
      ) : null}

      {view === "import" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <PanelHead
              kicker="MANUAL OR LICENSED EXPORT"
              title="Upload, map and preview"
              copy="Nothing applies on upload. Blank cells remain unknown, including blank goals or assists."
            />
            <div className={styles.form}>
              <label>
                Player
                <select
                  value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)}
                >
                  <option value="">Choose signed player</option>
                  {data.players?.map((player: any) => (
                    <option key={player.id} value={player.id}>
                      {player.player_name || "Unnamed player"}
                      {player.current_club ? `, ${player.current_club}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.formGrid}>
                <label>
                  Source name
                  <input
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                  />
                </label>
                <label>
                  Source URL, optional
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://"
                  />
                </label>
              </div>
              <label className={styles.fileButton}>
                <Upload size={16} />
                Choose CSV or JSON
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={(event) => void onFile(event)}
                />
              </label>
              <div className={styles.formatRow}>
                <button
                  type="button"
                  className={importFormat === "csv" ? styles.selected : ""}
                  onClick={() => setImportFormat("csv")}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className={importFormat === "json" ? styles.selected : ""}
                  onClick={() => setImportFormat("json")}
                >
                  JSON
                </button>
              </div>
              <label>
                Authorised data
                <textarea
                  rows={11}
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setPreview([]);
                  }}
                  placeholder={
                    importFormat === "csv"
                      ? "Season,Club,Competition,Country,Apps,Starts,Minutes,Goals,Assists,Source,URL"
                      : '[{"season_label":"2025/26","club_name":"Club"}]'
                  }
                />
              </label>
              <button
                type="button"
                className="djm-os-primary-button"
                onClick={parsePreview}
                disabled={!playerId || !importText.trim()}
              >
                Build preview
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <PanelHead
              kicker="DIFFERENCE REVIEW"
              title={
                selectedPlayer
                  ? `${selectedPlayer.player_name}, incoming seasons`
                  : "Choose a player"
              }
              copy="Current DJM truth and incoming evidence stay visibly separate."
            />
            {preview.length ? (
              <div className={styles.previewList}>
                {preview.map((record, index) => (
                  <SeasonPreview
                    key={`${record.season_label}-${record.club_name}-${index}`}
                    record={record}
                    current={matchingCareerRecord(selectedPlayer, record)}
                  />
                ))}
              </div>
            ) : (
              <Empty text="Parse a CSV or JSON export to inspect every incoming value before creating evidence." />
            )}
            {preview.length ? (
              <div className={styles.panelAction}>
                <button
                  type="button"
                  className="djm-os-primary-button"
                  onClick={() => void createEvidence()}
                  disabled={busy}
                >
                  Create evidence review
                </button>
                <small>Does not change the career record.</small>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {view === "review" ? (
        <section className={styles.panel}>
          <PanelHead
            kicker="HUMAN DECISION"
            title="Incoming evidence"
            copy="Accept applies the reviewed season. Reject, Keep current and Review later never alter canonical truth."
          />
          {data.suggestions?.length ? (
            <div className={styles.reviewList}>
              {data.suggestions.map((item: any) => (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onDecision={review}
                />
              ))}
            </div>
          ) : (
            <Empty text="No evidence is waiting for review." />
          )}
        </section>
      ) : null}

      {view === "benchmarks" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <PanelHead
              kicker="VERIFIED COMPETITION LEVEL"
              title={benchmark.id ? "Edit benchmark" : "Create benchmark"}
              copy="Competition identity and strength are separate. A source or evidence note is required."
            />
            <form className={styles.form} onSubmit={saveBenchmark}>
              <div className={styles.formGrid}>
                <label>
                  Competition
                  <input
                    required
                    value={benchmark.display_name}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        display_name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Country
                  <input
                    value={benchmark.country}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        country: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Gender
                  <select
                    value={benchmark.gender}
                    onChange={(event) =>
                      setBenchmark({ ...benchmark, gender: event.target.value })
                    }
                  >
                    <option value="male">Men</option>
                    <option value="female">Women</option>
                    <option value="">Not recorded</option>
                  </select>
                </label>
                <label>
                  Level / tier
                  <input
                    type="number"
                    min="1"
                    value={benchmark.level_tier}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        level_tier: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Strength score
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    value={benchmark.strength_score}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        strength_score: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Verified date
                  <input
                    required
                    type="date"
                    value={benchmark.verified_at}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        verified_at: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Review cadence, days
                  <input
                    type="number"
                    min="30"
                    max="1095"
                    value={benchmark.review_cadence_days}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        review_cadence_days: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Aliases
                  <input
                    value={benchmark.aliases}
                    onChange={(event) =>
                      setBenchmark({
                        ...benchmark,
                        aliases: event.target.value,
                      })
                    }
                    placeholder="A-League Men, A League"
                  />
                </label>
              </div>
              <label>
                Source URL
                <input
                  type="url"
                  value={benchmark.source_url}
                  onChange={(event) =>
                    setBenchmark({
                      ...benchmark,
                      source_url: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Evidence note
                <textarea
                  rows={4}
                  value={benchmark.source_note}
                  onChange={(event) =>
                    setBenchmark({
                      ...benchmark,
                      source_note: event.target.value,
                    })
                  }
                  placeholder="Method, comparison basis and reviewer context."
                />
              </label>
              <div className={styles.actions}>
                <button
                  className="djm-os-primary-button"
                  type="submit"
                  disabled={busy}
                >
                  <Save size={15} />
                  Save verified benchmark
                </button>
                {benchmark.id ? (
                  <button
                    type="button"
                    className="djm-os-secondary-button"
                    onClick={() => setBenchmark(EMPTY_BENCHMARK)}
                  >
                    <X size={15} />
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>
          <section className={styles.panel}>
            <PanelHead
              kicker="CURRENT BENCHMARKS"
              title={`${data.benchmarks?.length || 0} verified records`}
              copy="No benchmark is generated from a competition name."
            />
            {data.benchmarks?.length ? (
              <div className={styles.benchmarkList}>
                {data.benchmarks.map((item: any) => (
                  <BenchmarkCard
                    item={item}
                    key={item.id}
                    onEdit={editBenchmark}
                    onDelete={deleteBenchmark}
                  />
                ))}
              </div>
            ) : (
              <Empty text="No league benchmark exists yet. Not enough benchmark data is the correct Player Score state." />
            )}
          </section>
        </div>
      ) : null}

      {view === "runs" ? <Runs runs={data.runs || []} /> : null}
    </DjmOsShell>
  );
}

function Coverage({
  data,
  providers,
  onRecalculate,
}: {
  data: any;
  providers: any[];
  onRecalculate: (id: string) => Promise<void>;
}) {
  return (
    <>
      <section className={styles.metrics}>
        {METRICS.map(([key, label]) => (
          <article key={key}>
            <strong>{Number(data.metrics?.[key] || 0)}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <PanelHead
            kicker="PROVIDER CAPABILITY"
            title="Connected without dependency"
            copy="Capability is explicit. Reference-only and disabled providers are never called."
          />
          <div className={styles.providerList}>
            {providers.map((provider) => (
              <article key={provider.provider}>
                <div>
                  <strong>{title(provider.provider)}</strong>
                  <span
                    className={`${styles.badge} ${styles[provider.capability]}`}
                  >
                    {provider.label}
                  </span>
                </div>
                <p>{provider.reason}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.panel}>
          <PanelHead
            kicker="INTELLIGENCE GAP QUEUE"
            title="Highest-impact missing evidence"
            copy="Each gap explains what it blocks and the next useful action."
          />
          {data.gaps?.length ? (
            <div className={styles.gapList}>
              {data.gaps.map((gap: any, index: number) => (
                <article key={`${gap.player_id}-${gap.missing}-${index}`}>
                  <span className={styles.priority}>{gap.priority}</span>
                  <div>
                    <strong>{gap.player_name || "Player record"}</strong>
                    <h3>{gap.missing}</h3>
                    <p>{gap.why}</p>
                    <small>Blocks: {gap.blocks}</small>
                    <div className={styles.actions}>
                      {gap.action === "Recalculate the Player Score" ? (
                        <button
                          type="button"
                          onClick={() => void onRecalculate(gap.player_id)}
                        >
                          Recalculate
                        </button>
                      ) : (
                        <Link href={`/admin/players/${gap.player_id}`}>
                          {gap.action}
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="No high-impact intelligence gaps are currently queued." />
          )}
        </section>
      </div>
    </>
  );
}

function SeasonPreview({
  record,
  current,
}: {
  record: NormalisedSeasonRecord;
  current: NormalisedSeasonRecord | null;
}) {
  const facts = buildEvidencePreview(current, record);
  return (
    <article className={styles.seasonPreview}>
      <header>
        <div>
          <span>{record.season_label || "Season unknown"}</span>
          <strong>{record.club_name || "Club unknown"}</strong>
        </div>
        <span className={styles.badge}>Incoming evidence</span>
      </header>
      <div>
        {facts.map((fact) => (
          <p key={fact.field}>
            <span>{title(fact.field)}</span>
            <strong>{display(fact.incomingValue)}</strong>
          </p>
        ))}
      </div>
    </article>
  );
}

function SuggestionCard({
  item,
  busy,
  onDecision,
}: {
  item: any;
  busy: boolean;
  onDecision: (
    id: string,
    decision: "accepted" | "rejected" | "kept_current" | "review_later",
  ) => Promise<void>;
}) {
  const incoming = item.suggested_value || {};
  const current = item.current_value || null;
  const facts = buildEvidencePreview(current, incoming);
  return (
    <article className={styles.suggestion}>
      <header>
        <div>
          <span>{item.player_name}</span>
          <strong>
            {incoming.season_label || "Season"} at{" "}
            {incoming.club_name || "club not recorded"}
          </strong>
        </div>
        <span className={styles.badge}>
          {item.freshness_state || "unknown"} freshness
        </span>
      </header>
      <div className={styles.comparison}>
        {facts.map((fact) => (
          <div
            key={fact.field}
            className={fact.conflict ? styles.conflict : ""}
          >
            <span>{title(fact.field)}</span>
            <p>
              <small>DJM</small>
              <strong>{display(fact.currentValue)}</strong>
            </p>
            <p>
              <small>Incoming</small>
              <strong>{display(fact.incomingValue)}</strong>
            </p>
          </div>
        ))}
      </div>
      <footer>
        <p>
          <strong>Source:</strong> {item.source_name || "Not recorded"}{" "}
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noreferrer">
              Open <ExternalLink size={12} />
            </a>
          ) : null}
          <small>
            Observed{" "}
            {compactDateTime(item.evidence_observed_at || item.observed_at)}
          </small>
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={busy}
            className={styles.accept}
            onClick={() => void onDecision(item.id, "accepted")}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecision(item.id, "rejected")}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecision(item.id, "kept_current")}
          >
            Keep current
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDecision(item.id, "review_later")}
          >
            Review later
          </button>
        </div>
      </footer>
    </article>
  );
}

function BenchmarkCard({
  item,
  onEdit,
  onDelete,
}: {
  item: any;
  onEdit: (item: any) => void;
  onDelete: (item: any) => Promise<void>;
}) {
  return (
    <article>
      <header>
        <div>
          <span>{item.country || "Country not recorded"}</span>
          <strong>{item.display_name || item.league_name}</strong>
        </div>
        <div className={styles.score}>{item.strength_score}</div>
      </header>
      <div className={styles.benchmarkFacts}>
        <p>
          <span>Meaning</span>
          <strong>Verified DJM competition-level input</strong>
        </p>
        <p>
          <span>Freshness</span>
          <strong>{title(item.freshness)}</strong>
        </p>
        <p>
          <span>Verified</span>
          <strong>
            {item.verified_at
              ? compactDateTime(item.verified_at)
              : "Not verified"}
          </strong>
        </p>
        <p>
          <span>Updated by</span>
          <strong>{item.updated_by_name || "DJM staff"}</strong>
        </p>
      </div>
      <p className={styles.sourceNote}>
        {item.source_note || "Source note not recorded."}
      </p>
      {item.source_url ? (
        <a href={item.source_url} target="_blank" rel="noreferrer">
          Open evidence <ExternalLink size={12} />
        </a>
      ) : null}
      <footer className={styles.actions}>
        <button type="button" onClick={() => onEdit(item)}>
          Edit
        </button>
        <button type="button" onClick={() => void onDelete(item)}>
          Delete
        </button>
      </footer>
    </article>
  );
}

function Runs({ runs }: { runs: any[] }) {
  return (
    <section className={styles.panel}>
      <PanelHead
        kicker="AUDIT TRAIL"
        title="Ingestion runs"
        copy="Fetched, reviewed, accepted, rejected, applied and failed states remain visible."
      />
      {runs.length ? (
        <div className={styles.runList}>
          {runs.map((run) => (
            <article key={run.id}>
              <div>
                <span className={`${styles.badge} ${styles[run.status] || ""}`}>
                  {title(run.status)}
                </span>
                <strong>{run.player_name}</strong>
                <p>
                  {title(run.provider || run.source)} · {title(run.mode)}
                </p>
              </div>
              <div>
                <strong>{run.facts_discovered || 0} facts</strong>
                <span>
                  {run.accepted_count || 0} accepted · {run.rejected_count || 0}{" "}
                  rejected
                </span>
                <small>{compactDateTime(run.requested_at)}</small>
              </div>
              {run.error_text ? (
                <p className={styles.runError}>{run.error_text}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <Empty text="No source refresh has been run yet." />
      )}
    </section>
  );
}

function PanelHead({
  kicker,
  title: heading,
  copy,
}: {
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <header className={styles.panelHead}>
      <span>{kicker}</span>
      <h2>{heading}</h2>
      <p>{copy}</p>
    </header>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <Database size={23} />
      <p>{text}</p>
    </div>
  );
}
function numberOrNull(value: any) {
  return value === "" || value == null ? null : Number(value);
}
function matchingCareerRecord(player: any, record: NormalisedSeasonRecord) {
  const current = (player?.career_entries || []).find(
    (entry: any) =>
      String(entry.season_label || '').toLowerCase() ===
        String(record.season_label || '').toLowerCase() &&
      String(entry.club_name || '').toLowerCase() ===
        String(record.club_name || '').toLowerCase(),
  );
  return current || null;
}
function commaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function display(value: unknown) {
  return value == null || value === "" ? "Unknown" : String(value);
}
function title(value: unknown) {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function statusLabel(value: unknown) {
  return title(value || "insufficient data");
}
