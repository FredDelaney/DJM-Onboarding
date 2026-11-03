import test from 'node:test';
import assert from 'node:assert/strict';
import {filterClubRequests} from '../lib/club-request-filters.ts';

const requests = [
  {club:{name:'Example FC'},need:{title:'Centre back',position:'Centre back',priority:4,transfer_type:'permanent'}},
  {club:{name:'Other FC'},need:{title:'Forward',position:'Striker',priority:2,transfer_type:'loan'}},
  {club:{name:'Unconfirmed FC'},need:{title:'Goalkeeper',position:'Goalkeeper',priority:null,transfer_type:null}},
  {club:{name:'Urgent FC'},need:{title:'Right winger',position:'Right wing',priority:5,transfer_type:'free_agent'}},
  {club:{name:'Routine FC'},need:{title:'Defender',position:'Left back',priority:3,transfer_type:'loan'}},
];

test('filters by club or position without changing existing request order', () => {
  assert.deepEqual(filterClubRequests(requests,'centre BACK','all','all'),[requests[0]]);
  assert.deepEqual(filterClubRequests(requests,'example','all','all'),[requests[0]]);
  assert.deepEqual(filterClubRequests(requests,'','all','all'),requests);
});
test('priority groups distinguish high and urgent, normal, lower, and genuinely unset',()=>{
  assert.deepEqual(filterClubRequests(requests,'','high','all'),[requests[0],requests[3]]);
  assert.deepEqual(filterClubRequests(requests,'','normal','all'),[requests[4]]);
  assert.deepEqual(filterClubRequests(requests,'','low','all'),[requests[1]]);
  assert.deepEqual(filterClubRequests(requests,'','unset','all'),[requests[2]]);
});
test('deal preference filter is explicit, never confuses missing values with loan or transfer',()=>{
  assert.deepEqual(filterClubRequests(requests,'','all','loan'),[requests[1],requests[4]]);
  assert.deepEqual(filterClubRequests(requests,'','all','permanent'),[requests[0]]);
  assert.deepEqual(filterClubRequests(requests,'','all','unset'),[requests[2]]);
});
test('combined filters narrow the same saved records, without changing the source data',()=>{
  assert.deepEqual(filterClubRequests(requests,'Urgent','high','free_agent'),[requests[3]]);
  assert.deepEqual(filterClubRequests(requests,'Example','high','loan'),[]);
  assert.equal(requests[0].need.transfer_type,'permanent');
});
