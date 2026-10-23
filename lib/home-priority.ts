export type HomeQueueCategory =
  | 'Needs action now'
  | 'Waiting on someone'
  | 'Upcoming risk'
  | 'Opportunity detected'
  | 'FYI';

type HomeCommand = {
  source_type?: string;
  command_type?: string;
  title?: string;
  why_now?: string;
  recommended_action?: string;
  due_at?: string | null;
  evidence?: { reason?: string };
};

// A review flag's due_at is its review timestamp, not a promised business deadline.
// Real reminder tasks remain in the actionable queue with their existing controls.
export function isHomePlayerDataReview(command: HomeCommand): boolean {
  return command.source_type === 'player' && command.command_type === 'Player review required';
}

export function homeCommandCategory(command: HomeCommand, now = new Date()): HomeQueueCategory {
  if (isHomePlayerDataReview(command)) return 'FYI';
  const due = command.due_at ? new Date(command.due_at) : null;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (due && Number.isFinite(due.getTime()) && due <= endOfToday) return 'Needs action now';

  const text = [command.title, command.command_type, command.why_now, command.recommended_action, command.evidence?.reason].filter(Boolean).join(' ');
  if (/\b(waiting|awaiting|pending response|reply from|response from|chasing|with the club|with the player)\b/i.test(text)) return 'Waiting on someone';
  if (/\b(risk|contract|expiry|expires|renew|renewal|deadline|window|overdue|registration)\b/i.test(text)) return 'Upcoming risk';
  if (/\b(opportunity|club need|player match|pitch|send player|recruit|route|interest|looking for|requirement)\b/i.test(text)) return 'Opportunity detected';
  return 'Needs action now';
}
