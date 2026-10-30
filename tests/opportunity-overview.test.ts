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
