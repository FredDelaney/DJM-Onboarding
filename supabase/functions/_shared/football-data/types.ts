export type ProviderCapability =
  "licensed_api" | "manual_import" | "reference_only" | "disabled";

export type NormalisedSeason = {
  season_label: string | null;
  club_name: string | null;
  league: string | null;
  country: string | null;
  appearances: number | null;
  starts: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  source_name: string;
  source_url: string | null;
  provider_competition_id?: string | null;
  provider_season_id?: string | null;
};

export type ProviderPreview = {
  provider: string;
  capability: ProviderCapability;
  source_name: string;
  source_reference: string | null;
  source_url: string | null;
  fetched_at: string;
  provider_version: string | null;
  player: Record<string, unknown>;
  season_records: NormalisedSeason[];
  recent_matches: Record<string, unknown>[];
  warnings: string[];
  confidence: number | null;
  license_mode: ProviderCapability;
  raw_payload_retention: "none" | "hash_only" | "normalised_only";
  payload_hash: string | null;
  request_metadata: Record<string, unknown>;
};

export type ProviderContext = {
  sourceReference?: string | null;
  sourceUrl?: string | null;
};
