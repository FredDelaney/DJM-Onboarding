import type { ProviderCapability } from "./types.ts";

export type ProviderStatus = {
  provider: "wyscout" | "manual" | "transfermarkt" | "sofascore";
  capability: ProviderCapability;
  configured: boolean;
  label: string;
  reason: string;
};

const enabled = (value: string | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase() === "true";

export const providerStatuses = (): ProviderStatus[] => {
  const wyscoutConfigured =
    enabled(Deno.env.get("DJM_WYSCOUT_API_ENABLED")) &&
    Boolean(Deno.env.get("WYSCOUT_API_USERNAME")) &&
    Boolean(Deno.env.get("WYSCOUT_API_PASSWORD"));

  return [
    {
      provider: "wyscout",
      capability: wyscoutConfigured ? "licensed_api" : "disabled",
      configured: wyscoutConfigured,
      label: wyscoutConfigured ? "Licensed API" : "API not configured",
      reason: wyscoutConfigured
        ? "Server-side credentials and explicit enable flag are present."
        : "Add licensed server-side credentials and explicitly enable the adapter.",
    },
    {
      provider: "manual",
      capability: "manual_import",
      configured: true,
      label: "CSV or JSON import",
      reason:
        "Authorised exports are parsed into evidence and require review before application.",
    },
    {
      provider: "transfermarkt",
      capability: "reference_only",
      configured: true,
      label: "Reference only",
      reason:
        "Links and reviewed manual values remain available. Automated scraping is disabled.",
    },
    {
      provider: "sofascore",
      capability: "disabled",
      configured: false,
      label: "No licensed integration configured",
      reason:
        "Saved reference links remain usable without automated ingestion.",
    },
  ];
};

export const providerStatus = (provider: string) =>
  providerStatuses().find((item) => item.provider === provider);
