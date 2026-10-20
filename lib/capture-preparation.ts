import {
  capturePreparations,
  type CapturePreparation,
} from "../supabase/functions/_shared/capture-preparation.ts";
export {
  PREPARATION_LABELS,
  capturePreparations,
} from "../supabase/functions/_shared/capture-preparation.ts";
export type { CapturePreparation } from "../supabase/functions/_shared/capture-preparation.ts";
export type PreparationLink = { capture: string; preparation: string };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function preparationLink(
  capture: unknown,
  preparation: unknown,
): PreparationLink | null {
  return typeof capture === "string" &&
    uuid.test(capture) &&
    typeof preparation === "string" &&
    /^[a-zA-Z0-9_-]{1,60}$/.test(preparation)
    ? { capture, preparation }
    : null;
}
export function preparationHref(
  workspace: string,
  link: PreparationLink,
  playerId?: string,
) {
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(workspace) ||
    !preparationLink(link.capture, link.preparation) ||
    (playerId && !uuid.test(playerId))
  )
    return null;
  const query = new URLSearchParams({
    capture: link.capture,
    preparation: link.preparation,
  });
  if (playerId) {
    query.set("view", "players");
    query.set("player", playerId);
    query.set("profile", "1");
  }
  return `/workspace/${workspace}${playerId ? "" : "/documents"}?${query}`;
}
export function readPreparation(
  receipt: {
    capture?: { id?: string; transcript_text?: string | null };
    preparations?: unknown;
  },
  link: PreparationLink,
): { intent: CapturePreparation; notes: string } {
  if (receipt.capture?.id !== link.capture)
    throw new Error(
      "This brief could not be opened. Return to Tell ReDream and try again.",
    );
  const notes = receipt.capture.transcript_text || "";
  const intent = capturePreparations(receipt.preparations, notes).find(
    (item) => item.key === link.preparation,
  );
  if (!intent)
    throw new Error(
      "This preparation is no longer available. Return to Tell ReDream to review the note.",
    );
  return { intent, notes };
}
/** Only a unique exact name match may be suggested. Never attach a prospect to a roster record. */
export function preparationPlayer(
  players: { id: string; name: string }[],
  name: string | null,
) {
  const normal = (text: string) =>
    text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const matches = name
    ? players.filter((player) => normal(player.name) === normal(name))
    : [];
  return matches.length === 1 ? matches[0].id : "";
}
