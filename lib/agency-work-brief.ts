import type { EntityContext } from './entity-context.ts';
import { UUID_PATTERN } from './entity-context.ts';
export type WorkRecord = {
  kind: 'player' | 'contact' | 'club' | 'recruitment';
  id: string;
  title: string;
};
export type BriefTask = {
  kind: string;
  id: string;
  title: string;
  status: string;
  due_at?: string | null;
  due_on?: string | null;
  date_only?: boolean;
  overdue?: boolean;
  owner_user_id?: string | null;
  owner_name: string;
  shared?: boolean;
  people?: { user_id: string; display_name: string }[];
  context: Record<string, string>;
};
export type WorkBrief = {
  mode: 'brief' | 'choose';
  record?: WorkRecord | null;
  tasks?: BriefTask[];
  notes?: {
    id: string;
    summary: string;
    occurred_at?: string;
    source_type?: string;
    channel?: string;
    confidence?: number;
  }[];
  blockers?: {
    id: string;
    title: string;
    blocker?: string;
    next_decision?: string;
    due_at?: string;
  }[];
  notes_visible?: boolean;
  limited?: boolean;
  as_of: string;
  time_zone?: string;
  user_id?: string;
  search?: string;
  candidates?: WorkRecord[];
};
export function isWorkQuestion(query: string) {
  if (
    /^\s*(?:please\s+)?(?:draft|write|compose|send|create|schedule|add|complete|reopen|reschedule|cancel|delete|update|prepare)\b/i.test(
      query,
    )
  )
    return false;
  return (
    /\b(?:what(?:'s| is| are)?|show(?: me)?|any)\s+(?:the\s+|we(?:'re| are)?\s+)?(?:blockers|blocked|waiting (?:on|for))\b/i.test(
      query,
    ) ||
    /\b(?:my (?:open )?(?:work|tasks|priorities)|(?:still |need to |left to |have to )do|outstanding|follow[- ]?ups?|did (?:we|i) agree|was (?:agreed|recorded)|recorded (?:notes|agreements)|remaining (?:work|tasks))\b/i.test(
      query,
    )
  );
}
export function workBriefRequest(
  query: string,
  context: EntityContext = {},
  selected?: WorkRecord,
) {
  if (selected)
    return { p_kind: selected.kind, p_id: selected.id, p_search: null };
  const global =
    /\bmy (?:open )?(?:work|tasks|priorities)\b/i.test(query) &&
    !/\b(?:for|about|with)\s+(?!me\b|myself\b)/i.test(query);
  const named = query
    .match(/\b(?:for|about|with)\s+(.+?)[?.!]*$/i)?.[1]
    ?.trim()
    .replace(/[?.!]+$/, '')
    .trim();
  if (
    named &&
    !/^(?:this|the) (?:record|player|contact|club)$|^(?:me|myself|today)$/i.test(
      named,
    )
  )
    return { p_kind: null, p_id: null, p_search: named.slice(0, 120) };
  const primary = {
    player: 'player_id',
    contact: 'person_id',
    club: 'organisation_id',
    recruitment: 'prospect_id',
  } as const;
  const primaryKind = context.context_type as keyof typeof primary;
  const primaryId =
    primaryKind in primary ? context[primary[primaryKind]] : null;
  if (!global && primaryId && UUID_PATTERN.test(primaryId))
    return { p_kind: primaryKind, p_id: primaryId, p_search: null };
  if (!global)
    for (const [key, kind] of [
      ['person_id', 'contact'],
      ['player_id', 'player'],
      ['organisation_id', 'club'],
      ['prospect_id', 'recruitment'],
    ] as const) {
      if (UUID_PATTERN.test(context[key] || ''))
        return { p_kind: kind, p_id: context[key], p_search: null };
    }
  const name = !global
    ? context.player_name ||
      context.person_name ||
      context.organisation_name ||
      context.prospect_name
    : null;
  return {
    p_kind: null,
    p_id: null,
    p_search:
      name ||
      (!global && /\b(?:agree|agreed|recorded|this record)\b/i.test(query)
        ? ''
        : null),
  };
}
export function workRecordHref(record: WorkRecord, workspace: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(workspace) || !UUID_PATTERN.test(record.id))
    return null;
  const query = {
    player: '?view=players&profile=1&player=',
    contact: '?view=network&network=people&person=',
    club: '?view=network&network=clubs&club=',
    recruitment: '?view=players&tab=recruitment&target=',
  }[record.kind];
  return query ? `/workspace/${workspace}${query}${record.id}` : null;
}
export function workTaskHref(task: BriefTask, workspace: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(workspace) || !UUID_PATTERN.test(task.id))
    return null;
  if (
    task.context?.deal_room_id &&
    UUID_PATTERN.test(task.context.deal_room_id)
  )
    return workDealHref(task.context.deal_room_id, workspace);
  if (task.kind === 'calendar_task')
    return (
      `/workspace/${workspace}?view=calendar&task=${task.id}` +
      (task.due_at || task.due_on
        ? `&date=${(task.due_on || task.due_at!).slice(0, 10)}`
        : '&undated=1')
    );
  for (const [key, kind] of [
    ['player_id', 'player'],
    ['person_id', 'contact'],
    ['organisation_id', 'club'],
    ['prospect_id', 'recruitment'],
  ] as const) {
    if (UUID_PATTERN.test(task.context?.[key] || ''))
      return workRecordHref(
        { kind, id: task.context[key], title: '' },
        workspace,
      );
  }
  return `/workspace/${workspace}?view=calendar`;
}
export function briefFollowUp(brief: WorkBrief, note?: string) {
  const about = brief.record ? ` about ${brief.record.title}` : '';
  return `Create a follow-up task for me${about}.${note ? ` Recorded context: ${note.slice(0, 1000)}` : ''}\nNext action and due date: `;
}

export function workDealHref(id: string, workspace: string) {
  return /^[a-z0-9][a-z0-9-]*$/.test(workspace) && UUID_PATTERN.test(id)
    ? `/workspace/${workspace}?view=opportunities&tab=deals&record=${id}`
    : null;
}
export function workBriefError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '42501'
  )
    return 'This record is unavailable in this workspace. Check access or choose another record.';
  return error instanceof Error && error.message.includes('took too long')
    ? error.message
    : 'Your work could not be loaded. Please try again.';
}

export function briefConversationText(brief: WorkBrief) {
  if (brief.mode === 'choose')
    return 'Record selection still needed. No work or agreement has been confirmed.';
  return [
    `Read-only work brief for ${brief.record?.title || 'my priorities'}, checked ${brief.as_of}.`,
    ...(brief.tasks || [])
      .slice(0, 6)
      .map(
        (task) =>
          `Open: ${task.title}; owner: ${task.owner_name}; due: ${task.due_at || task.due_on || 'not recorded'}.`,
      ),
    ...(brief.notes || [])
      .slice(0, 2)
      .map(
        (note) => `Recorded context, requiring confirmation: ${note.summary}`,
      ),
    ...(brief.blockers || [])
      .slice(0, 2)
      .map((item) => `Recorded blocker: ${item.blocker || item.next_decision}`),
    'No task was changed and no follow-up was saved or sent.',
  ]
    .join('\n')
    .slice(0, 2000);
}
