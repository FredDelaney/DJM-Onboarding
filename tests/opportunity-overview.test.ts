import assert from 'node:assert/strict';
import test from 'node:test';
import {opportunityOverview} from '../lib/opportunity-overview.ts';

test('club need contains only its explicitly linked player pursuit', () => {
  const data=opportunityOverview({
    needs:[{club_need_id:'need-1',club:{name:'Example FC'},need:{title:'Striker'}}],
    routes:[{player_match_id:'route-1',club_need_id:'need-1',player:{name:'Player A'},club:{name:'Example FC'}},{player_match_id:'route-2',player:{name:'Player B'},club:{name:'Another club'}}],
  });
  assert.equal(data.needs.length,1);
  assert.deepEqual(data.byNeed.get('need-1')?.map(x=>x.id),['route-1']);
  assert.equal(data.routes.length,2);
});

test('an unknown club response never becomes confirmed interest', () => {
  const data=opportunityOverview({routes:[{player_match_id:'route-1',player:{name:'Player A'},club:{name:'FC'}}]});
  assert.equal(data.routes[0].context,'Status not recorded');
  assert.equal(data.routes[0].attention,false);
  assert.equal(data.routes[0].nextAction,null);
});

test('source-defined deal blocker receives attention without inventing dates', () => {
  const data=opportunityOverview({deals:[{deal_room_id:'deal-1',title:'Player to FC',stage:'negotiating',next_control_fix:{instruction:'Assign deal owner'}}]});
  assert.equal(data.attention.length,1);
  assert.equal(data.attention[0].nextAction,'Assign deal owner');
});

test('need expiry is only urgent when the date is evidenced', () => {
  const now=Date.parse('2026-10-30T12:00:00Z');
  const data=opportunityOverview({needs:[
    {club_need_id:'a',need:{expires_at:'2026-11-01T12:00:00Z'}},
    {club_need_id:'b',need:{}},
    {club_need_id:'c',need:{expires_at:'not a date'}}
  ]},now);
  assert.deepEqual(data.attention.map(x=>x.id),['a']);
});

test('distinct typed IDs prevent accidental cross-type collisions', () => {
  const data=opportunityOverview({needs:[{club_need_id:'same'}],routes:[{player_match_id:'same'}],deals:[{deal_room_id:'same'}]});
  assert.equal(data.attention.length+data.other.length,3);
});


test('request terms retain money basis without converting it into commission', () => {
  const result=opportunityOverview({needs:[{club_need_id:'a',need:{salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net'}}]});
  assert.match(result.needs[0].detail,/EUR 5,000\/month · net/);
  assert.doesNotMatch(result.needs[0].detail,/commission/i);
});

test('only the verified need-scoped task becomes a scheduled action and accountable follow-up', () => {
  const now=Date.parse('2026-10-30T12:00:00Z');
  const data=opportunityOverview({
    needs:[{club_need_id:'need-1',club:{name:'Example FC'},need:{title:'Striker'},next_action:{instruction:'Consider scouting'}}],
    connectedNeeds:[{club_need_id:'need-1',need_owner_name:'Dapo Kayode',open_followup:{task_id:'task-1',title:'Confirm shortlist with sporting director',owner_name:'Dapo Kayode',owner_state:'active_staff',due_at:'2026-10-29T13:00:00Z'}}],
  },now);
  assert.equal(data.attention.length,1);
  assert.equal(data.needs[0].attentionReason,'Follow-up overdue');
  assert.equal(data.needs[0].ownerName,'Dapo Kayode');
  assert.equal(data.needs[0].nextAction,'Confirm shortlist with sporting director');
  assert.equal(data.needs[0].nextActionLabel,'Recorded follow-up');
  assert.equal(data.needs[0].dueAt,'2026-10-29T13:00:00Z');
});

test('wrongly linked context cannot assign a different club need a task or agent', () => {
  const data=opportunityOverview({
    needs:[{club_need_id:'need-1',need:{title:'Midfielder'}}],
    connectedNeeds:[{club_need_id:'need-2',need_owner_name:'Other agent',open_followup:{title:'Different request',owner_state:'unassigned'}}],
  });
  assert.equal(data.needs[0].ownerName,null);
  assert.equal(data.needs[0].nextAction,null);
  assert.equal(data.needs[0].attention,false);
});

test('unassigned and suspended need follow-ups are explicit blockers, not assumed owners', () => {
  const data=opportunityOverview({needs:[{club_need_id:'need-1'}],connectedNeeds:[{
    club_need_id:'need-1',open_followup:{title:'Check with club',owner_user_id:'user-1',owner_state:'inactive_or_invalid_staff'},
  }]});
  assert.equal(data.needs[0].attentionReason,'Follow-up needs an active owner');
  assert.equal(data.needs[0].ownerName,null);
});

test('contact access route is never mistaken for the responsible agent', () => {
  const data=opportunityOverview({routes:[{player_match_id:'route-1',best_access_route:{person_name:'Sporting director'},career_strategy_gate:{state:'open_confirmed'}}]});
  assert.equal(data.routes[0].ownerName,null);
  assert.equal(data.routes[0].attention,false);
});

test('deal owner is shown only when source context is linked by the exact deal ID', () => {
  const data=opportunityOverview({deals:[{deal_room_id:'deal-1',title:'Negotiation'}],connectedDeals:[
    {deal_room_id:'deal-1',deal_owner_name:'Moses Makinde'},
    {deal_room_id:'deal-2',deal_owner_name:'Unrelated agent'}
  ]});
  assert.equal(data.deals[0].ownerName,'Moses Makinde');
  assert.equal(data.deals[0].dueAt,null);
});

test('invalid calendar days and missing dates never manufacture urgency', () => {
  const now=Date.parse('2026-10-30T12:00:00Z');
  const data=opportunityOverview({needs:[
    {club_need_id:'bad',need:{expires_at:'2026-02-31'}},
    {club_need_id:'missing',need:{expires_at:'unknown'}},
    {club_need_id:'today',need:{expires_at:'2026-10-30'}},
  ]},now);
  assert.deepEqual(data.attention.map(x=>x.id),['today']);
});

test('duplicate input rows do not inflate club requests, pursuits or deals', () => {
  const need={club_need_id:'same-need',need:{position:'Striker'}};
  const pursuit={player_match_id:'same-pursuit',club_need_id:'same-need'};
  const deal={deal_room_id:'same-deal'};
  const data=opportunityOverview({needs:[need,need],routes:[pursuit,pursuit],deals:[deal,deal]});
  assert.deepEqual([data.needs.length,data.routes.length,data.deals.length,data.byNeed.get('same-need')?.length],[1,1,1,1]);
});

test('unconfirmed planning instruction stays a suggestion and never becomes a scheduled follow-up', () => {
  const data=opportunityOverview({needs:[{club_need_id:'n',next_action:{instruction:'Scout more players'}}]});
  assert.equal(data.needs[0].nextActionLabel,'Suggested next step');
  assert.equal(data.needs[0].dueAt,null);
  assert.equal(data.needs[0].attention,false);
});
