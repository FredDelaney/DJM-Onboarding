"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileUp,
  ShieldCheck,
} from "lucide-react";

import DjmOsShell from "@/components/DjmOsShell";
import {
  OPTA_LEAGUE_BENCHMARK_METHOD,
  OPTA_LEAGUE_BENCHMARK_REFERENCE_URL,
  parseBenchmarkCsv,
  parseBenchmarkJson,
  type BenchmarkImportRecord,
} from "@/lib/benchmark-data";
import { djmRpc, friendlyError } from "@/lib/djm-os";

import styles from "./page.module.css";

const sample = `Competition,Country,Strength,Aliases,Tier,Note\n`;

export default function BenchmarkImportPage() {
  const [data, setData] = useState<any>({ gaps: [], benchmarks: [] });
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [sourceName, setSourceName] = useState("Opta Power Rankings reviewed import");
  const [sourceUrl, setSourceUrl] = useState(OPTA_LEAGUE_BENCHMARK_REFERENCE_URL);
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [input, setInput] = useState(sample);
  const [preview, setPreview] = useState<BenchmarkImportRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result: any = await djmRpc("djm_intelligence_data");
      setData(result || {});
    } catch (loadError) {
      setError(friendlyError(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missing = useMemo(
    () =>
      (data.gaps || []).filter((gap: any) =>
        String(gap.missing || "").toLowerCase().includes("benchmark"),
      ),
    [data.gaps],
  );

  const buildPreview = () => {
    setError("");
    setMessage("");
    try {
      const records = format === "json" ? parseBenchmarkJson(input) : parseBenchmarkCsv(input);
      setPreview(records);
    } catch (parseError) {
      setPreview([]);
      setError(friendlyError(parseError));
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Use a CSV or JSON file smaller than 1 MB.");
      return;
    }
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setInput(await file.text());
    setPreview([]);
  };

  const apply = async () => {
    if (!preview.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result: any = await djmRpc("djm_intelligence_benchmark_import", {
        p_source_name: sourceName.trim(),
        p_source_url: sourceUrl.trim(),
        p_observed_at: new Date(`${observedAt}T12:00:00Z`).toISOString(),
        p_records: preview,
      });
      setMessage(
        `${result?.imported || preview.length} verified benchmark${(result?.imported || preview.length) === 1 ? "" : "s"} saved. Blocked Player Scores can now be recalculated.`,
      );
      setPreview([]);
      setInput(sample);
      await load();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DjmOsShell eyebrow="Competition strength with provenance" title="Benchmark Acquisition">
      <div className={styles.toolbar}>
        <Link href="/brain/data" className="djm-os-secondary-button">
          <ArrowLeft size={15} /> Intelligence Data
        </Link>
        <a
          className="djm-os-secondary-button"
          href={OPTA_LEAGUE_BENCHMARK_REFERENCE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open Opta methodology <ExternalLink size={14} />
        </a>
      </div>

      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}
      {message ? (
        <div className={styles.success} role="status">
          <CheckCircle2 size={16} /> {message}
        </div>
      ) : null}

      <section className={styles.hero}>
        <div>
          <span>BENCHMARK ACQUISITION</span>
          <h2>Missing benchmark should be a task, not a dead end.</h2>
          <p>
            DJM keeps competition strength source-backed. Opta Power Rankings is the preferred global methodology when DJM has licensed data or a reviewed authorised import. The application does not scrape the public site.
          </p>
        </div>
        <div className={styles.rule}>
          <ShieldCheck size={20} />
          <strong>League average, 0-100</strong>
          <p>{OPTA_LEAGUE_BENCHMARK_METHOD}</p>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <header>
            <span>BLOCKED INTELLIGENCE</span>
            <h2>{missing.length} benchmark gap{missing.length === 1 ? "" : "s"}</h2>
            <p>These players already have enough recent evidence or need only a competition benchmark to unlock the model.</p>
          </header>
          {missing.length ? (
            <div className={styles.gaps}>
              {missing.map((gap: any, index: number) => (
                <article key={`${gap.player_id}-${gap.competition_name || index}`}>
                  <div>
                    <strong>{gap.competition_name || "Competition unresolved"}</strong>
                    <span>{gap.player_name || "Player"}</span>
                  </div>
                  <p>{gap.why}</p>
                  <small>Recommended source: {gap.recommended_source || "Verified competition evidence"}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>No benchmark-only Player Score gaps are currently queued.</div>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <span>REVIEWED IMPORT</span>
            <h2>Bring in defensible league strength</h2>
            <p>Nothing here guesses a score. Every row must carry a source and an observed date.</p>
          </header>
          <div className={styles.form}>
            <label>
              Source name
              <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
            </label>
            <label>
              Source URL
              <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
            </label>
            <label>
              Observed / verified date
              <input type="date" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} />
            </label>
            <label className={styles.fileButton}>
              <FileUp size={16} /> Choose CSV or JSON
              <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void onFile(event)} />
            </label>
            <div className={styles.formatRow}>
              <button type="button" className={format === "csv" ? styles.active : ""} onClick={() => setFormat("csv")}>CSV</button>
              <button type="button" className={format === "json" ? styles.active : ""} onClick={() => setFormat("json")}>JSON</button>
            </div>
            <label>
              Benchmark data
              <textarea
                rows={10}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setPreview([]);
                }}
              />
            </label>
            <button type="button" className="djm-os-primary-button" onClick={buildPreview} disabled={!input.trim()}>
              Build preview
            </button>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <header>
          <span>PREVIEW</span>
          <h2>{preview.length ? `${preview.length} benchmark rows ready for review` : "No benchmark rows parsed yet"}</h2>
          <p>Raw decimals are preserved. DJM rounds only the effective Player Score benchmark to the nearest integer.</p>
        </header>
        {preview.length ? (
          <>
            <div className={styles.preview}>
              {preview.map((record, index) => (
                <article key={`${record.competition}-${record.country || ""}-${index}`}>
                  <div>
                    <span>{record.country || "Country not recorded"}</span>
                    <strong>{record.competition}</strong>
                  </div>
                  <div className={styles.score}>
                    <small>Raw</small>
                    <strong>{record.raw_strength_value}</strong>
                  </div>
                  <div className={styles.score}>
                    <small>Effective</small>
                    <strong>{record.strength_score}</strong>
                  </div>
                  <p>{record.note || OPTA_LEAGUE_BENCHMARK_METHOD}</p>
                </article>
              ))}
            </div>
            <div className={styles.applyRow}>
              <div>
                <strong>Source: {sourceName || "Required"}</strong>
                <span>{sourceUrl || "Source URL required"}</span>
              </div>
              <button
                type="button"
                className="djm-os-primary-button"
                onClick={() => void apply()}
                disabled={busy || !sourceName.trim() || !sourceUrl.trim() || !observedAt}
              >
                {busy ? "Saving..." : "Save verified benchmarks"}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.empty}>Paste or upload an authorised benchmark dataset, then build the preview.</div>
        )}
      </section>
    </DjmOsShell>
  );
}
