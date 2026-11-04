export type PitchHistoryScope = 'request' | 'player' | 'match';
export type PitchHistoryInvoke = (
  action: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<any>;

export const pitchReplyLabels = {
  request_conversation: 'Requested a conversation',
  request_information: 'Requested more information',
  not_now: 'Not now',
  decline: 'Declined',
} as const;

type PitchReply = {
  response_type: keyof typeof pitchReplyLabels;
  message?: string | null;
  updated_at?: string | null;
  channel?: string;
  responder?: {name?: string | null; identity_status?: string};
};

export type PitchHistoryItem = {
  share_id: string;
  player_match_id: string;
  club_need_id: string;
  player_id: string;
  organisation_id: string;
  player_name: string;
  club_name: string;
  need_title: string;
  request_available: boolean;
  pitch_status: string | null;
  active: boolean;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  opportunity_id: string | null;
  view_count?: number;
  deal_owner_user_id?: string | null;
  deal_owner_name?: string | null;
  next_action_at?: string | null;
  next_action_text?: string | null;
  link_reply: PitchReply | null;
  staff_reply: PitchReply | null;
};

export function readPitchHistory(payload: any, scope: PitchHistoryScope, scopeId: string) {
  const history = payload?.history;
  const scopeKey = scope === 'request' ? 'club_need_id' : scope === 'player' ? 'player_id' : 'player_match_id';
  if (history?.scope !== scope || history.scope_id !== scopeId || !Array.isArray(history.items)
    || history.items.some((item: any) => item?.[scopeKey] !== scopeId || !item?.share_id)) {
    throw new Error('The pitch history could not be confirmed for this record.');
  }
  return {items: history.items as PitchHistoryItem[], hasMore: history.has_more === true};
}

export function pitchDeliveryLabel(pitch: PitchHistoryItem) {
  if (pitch.sent_at) return 'Send recorded';
  if (pitch.active || pitch.pitch_status === 'ready') return 'Link prepared';
  return 'Private draft';
}
