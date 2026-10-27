import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWorkQuestion,
  workBriefRequest,
  workRecordHref,
  workTaskHref,
  workDealHref,
  briefFollowUp,
  workBriefError,
  briefConversationText,
  type BriefTask,
  type WorkBrief,
} from '../lib/agency-work-brief.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('factual work questions use deterministic reads; research and drafting stay with the existing agent', () => {
  for (const q of [
    'What do I still need to do for Dylan?',
    'What did we agree with James?',
    'What was recorded for this record?',
    'What are my priorities today?',
    'What is blocked for Dylan?',
    'Show outstanding work for Dylan',
  ])
    assert.equal(isWorkQuestion(q), true, q);
  for (const q of [
    'Draft a follow-up email to James',
    'Create a follow-up task',
    'Review this player’s next move',
    'Which clubs suit this player?',
    'What do we know about Dylan?',
    'Which options are most realistic? Explain the evidence, likely role and main blockers for each. Do not invent club interest.',
  ])
    assert.equal(isWorkQuestion(q), false, q);
});
test('explicit names override page context, global priorities stay global, selection pins the chosen record', () => {
  const ctx = { player_id: id, player_name: 'Dylan' };
  assert.deepEqual(workBriefRequest('What did we agree with James?', ctx), {
    p_kind: null,
    p_id: null,
    p_search: 'James',
  });
  assert.deepEqual(
    workBriefRequest('What do I need to do for this player?', ctx),
    { p_kind: 'player', p_id: id, p_search: null },
  );
  assert.deepEqual(workBriefRequest('What did we agree?'), {
    p_kind: null,
    p_id: null,
    p_search: '',
  });
  assert.deepEqual(
    workBriefRequest('What was recorded for this record?', {
      ...ctx,
      person_id: '22222222-2222-4222-8222-222222222222',
      context_type: 'player',
    }),
    { p_kind: 'player', p_id: id, p_search: null },
  );
  assert.deepEqual(workBriefRequest('Show my work', ctx), {
    p_kind: null,
    p_id: null,
    p_search: null,
  });
  assert.deepEqual(workBriefRequest('What do I still need to do for Dylan?'), {
    p_kind: null,
    p_id: null,
    p_search: 'Dylan',
  });
  assert.deepEqual(workBriefRequest('Show my tasks for Dylan', ctx), {
    p_kind: null,
    p_id: null,
    p_search: 'Dylan',
  });
  assert.deepEqual(
    workBriefRequest('What was recorded?', { person_name: 'James' }),
    { p_kind: null, p_id: null, p_search: 'James' },
  );
  assert.deepEqual(
    workBriefRequest('Ambiguous question', ctx, {
      kind: 'contact',
      id,
      title: 'James',
    }),
    { p_kind: 'contact', p_id: id, p_search: null },
  );
});
test('all links retain workspace, open the existing source and reject unsafe identifiers', () => {
  const task = {
    kind: 'calendar_task',
    id,
    title: 'Call',
    status: 'open',
    owner_name: 'You',
    context: {},
    due_on: '2026-10-21',
    date_only: true,
  } as BriefTask;
  assert.equal(
    workTaskHref(task, 'northstar'),
    `/workspace/northstar?view=calendar&task=${id}&date=2026-10-21`,
  );
  assert.match(
    workTaskHref({ ...task, due_on: null }, 'northstar')!,
    /undated=1$/,
  );
  assert.match(
    workTaskHref(
      { ...task, kind: 'task', context: { player_id: id } },
      'northstar',
    )!,
    /view=players&profile=1&player=/,
  );
  assert.match(
    workTaskHref(
      { ...task, kind: 'deal_next_action', context: { deal_room_id: id } },
      'northstar',
    )!,
    /tab=deals&record=/,
  );
  assert.equal(
    workRecordHref({ kind: 'contact', id, title: 'James' }, 'other/tenant'),
    null,
  );
  assert.equal(workDealHref('javascript:bad', 'northstar'), null);
  assert.equal(workTaskHref({ ...task, id: 'bad' }, 'northstar'), null);
});
test('follow-up preparation is explicit editable wording and failures do not claim no work exists', () => {
  const brief = {
    mode: 'brief',
    record: { kind: 'player', id, title: 'Dylan' },
    as_of: '2026-10-21',
  } as WorkBrief;
  assert.match(
    briefFollowUp(brief, 'Reported conversation'),
    /about Dylan\. Recorded context: Reported conversation\nNext action and due date: $/,
  );
  assert.equal(
    workBriefError({ code: '42501' }),
    'This record is unavailable in this workspace. Check access or choose another record.',
  );
  assert.equal(
    workBriefError(new Error('SQL private details')),
    'Your work could not be loaded. Please try again.',
  );
});

test('follow-up conversation keeps bounded recorded work without implying a mutation',()=>{
 const text=briefConversationText({mode:'brief',as_of:'2026-10-21',record:{kind:'player',id,title:'Dylan'},tasks:[{id,kind:'task',title:'Ask for club feedback',status:'open',owner_name:'Agency Owner',context:{}}],notes:[{id,summary:'Reported response'}]});
 assert.match(text,/Open: Ask for club feedback/);assert.match(text,/requiring confirmation: Reported response/);assert.match(text,/No task was changed/);assert.ok(text.length<=2000);
});
