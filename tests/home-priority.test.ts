import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homePriorityWeight, homeCommandCategory, isHomePlayerDataReview, isHomeStatisticsReview } from '../lib/home-priority.ts';

const now = new Date(2026, 9, 23, 12);
test('a player data-review timestamp is not treated as an overdue business deadline', () => {
  const review = { source_type: 'player', command_type: 'Player review required', due_at: '2020-01-01', title: 'Contract statistics changed' };
  assert.equal(isHomePlayerDataReview(review), true);
  assert.equal(homeCommandCategory(review, now), 'FYI');
});
test('review reminders and other player work retain their actual deadline and actions', () => {
  for (const command of [
    { source_type: 'task', command_type: 'Player review required', title: 'Review player data: Alex', due_at: '2020-01-01' },
    { source_type: 'player', command_type: 'Player follow-up due', title: 'Call Alex about the contract', due_at: '2020-01-01' },
    { source_type: 'player', command_type: 'Contract decision approaching', due_at: '2020-01-01' },
    { source_type: 'task', title: 'Awaiting club response', due_at: '2020-01-01' },
  ]) {
    assert.equal(isHomePlayerDataReview(command), false);
    assert.equal(homeCommandCategory(command, now), 'Needs action now');
  }
});
test('a deadline later today remains attention now, not an upcoming risk', () => {
  assert.equal(homeCommandCategory({ title: 'Contract decision', due_at: new Date(2026, 9, 23, 23).toISOString() }, now), 'Needs action now');
  assert.equal(homeCommandCategory({ title: 'Contract decision', due_at: new Date(2026, 10, 1).toISOString() }, now), 'Upcoming risk');
});
test('undated and invalid-date context retains existing categories without fabricated deadlines', () => {
  for (const due_at of [undefined, null, 'not-a-date']) {
    assert.equal(homeCommandCategory({ title: 'Awaiting a reply from the club', due_at }, now), 'Waiting on someone');
    assert.equal(homeCommandCategory({ title: 'Review player match for club need', due_at }, now), 'Opportunity detected');
    assert.equal(homeCommandCategory({ source_type: 'capture', title: 'Clarify which Alex', due_at }, now), 'Needs action now');
  }
});

test('sourced suggestions stay in the quiet review group and are never deadlines',()=>{
 const c={source_type:'player',command_type:'Player statistics suggested',due_at:'2000-01-01'};
 assert.equal(isHomeStatisticsReview(c),true);assert.equal(isHomePlayerDataReview(c),true);assert.equal(homeCommandCategory(c,now),'FYI');
 assert.equal(isHomeStatisticsReview({...c,source_type:'task'}),false);
});

test('material detail suggestions stay in the quiet review group even with contract words or an old check date',()=>{
 const card={source_type:'player',command_type:'Player details suggested',title:'Check contract expiry',due_at:'2020-01-01'};
 assert.equal(isHomePlayerDataReview(card),true);assert.equal(homeCommandCategory(card),'FYI');
});

test('recorded command priorities share Home queue units with dates and meetings',()=>{
 assert.equal(homePriorityWeight(95),8550);
 assert.ok(homePriorityWeight(95)>7500,'High-priority actionable work can outrank generic overdue date rows');
 assert.ok(homePriorityWeight(70)<7500,'Lower-priority work does not automatically outrank an overdue date');
 assert.ok(homePriorityWeight(100)>8500,'Critical work retains precedence over meeting aftercare');
 assert.ok(homePriorityWeight(60)<5500,'An ordinary command can remain behind today\'s meeting');
});
test('Home priority weights are bounded and never invent urgency from malformed scores',()=>{
 for(const score of [undefined,null,'invalid',NaN,Infinity,-5])assert.equal(homePriorityWeight(score),0);
 assert.equal(homePriorityWeight('95'),8550);assert.equal(homePriorityWeight(200),9000);
});
