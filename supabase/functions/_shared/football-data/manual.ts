import { normaliseSeason } from "./normalise.ts";
import { payloadHash } from "./provenance.ts";
import type { ProviderPreview } from "./types.ts";

export const manualPreview = async (
  records: Record<string, unknown>[],
  sourceName: string,
  sourceUrl: string | null,
): Promise<ProviderPreview> => {
  const seasonRecords = records
    .map((record) => normaliseSeason(record, sourceName, sourceUrl))
    .filter((record) => record.season_label && record.club_name);

  return {
    provider: "manual",
    capability: "manual_import",
    source_name: sourceName,
    source_reference: null,
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
    provider_version: "manual-v1",
    player: {},
    season_records: seasonRecords,
    recent_matches: [],
    warnings:
      seasonRecords.length === records.length
        ? []
        : ["Rows without both a season and club were excluded from preview."],
    confidence: 1,
    license_mode: "manual_import",
    raw_payload_retention: "normalised_only",
    payload_hash: await payloadHash(records),
    request_metadata: { received_records: records.length },
  };
};
