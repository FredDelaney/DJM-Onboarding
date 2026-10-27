// Conservative checks complement the interpreter's objective-level task matching.
// A model confidence number alone never authorises a task change.
export type WorkTask = {
  id: string; title: string; status: string; owner_user_id: string | null;
  task_kind?: string; shared_with_you?: boolean; owner_display_name?: string | null;
  updated_at: string; due_at?: string | null;
  person_name?: string | null; player_name?: string | null; club_name?: string | null;
};
type Update = {
  operation?: string; task_ids?: string[]; objective_satisfied?: boolean;
  evidence?: string; confidence?: number; due_at?: string | null;
};
const normalise = (value: string) => value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
const negative = /\b(?:didn't|did not|haven't|have not|hasn't|has not|not yet|couldn't|could not|unable|tried|attempted|need to|needs to|will|should|going to|plan to|hope to|might|would|must|waiting to)\b/i;
const objectives: Array<[RegExp, RegExp]> = [
  [/\b(?:speak|talk|call|phone|contact)\b/i, /\b(?:spoke|talked|had a conversation|had a call)\b/i],
  [/\b(?:send|email|share)\b/i, /\b(?:sent|emailed|shared)\b/i],
  [/\b(?:prepare|draft|write)\b/i, /\b(?:prepared|drafted|wrote|written)\b/i],
  [/\bupdate\b/i, /\bupdated\b/i],
  [/\b(?:check|review|confirm|verify)\b/i, /\b(?:checked|reviewed|confirmed|verified)\b/i],
];

// The interpreter can recognise a paraphrase, but automatic completion also
// needs the named subject. Same people + a past-tense verb is not enough.
const objectiveFiller = new Set('speak talk call phone contact send email share prepare draft write update check review confirm verify with about regarding discuss follow followup complete completed task player club today tomorrow next week monday tuesday wednesday thursday friday saturday sunday'.split(' '));
const subjectAliases = [new Set(['availability','available']),new Set(['profile','dossier','cv']),new Set(['video','footage','highlights'])];
function subjectSupported(title:string,evidence:string,names:string[]){
 const words=(value:string)=>normalise(value).match(/[a-z0-9]+/g)||[];
 const entityWords=new Set(names.flatMap(words)),said=new Set(words(evidence));
 const subjects=words(title).filter(word=>word.length>3&&!entityWords.has(word)&&!objectiveFiller.has(word));
 return subjects.every(word=>said.has(word)||subjectAliases.some(group=>group.has(word)&&[...group].some(alias=>said.has(alias))));
}

export function assessTaskUpdate(action: Update, transcript: string, tasks: WorkTask[], userId: string) {
  const evidence = normalise(String(action.evidence || ''));
  const source = normalise(transcript);
  const operation = action.operation;
  const candidates = tasks.filter(task => (action.task_ids || []).includes(task.id)
    && (task.owner_user_id === userId || task.shared_with_you === true)
    && (operation === 'reopen' ? task.status === 'completed' : ['open', 'in_progress'].includes(task.status)));
  const fail = (reason: string) => ({ candidates: [] as WorkTask[], automatic: false, reason });
  if (!evidence || !source.includes(evidence)) return fail('Check the original wording before changing a task.');
  const leadIn = source.slice(0, source.indexOf(evidence)).split(/[.!?;]/).at(-1) || '';
  if (operation === 'complete' && /\b(?:if|whether|suppose|imagine|pretend|example|claim|need to say|would say|didn't|did not|not)\b/.test(leadIn)) {
    return fail('This wording does not establish that the task happened.');
  }
  if (!['complete', 'reopen', 'reschedule'].includes(operation || '')) return fail('Choose how this task should change.');
  if (!candidates.length) return fail('No matching task assigned to you is available. Edit the note or review your tasks.');
  if (operation === 'complete' && (!action.objective_satisfied || negative.test(evidence))) {
    return fail('This update does not establish that the task is finished.');
  }
  if (operation === 'reopen' && !/\b(?:reopen|not (?:finished|done|complete)|isn't (?:finished|done|complete))\b/.test(evidence)) {
    return fail('Say which task to reopen.');
  }
  if (operation === 'reschedule' && (!/\b(?:move|reschedule|postpone|remind)\b/.test(evidence)
    || !action.due_at || !/(?:Z|[+-]\d{2}:\d{2})$/.test(action.due_at) || !Number.isFinite(Date.parse(action.due_at)))) {
    return fail('Choose a clear new date for the task.');
  }
  const task = candidates[0];
  const explicit = /\b(?:mark|complete|finish)\b.*\b(?:done|complete|finished)\b/.test(evidence);
  const objective = objectives.find(([pattern]) => pattern.test(task.title));
  // Two independently named records or meaningful objective words must support
  // automatic completion. Pronouns and missing names stay in the review flow.
  const linkedNames = [task.person_name, task.player_name, task.club_name].filter(Boolean) as string[];
  const namesPresent = linkedNames.length > 0 && linkedNames.every(name => {
    const words = normalise(name).split(' ').filter(word => word.length > 2);
    return words.length > 0 && words.some(word => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(evidence));
  });
  const material = /\b(?:sign|signed|signature|pay|payment|paid|receive|received|accept|accepted|agree|agreed|contract)\b/i.test(task.title);
  const automatic = task.owner_user_id === userId && operation === 'complete' && candidates.length === 1 && Number(action.confidence) >= 0.96
    && !material && namesPresent && subjectSupported(task.title,evidence,linkedNames) && Boolean(objective && (objective[1].test(evidence) || explicit));
  return { candidates, automatic, reason: candidates.length > 1 ? 'Which task did you mean?' : '' };
}

export function overlappingFollowUp(action: { title?: string; due_at?: string; owner_user_id?: string; person_id?: string; player_id?: string; organisation_id?: string }, tasks: Array<WorkTask & Record<string, unknown>>) {
  // Only exact same work, owner, records and due date counts as a duplicate.
  return tasks.find(task => ['open', 'in_progress'].includes(task.status)
    && normalise(task.title) === normalise(action.title || '')
    && task.owner_user_id === action.owner_user_id
    && (task.due_at ? Date.parse(task.due_at) : null) === (action.due_at ? Date.parse(action.due_at) : null)
    && ['person_id', 'player_id', 'organisation_id'].every(key => (task[key] || null) === (action[key as keyof typeof action] || null)));
}
