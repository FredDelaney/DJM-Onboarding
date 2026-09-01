"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  FileUp,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { compactDateTime, djmInvoke, friendlyError } from "@/lib/djm-os";
import {
  isTransfermarktUrl,
  normaliseWebUrl,
  researchSourceLabel,
} from "@/lib/research-links";
import { supabase } from "@/lib/supabase";

import styles from "./PlayerConnectionHub.module.css";

type PlayerRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  current_club?: string | null;
  current_league?: string | null;
  primary_position?: string | null;
  transfermarkt_url?: string | null;
  wyscout_url?: string | null;
  stats_url?: string | null;
  instagram_url?: string | null;
  football_provider_ids?: Record<string, unknown> | null;
};

type SourceField =
  | "transfermarkt_url"
  | "wyscout_url"
  | "stats_url"
  | "instagram_url";

const SOURCE_FIELDS: Array<{
  field: SourceField;
  label: string;
}> = [
  { field: "transfermarkt_url", label: "Transfermarkt" },
  { field: "wyscout_url", label: "Wyscout" },
  { field: "stats_url", label: "Stats" },
  { field: "instagram_url", label: "Instagram" },
];

function sourceField(url: string): SourceField | null {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "transfermarkt.com" || hostname.endsWith(".transfermarkt.com")) {
    return "transfermarkt_url";
  }
  if (hostname === "wyscout.com" || hostname.endsWith(".wyscout.com")) {
    return "wyscout_url";
  }
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return "instagram_url";
  }
  if (
    [
      "sofascore.com",
      "fotmob.com",
      "fbref.com",
      "soccerway.com",
      "statsbomb.com",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return "stats_url";
  }
  return null;
}

function isDirectTransfermarktPlayerUrl(url: string) {
  if (!isTransfermarktUrl(url)) return false;
  return /\/profil\/spieler\/\d+\/?$/i.test(new URL(url).pathname);
}

function playerName(player: PlayerRecord) {
  return (
    player.preferred_name ||
    [player.first_name, player.last_name].filter(Boolean).join(" ") ||
    "Player"
  );
}

export default function PlayerConnectionHub({
  player,
  documentCount,
  lastSyncedAt,
  busy = false,
  onPlayerChange,
  onUploadDocument,
}: {
  player: PlayerRecord;
  documentCount: number;
  lastSyncedAt?: string | null;
  busy?: boolean;
  onPlayerChange: (player: PlayerRecord) => void;
  onUploadDocument: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [providerSync, setProviderSync] = useState<string | null>(
    lastSyncedAt || null,
  );
  const [syncKnown, setSyncKnown] = useState(Boolean(lastSyncedAt));
  const autoRefreshAttempted = useRef(false);

  const connectedSources = useMemo(
    () =>
      SOURCE_FIELDS.filter(({ field }) => Boolean(player[field])).map(
        ({ field, label }) => ({
          field,
          label:
            field === "stats_url"
              ? researchSourceLabel(player[field], label)
              : label,
          href: normaliseWebUrl(player[field]),
        }),
      ),
    [player],
  );

  const providerCount = Object.values(player.football_provider_ids || {}).filter(
    Boolean,
  ).length;
  const identityReady = Boolean(
    player.first_name &&
      player.last_name &&
      player.primary_position &&
      player.current_club,
  );
  const connectionReady = connectedSources.length > 0;

  const refresh = useCallback(async (
    mode: "manual" | "background" | "source" = "manual",
  ) => {
    setRefreshing(true);
    setError("");
    if (mode === "manual") setMessage("");

    try {
      const result: any = await djmInvoke("refresh-player-stats-free", {
  player_id: player.id,
});
      if (!result?.ok) {
        throw new Error(result?.error || "No provider supplied new player data.");
      }
      setMessage(
        result?.message ||
          "Free-source player stats refreshed across DJM.",
      );
      setProviderSync(new Date().toISOString());
    } catch (refreshError) {
      const detail = friendlyError(refreshError);
      if (mode === "source") {
        setMessage(
          `Source saved across DJM. Free stats refresh needs review: ${detail}`,
        );
      } else if (mode === "background") {
        setMessage(`Free stats refresh needs review: ${detail}`);
      } else {
        setError(detail);
      }
    } finally {
      setRefreshing(false);
    }
  }, [player.id]);

  useEffect(() => {
    let active = true;
    void supabase
      .schema("djm_os")
      .from("player_provider_stat_snapshots")
      .select("synced_at")
      .eq("player_id", player.id)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProviderSync(data?.synced_at || lastSyncedAt || null);
        setSyncKnown(true);
      });

    return () => {
      active = false;
    };
  }, [lastSyncedAt, player.id]);

  useEffect(() => {
    if (!syncKnown || autoRefreshAttempted.current) return;

    const lastSync = providerSync ? new Date(providerSync).getTime() : 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (lastSync && lastSync > sevenDaysAgo) return;

    autoRefreshAttempted.current = true;
    void refresh("background");
  }, [providerSync, refresh, syncKnown]);

  const connectSource = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const url = normaliseWebUrl(sourceUrl);
    if (!url) {
      setError("Paste a complete, safe player profile URL.");
      return;
    }

    const field = sourceField(url);
    if (!field) {
      setError(
        "Use a Transfermarkt, Wyscout, Sofascore, FotMob, FBref, Soccerway, StatsBomb or Instagram player link.",
      );
      return;
    }

    if (field === "transfermarkt_url" && !isDirectTransfermarktPlayerUrl(url)) {
      setError("Use a direct Transfermarkt player profile URL.");
      return;
    }

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase
        .from("players")
        .update({ [field]: url })
        .eq("id", player.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      onPlayerChange(data as PlayerRecord);
      setSourceUrl("");

      const label =
        field === "stats_url"
          ? researchSourceLabel(url, "Stats profile")
          : SOURCE_FIELDS.find((item) => item.field === field)?.label ||
            "Player source";
      setMessage(`${label} connected to ${playerName(player)} across DJM.`);

      if (field !== "instagram_url") {
        await refresh("source");
      }
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="connected-player"
      className={styles.hub}
      aria-labelledby="player-connection-title"
    >
      <div className={styles.heading}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>
            <DatabaseZap size={14} /> Connected player
          </span>
          <h2 id="player-connection-title">One record. Everything attached.</h2>
          <p>
            Paste one trusted profile link or upload a file. DJM attaches it to
            this player everywhere, refreshes free permitted data sources and only asks
            for review when evidence conflicts.
          </p>
        </div>

        <div className={styles.health} aria-label="Player connection status">
          <strong>{identityReady && connectionReady ? "Connected" : "Set up"}</strong>
          <span>
            {connectedSources.length} source{connectedSources.length === 1 ? "" : "s"}
            {providerCount ? `, ${providerCount} provider ID${providerCount === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      </div>

      <div className={styles.workflow}>
        <form className={styles.connectForm} onSubmit={connectSource}>
          <label htmlFor="connected-player-source">Connect a player profile</label>
          <div>
            <Link2 size={17} aria-hidden />
            <input
              id="connected-player-source"
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Paste Transfermarkt, Wyscout, Sofascore or another supported link"
            />
            <button type="submit" disabled={!sourceUrl.trim() || saving || refreshing}>
              {saving ? "Connecting..." : "Connect and refresh"}
            </button>
          </div>
          <small>
            Transfermarkt is stored as a research reference. Current statistics
            come from permitted provider integrations and reviewed DJM evidence.
          </small>
        </form>

        <div className={styles.actions}>
          <label className={busy ? styles.disabled : ""}>
            <FileUp size={17} />
            <span>
              <strong>{busy ? "Uploading..." : "Upload player file"}</strong>
              <small>Attached privately to this player</small>
            </span>
            <input
              type="file"
              hidden
              disabled={busy}
              onChange={onUploadDocument}
            />
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || saving}
          >
            <RefreshCw size={17} className={refreshing ? styles.spin : ""} />
            <span>
              <strong>{refreshing ? "Refreshing stats..." : "Refresh free stats"}</strong>
              <small>
                {providerSync
                  ? `Last provider sync ${compactDateTime(providerSync)}`
                  : "Checks free permitted sources first"}
              </small>
            </span>
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {message ? <div className={styles.message}>{message}</div> : null}

      <div className={styles.statusRow}>
        <StatusItem
          ready={identityReady}
          title="Identity"
          detail={identityReady ? "Core football profile ready" : "Complete name, role and club"}
        />
        <StatusItem
          ready={connectionReady}
          title="Sources"
          detail={
            connectionReady
              ? connectedSources.map((source) => source.label).join(", ")
              : "Connect one trusted profile"
          }
        />
        <StatusItem
          ready={providerCount > 0 || Boolean(providerSync)}
          title="Weekly data"
          detail={
            providerSync
              ? "Refreshes automatically when this record is opened"
              : "First permitted provider refresh starts automatically"
          }
        />
        <StatusItem
          ready={documentCount > 0}
          title="Files"
          detail={`${documentCount} private document${documentCount === 1 ? "" : "s"}`}
        />
      </div>

      {connectedSources.length ? (
        <div className={styles.sources}>
          {connectedSources.map((source) =>
            source.href ? (
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                key={source.field}
              >
                <ShieldCheck size={14} /> {source.label}
                <ExternalLink size={13} />
              </a>
            ) : null,
          )}
        </div>
      ) : null}
    </section>
  );
}

function StatusItem({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className={ready ? styles.ready : ""}>
      <CheckCircle2 size={16} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
