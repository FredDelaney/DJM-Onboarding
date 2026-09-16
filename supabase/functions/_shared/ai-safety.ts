function normaliseEntityName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function captureResolutions(capture: any) {
  const list = capture?.context_json?.resolutions;
  return Array.isArray(list) ? list : [];
}

function canonicalResolvedLabel(value: any) {
  const canonical = String(value?.canonical_label || "").trim();
  if (canonical) return canonical;

  return String(value?.label || "")
    .split(" · ")[0]
    .trim();
}

function resolvedContactSurface(fieldKey: unknown) {
  const prefix = "entity:contact:";
  const raw = String(fieldKey || "");
  if (!raw.startsWith(prefix)) return "";

  const contactSlug = raw.slice(prefix.length).split(":")[0] || "";
  return normaliseEntityName(contactSlug.replace(/-/g, " "));
}

export function applyConfirmedEntityResolutions(capture: any, action: any) {
  const next = { ...action };
  const contactName = normaliseEntityName(next.contact_name);
  if (!contactName) return next;

  const matches = captureResolutions(capture).filter((item: any) => {
    const value = item?.value;
    const fieldKey = String(item?.field_key || "");
    if (!fieldKey.startsWith("entity:contact:")) return false;
    if (!value?.entity_id || value?.entity_type !== "player") return false;

    const canonicalName = normaliseEntityName(canonicalResolvedLabel(value));
    const originalMention = resolvedContactSurface(fieldKey);

    return canonicalName === contactName || originalMention === contactName;
  });

  const selected = matches.length
    ? matches[matches.length - 1]?.value
    : null;

  if (selected?.entity_id) {
    next.player_id = String(selected.entity_id);
    next.player_name = canonicalResolvedLabel(selected) || next.contact_name;
    next.contact_name = null;
  }

  return next;
}

export function canonicalClaimKey(value: unknown, claimType: unknown) {
  const normalise = (input: unknown) =>
    String(input || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);

  const supplied = normalise(value);
  if (/^[a-z][a-z0-9_]{0,63}$/.test(supplied)) return supplied;

  const fallback = normalise(claimType);
  if (/^[a-z][a-z0-9_]{0,63}$/.test(fallback)) return fallback;

  return "note";
}
