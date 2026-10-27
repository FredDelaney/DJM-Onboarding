import assert from 'node:assert/strict';
import test from 'node:test';
import { assessTaskUpdate, overlappingFollowUp } from '../supabase/functions/_shared/task-work.ts';

const task = { id: 'task-a', title: 'Speak to James about Dylan availability', status: 'open', owner_user_id: 'user-a', updated_at: '2026-10-20T09:00:00Z', person_name: 'James Smith', player_name: 'Dylan Example' };
const completion = { operation: 'complete', task_ids: [task.id], objective_satisfied: true, confidence: 0.99, evidence: 'I spoke to James about Dylan availability' };
test('a completed conversation fulfils the actual owned conversation task', () => {
  assert.equal(assessTaskUpdate(completion, `${completion.evidence}. He wants a profile tomorrow.`, [task], 'user-a').automatic, true);
});
test('explicit completion can use the same conservative automatic path', () => {
  const action = { ...completion, evidence: 'Mark my call with James about Dylan availability as done' };
  assert.equal(assessTaskUpdate(action, action.evidence, [task], 'user-a').automatic, true);
});
for (const evidence of ['I need to speak to James about Dylan', 'I tried calling James about Dylan', "I didn't speak to James about Dylan", "I haven't spoken to James about Dylan", 'I will speak to James about Dylan', 'I could not speak to James about Dylan']) {
  test(`unfinished objective stays open: ${evidence}`, () => {
    assert.equal(assessTaskUpdate({ ...completion, evidence }, evidence, [task], 'user-a').candidates.length, 0);
  });
}
test('discussion does not fulfil the signature objective', () => {
  const action = { ...completion, objective_satisfied: false, evidence: 'I discussed the contract with James' };
  assert.equal(assessTaskUpdate(action, action.evidence, [{ ...task, title: 'Get contract signed' }], 'user-a').candidates.length, 0);
});
test('material facts and unresolved pronouns remain proposals', () => {
  assert.equal(assessTaskUpdate(completion, completion.evidence, [{ ...task, title: 'Discuss contract with James' }], 'user-a').automatic, false);
  const action = { ...completion, evidence: 'I spoke to him about the player' };
  assert.equal(assessTaskUpdate(action, action.evidence, [task], 'user-a').automatic, false);
});
test('multiple task matches require clarification', () => {
  const action = { ...completion, task_ids: ['task-a', 'task-b'] };
  const result = assessTaskUpdate(action, action.evidence, [task, { ...task, id: 'task-b' }], 'user-a');
  assert.equal(result.candidates.length, 2);
  assert.equal(result.automatic, false);
});
test('completed, cancelled and colleague work cannot be completed', () => {
  for (const changed of [{ status: 'completed' }, { status: 'cancelled' }, { owner_user_id: 'colleague' }]) {
    assert.equal(assessTaskUpdate(completion, completion.evidence, [{ ...task, ...changed }], 'user-a').candidates.length, 0);
  }
});
test('rescheduling requires a real explicit zoned date', () => {
  const action = { ...completion, operation: 'reschedule', evidence: 'Move my follow-up with James to next Tuesday', due_at: '2026-10-27T09:00:00+01:00' };
  assert.equal(assessTaskUpdate(action, action.evidence, [task], 'user-a').candidates.length, 1);
  for (const due_at of [null, 'Tuesday', '2026-10-27T09:00:00']) assert.equal(assessTaskUpdate({ ...action, due_at }, action.evidence, [task], 'user-a').candidates.length, 0);
});
test('a correction reopens a completed task without treating an open task as completed', () => {
  const action = { ...completion, operation: 'reopen', evidence: "That task isn't finished. Reopen it." };
  assert.equal(assessTaskUpdate(action, action.evidence, [{ ...task, status: 'completed' }], 'user-a').candidates.length, 1);
  assert.equal(assessTaskUpdate(action, action.evidence, [task], 'user-a').candidates.length, 0);
});
test('fabricated evidence and invented task ids cannot change work', () => {
  assert.equal(assessTaskUpdate(completion, 'Something else', [task], 'user-a').candidates.length, 0);
  assert.equal(assessTaskUpdate({ ...completion, task_ids: ['invented'] }, completion.evidence, [task], 'user-a').candidates.length, 0);
});
test('an excerpt cannot discard a conditional or quoted claim', () => {
  for(const leadIn of ['Imagine ', 'He asked whether ', 'I need to say ', 'For example: ']) {
    assert.equal(assessTaskUpdate(completion,leadIn+completion.evidence,[task],'user-a').candidates.length,0);
  }
});
test('exact overlapping follow-ups are reused without conflating dates, records or owners', () => {
  const existing = { ...task, due_at: '2026-10-22T09:00:00Z', person_id: 'james' };
  assert.equal(overlappingFollowUp(existing, [existing])?.id, task.id);
  for (const changed of [{ due_at: '2026-10-23T09:00:00Z' }, { person_id: 'other' }, { owner_user_id: 'other' }]) {
    assert.equal(overlappingFollowUp({ ...existing, ...changed }, [existing]), undefined);
  }
});

test('explicit shared responsibility is a candidate but always needs review',()=>{
 const shared={...task,owner_user_id:'colleague',shared_with_you:true};
 const result=assessTaskUpdate(completion,completion.evidence,[shared],'user-a');
 assert.equal(result.candidates.length,1);assert.equal(result.automatic,false);
 assert.equal(assessTaskUpdate(completion,completion.evidence,[{...shared,shared_with_you:false}],'user-a').candidates.length,0);
});

test('same people with a different task subject never causes automatic completion',()=>{
 const result=assessTaskUpdate(completion,completion.evidence,[{...task,title:'Speak to James about Dylan trial'}],'user-a');
 assert.equal(result.candidates.length,1,'A semantic interpretation can still be reviewed');assert.equal(result.automatic,false);
 const vague={...completion,evidence:'Mark my call with James about Dylan as done'};
 assert.equal(assessTaskUpdate(vague,vague.evidence,[task],'user-a').automatic,false);
});
test('ordinary subject paraphrases retain the supported automatic path',()=>{
 const available={...completion,evidence:'I spoke to James about when Dylan is available'};
 assert.equal(assessTaskUpdate(available,available.evidence,[task],'user-a').automatic,true);
 const sent={...completion,evidence:'I emailed Dylan dossier to James'};
 assert.equal(assessTaskUpdate(sent,sent.evidence,[{...task,title:'Send Dylan profile to James'}],'user-a').automatic,true);
});
