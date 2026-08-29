"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Database, RefreshCw, Save, ShieldCheck } from "lucide-react";

import DjmOsShell from "@/components/DjmOsShell";
import { compactDateTime, djmRpc, friendlyError } from "@/lib/djm-os";

import styles from "./page.module.css";

const EMPTY = {
  season_label: "",
  position_group: "",
  evidence_date: new Date().toISOString().slice(0, 10),
  minutes: "",
  starts: "",
  appearances: "",
  possible_minutes: "",
  overall_performance_percentile: "",
  attacking_percentile: "",
  creativity_percentile: "",
  progression_percentile: "",
  possession_percentile: "",
  defending_percentile: "",
  aerial_percentile: "",
  goalkeeping_percentile: "",
  physical_percentile: "",
  discipline_percentile: "",
  peer_group_description: "",
  provider: "manual_authorised",
  source_name: "Authorised Wyscout or scouting export",
  source_url: "",
  source_reference: "",
  observed_at: new Date().toISOString().slice(0, 10),
  verified_at: new Date().toISOString().slice(0, 10),
  confidence: "1",
};

const PERCENTILES = [
  ["overall_performance_percentile", "Overall position percentile"],
  ["attacking_percentile", "Attacking"],
  ["creativity_percentile", "Creativity"],
  ["progression_percentile", "Progression"],
  ["possession_percentile", "Possession"],
  ["defending_percentile", "Defending"],
  ["aerial_percentile", "Aerial"],
  ["goalkeeping_percentile", "Goalkeeping"],
  ["physical_percentile", "Physical"],
  ["discipline_percentile", "Discipline"],
] as const;

export default function PlayerPerformancePage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [data, setData] = useState<any>({ player: null, snapshots: [], scorecard: null });
  const [form, setForm] = useState<any>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPlayer = useCallback(async (id: string) => {
    if (!id) return;
    const result: any = await djmRpc("djm_player_performance_data", { p_player_id: id });
    setData(result || {});
    setForm((current: any) => ({
      ...current,
      position_group: current.position_group || result?.player?.position_group || "",
    }));
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("player") || "";
    setPlayerId(id);
    void (async () => {
      try {
        const intelligence: any = await djmRpc("djm_intelligence_data");
        setPlayers(intelligence?.players || []);
        if (id) await loadPlayer(id);
      } catch (e) {
        setError(friendlyError(e));
      }
    })();
  }, [loadPlayer]);

  const selected = useMemo(
    () => players.find((player) => player.id === playerId),
    [players, playerId],
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!playerId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const snapshot = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          value === "" ? null : ["evidence_date", "observed_at", "verified_at"].includes(key)
            ? key === "evidence_date"
              ? value
              : new Date(`${value}T12:00:00Z`).toISOString()
            : value,
        ]),
      );
      await djmRpc("djm_player_performance_snapshot_upsert", {
        p_player_id: playerId,
        p_snapshot: snapshot,
      });
      const score: any = await djmRpc("djm_player_scorecard", { p_player_id: playerId });
      setMessage(
        score?.status === "calculated"
          ? `Performance evidence saved. Player Score recalculated to ${score.model_score}.`
          : `Performance evidence saved. Player Score status: ${String(score?.status || "not calculated").replaceAll("_", " ")}.`,
      );
      setForm({ ...EMPTY, position_group: data?.player?.position_group || form.position_group });
      await loadPlayer(playerId);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DjmOsShell eyebrow="Position-adjusted evidence" title="Player Performance">
      <div className={styles.toolbar}>
        <Link href="/brain/data" className="djm-os-secondary-button"><ArrowLeft size={15} /> Intelligence Data</Link>
        {playerId ? <button type="button" className="djm-os-secondary-button" onClick={() => void loadPlayer(playerId)} disabled={busy}><RefreshCw size={15} /> Refresh</button> : null}
      </div>

      {error ? <div className="djm-os-error" role="alert">{error}</div> : null}
      {message ? <div className={styles.success}><Check size={16} /> {message}</div> : null}

      <section className={styles.hero}>
        <div>
          <span><ShieldCheck size={14} /> PLAYER SCORE V2</span>
          <h2>Compare footballers against the right peers.</h2>
          <p>Use verified percentiles from an authorised dataset. A winger is not scored like a centre-back, and raw goals are never treated as a universal ability metric.</p>
        </div>
        <div className={styles.rule}><Database size={18} /><strong>No peer group, no performance score.</strong><small>Record exactly what population the percentile represents.</small></div>
      </section>

      <section className={styles.playerSelect}>
        <label>Player
          <select value={playerId} onChange={(e) => { setPlayerId(e.target.value); if (e.target.value) void loadPlayer(e.target.value); }}>
            <option value="">Choose signed player</option>
            {players.map((player) => <option key={player.id} value={player.id}>{player.player_name || "Unnamed player"}</option>)}
          </select>
        </label>
        {selected || data?.player ? <div><strong>{data?.player?.name || selected?.player_name}</strong><span>{data?.player?.primary_position || "Position not recorded"} / {data?.player?.position_group || "UNKNOWN"}</span></div> : null}
      </section>

      {playerId ? <div className={styles.grid}>
        <section className={styles.panel}>
          <header><span>VERIFIED SNAPSHOT</span><h2>Add performance evidence</h2><p>Overall percentile can be supplied directly. Otherwise enter enough position categories for DJM to calculate a transparent weighted performance score.</p></header>
          <form className={styles.form} onSubmit={save}>
            <div className={styles.two}>
              <label>Season<input value={form.season_label} onChange={(e) => setForm({ ...form, season_label: e.target.value })} placeholder="2026" /></label>
              <label>Position group<select required value={form.position_group} onChange={(e) => setForm({ ...form, position_group: e.target.value })}><option value="">Choose</option>{["GK","CB","FB_WB","DM","CM","AM","W","ST","UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Evidence date<input required type="date" value={form.evidence_date} onChange={(e) => setForm({ ...form, evidence_date: e.target.value })} /></label>
              <label>Peer group<input required value={form.peer_group_description} onChange={(e) => setForm({ ...form, peer_group_description: e.target.value })} placeholder="Wingers, same competition and season, minimum 450 mins" /></label>
            </div>
            <div className={styles.four}>
              {[["minutes","Minutes"],["starts","Starts"],["appearances","Apps"],["possible_minutes","Possible mins"]].map(([key,label]) => <label key={key}>{label}<input type="number" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
            </div>
            <div className={styles.percentiles}>
              {PERCENTILES.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="100" step="0.1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
            </div>
            <div className={styles.two}>
              <label>Provider<input required value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></label>
              <label>Source name<input required value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} /></label>
              <label>Source URL<input type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://" /></label>
              <label>Source reference<input value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} /></label>
              <label>Observed date<input required type="date" value={form.observed_at} onChange={(e) => setForm({ ...form, observed_at: e.target.value })} /></label>
              <label>Verified date<input required type="date" value={form.verified_at} onChange={(e) => setForm({ ...form, verified_at: e.target.value })} /></label>
              <label>Confidence 0-1<input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} /></label>
            </div>
            <button className="djm-os-primary-button" type="submit" disabled={busy}><Save size={15} /> Save verified performance</button>
          </form>
        </section>

        <section className={styles.panel}>
          <header><span>EVIDENCE HISTORY</span><h2>{data?.snapshots?.length || 0} performance snapshots</h2><p>Recent evidence carries more weight. Anything older than 24 months has zero current-level weight, although older verified career history can still contribute weakly to experience.</p></header>
          <div className={styles.list}>
            {(data?.snapshots || []).map((item: any) => <article key={item.id}><div><strong>{item.season_label || compactDateTime(item.observed_at)}</strong><span>{item.position_group} / {item.peer_group_description}</span></div><div><strong>{item.overall_performance_percentile ?? "Category model"}</strong><span>{item.source_name}</span></div></article>)}
            {!data?.snapshots?.length ? <p className={styles.empty}>No verified position-adjusted performance data yet.</p> : null}
          </div>
        </section>
      </div> : null}
    </DjmOsShell>
  );
}
