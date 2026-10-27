/** Read-only preparation intents. No generated document copy or database mutations. */
export const PREPARATION_LABELS = {
  player_contract: "Player contract",
  mandate: "Mandate",
  agency_pitch: "Player pitch",
  invoice: "Invoice",
  scouting_report: "Scouting report",
  player_profile: "Player profile",
} as const;
export type PreparationKind = keyof typeof PREPARATION_LABELS;
export type CapturePreparation = {
  key: string;
  kind: PreparationKind;
  player_name: string | null;
  club_name: string | null;
  evidence: string;
};
const normal = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
/** Fail closed on malformed, invented, negated or duplicate requests. */
export function capturePreparations(
  raw: unknown,
  transcript: string,
): CapturePreparation[] {
  if (!Array.isArray(raw) || !transcript.trim()) return [];
  const source = normal(transcript),
    keys = new Set<string>();
  const mentioned = (value: string) => {
    const candidate = normal(value);
    if (!candidate) return false;
    let index = source.indexOf(candidate);
    while (index >= 0) {
      if (
        !/[\p{L}\p{N}]/u.test(source[index - 1] || " ") &&
        !/[\p{L}\p{N}]/u.test(source[index + candidate.length] || " ")
      )
        return true;
      index = source.indexOf(candidate, index + 1);
    }
    return false;
  };
  const name = (value: unknown) =>
    typeof value === "string" && value.trim().length <= 160 && mentioned(value)
      ? value.trim() || null
      : null;
  return raw.slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { key, kind, evidence } = item;
    if (
      typeof key !== "string" ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(key) ||
      keys.has(key) ||
      typeof kind !== "string" ||
      !Object.hasOwn(PREPARATION_LABELS, kind) ||
      typeof evidence !== "string" ||
      !evidence.trim() ||
      evidence.length > 500 ||
      !source.includes(normal(evidence)) ||
      !/\b(?:prepare|draft|create|build|make|write|generate|update|need|want)\b/i.test(normal(evidence)) ||
      /\b(?:don't|do not|never|no need to|cancel)\b/i.test(normal(evidence))
    )
      return [];
    keys.add(key);
    return [
      {
        key,
        kind: kind as PreparationKind,
        player_name: name(item.player_name),
        club_name: name(item.club_name),
        evidence: evidence.trim(),
      },
    ];
  });
}
