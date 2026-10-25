type AppliedAction = {
  status: string;
  action_type?: string;
  target_type?: string | null;
  target_id?: string | null;
  resolved_payload?: Record<string, unknown>;
  proposed_payload?: Record<string, unknown>;
};
type OutcomeLink = { label: string; href: string };
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function captureOutcomeLinks(
  actions: AppliedAction[],
  workspaceSlug?: string | null,
): OutcomeLink[] {
  const base =
    workspaceSlug && /^[a-z0-9][a-z0-9-]*$/.test(workspaceSlug)
      ? "/workspace/" + workspaceSlug
      : "/agency";
  const links: OutcomeLink[] = [];
  for (const action of actions) {
    if (action.status !== "applied" || !validId.test(action.target_id || ""))
      continue;
    const id = action.target_id;
    if (action.target_type === "task") {
      const kind = action.resolved_payload?.task_kind ?? 'task';
      const title = action.resolved_payload?.task_title || action.resolved_payload?.title;
      if (kind === 'task' || kind === 'calendar_task')
        links.push({ label: typeof title==='string'&&title.trim()?"Open follow-up: "+title.trim():"Open follow-up", href: base + "?view=calendar&work=" + kind + "&task=" + id });
    }
    else if (action.target_type === "player")
      links.push({
        label: "Open player",
        href: base + "?view=players&player=" + id,
      });
    else if (action.target_type === "organisation")
      links.push({
        label: "Open club",
        href: base + "?view=network&network=clubs&club=" + id,
      });
    else if (action.target_type === "person")
      links.push({
        label: "Open contact",
        href: base + "?view=network&network=people&person=" + id,
      });
    else if (action.target_type === "prospect")
      links.push({
        label: "Open recruitment record",
        href: base + "?view=players&tab=recruitment&target=" + id,
      });
    const resolved = action.resolved_payload || {};
    const records = [
      ["organisation_id", "Open club", "?view=network&network=clubs&club="],
      ["person_id", "Open contact", "?view=network&network=people&person="],
      ["player_id", "Open player", "?view=players&player="],
      [
        "prospect_id",
        "Open recruitment record",
        "?view=players&tab=recruitment&target=",
      ],
    ];
    for (const [key, label, query] of records) {
      const record = resolved[key];
      if (typeof record === "string" && validId.test(record))
        links.push({ label, href: base + query + record });
    }
  }
  return links.filter(
    (link, index) =>
      links.findIndex((other) => other.href === link.href) === index,
  );
}
