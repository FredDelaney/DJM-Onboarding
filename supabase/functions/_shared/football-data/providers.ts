import type { ProviderCapability } from "./types.ts";

export type ProviderStatus = {
  provider: "api_football" | "wyscout" | "manual" | "transfermarkt" | "sofascore";
  capability: ProviderCapability;
  configured: boolean;
  label: string;
  reason: string;
};

const enabled = (value: string | undefined) =>
  String(value || "").trim().toLowerCase() === "true";

export const providerStatuses = (): ProviderStatus[] => {
  const apiFootballConfigured = Boolean(String(Deno.env.get("API_FOOTBALL_KEY") || "").trim());
  const wyscoutConfigured =
    enabled(Deno.env.get("DJM_WYSCOUT_API_ENABLED")) &&
    Boolean(Deno.env.get("WYSCOUT_API_USERNAME")) &&
    Boolean(Deno.env.get("WYSCOUT_API_PASSWORD"));

  return [
    {
      provider: "api_football",
      capability: apiFootballConfigured ? "licensed_api" : "disabled",
      configured: apiFootballConfigured,
      label: apiFootballConfigured ? "Free API connected" : "Free API key not configured",
      reason: apiFootballConfigured
        ? "DJM can refresh player profiles and season statistics from the API-Football free plan."
        : "Create a free API-Football account and add its server-side API key as API_FOOTBALL_KEY.",
    },
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
      label: "Authorised import",
      reason: "Authorised exports remain available as a fallback evidence workflow.",
    },
    {
      provider: "transfermarkt",
      capability: "reference_only",
      configured: true,
      label: "Value and reference",
      reason: "DJM stores the linked profile and verified market value. Automated scraping remains disabled.",
    },
    {
      provider: "sofascore",
      capability: "disabled",
      configured: false,
      label: "Unofficial automation disabled",
      reason: "DJM does not make an undocumented SofaScore endpoint a production dependency.",
    },
  ];
};

export const providerStatus = (provider: string) =>
  providerStatuses().find((item) => item.provider === provider);
