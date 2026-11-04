/**
 * Present recruitment targets alongside player records without promoting them.
 * The existing recruitment-to-player promotion remains the only conversion path.
 * Never deduplicate by name: names do not prove two records are the same person.
 */
export const RECRUITMENT_ROSTER_PREFIX = 'recruitment:';

const recruitmentStages: Record<string, string> = {
  identified: 'Identified',
  contact: 'Contact',
  relationship: 'Relationship',
  evaluation: 'Evaluation',
  representation_discussion: 'Representation discussion',
  offer: 'Offer',
  represented: 'Represented',
  paused: 'Paused',
  declined: 'Declined',
  lost: 'Lost',
};
const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function recruitmentRosterTargetId(rowId: string): string | null {
  return rowId.startsWith(RECRUITMENT_ROSTER_PREFIX)
    ? rowId.slice(RECRUITMENT_ROSTER_PREFIX.length) || null
    : null;
}

export function unifyPlayersAndRecruitment(
  players: readonly any[],
  recruitment: readonly any[],
  canSeeRecruitment: boolean,
): any[] {
  const rows = [...players];
  if (!canSeeRecruitment) return rows;
  const seen = new Set(players.map(player => stringValue(player?.player_id)));
  for (const target of recruitment) {
    const id = stringValue(target?.id);
    // A linked recruitment row belongs in the canonical Players table only.
    if (!id || target?.linked_player_id) continue;
    const rowId = RECRUITMENT_ROSTER_PREFIX + id;
    if (seen.has(rowId)) continue;
    seen.add(rowId);
    const nationality = stringValue(target?.nationality);
    const uiStage = stringValue(target?.ui_stage) || 'identified';
    rows.push({
      player_id: rowId,
      roster_source: 'recruitment',
      recruitment_id: id,
      identity: {
        name: stringValue(target?.full_name) || 'Unnamed prospect',
        date_of_birth: target?.date_of_birth || null,
        nationalities: nationality ? [nationality] : [],
        primary_position: stringValue(target?.primary_position),
        current_club: stringValue(target?.current_club),
        current_country: stringValue(target?.current_country),
        contract_expiry: target?.contract_expiry || null,
        stage: recruitmentStages[uiStage] || uiStage.replaceAll('_', ' '),
      },
      representation: { recorded: false, status: 'not_recorded' },
    });
  }
  return rows;
}
