/**
 * Relationship to the agency, not the player's club contract or playing status.
 * Only agency administrators can change this recorded classification.
 */
export const PLAYER_AGENCY_STATUSES = [
  {value: 'signed', label: 'Signed'},
  {value: 'prospect', label: 'Prospect'},
  {value: 'mandated', label: 'Mandated'},
] as const;

export type PlayerAgencyStatus = (typeof PLAYER_AGENCY_STATUSES)[number]['value'];

export function playerAgencyStatus(value: unknown): PlayerAgencyStatus {
  return value === 'signed' || value === 'mandated' ? value : 'prospect';
}

export function playerAgencyStatusLabel(value: unknown): string {
  const status = playerAgencyStatus(value);
  return PLAYER_AGENCY_STATUSES.find(item => item.value === status)!.label;
}
