import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clubNeedFinancialFacts} from '../lib/club-need-brief.ts';
const view=readFileSync('components/AgencyClubReferenceDetail.tsx','utf8');
const css=readFileSync('components/AgencyClubReferenceDetail.module.css','utf8');
test('request expiry must not be mislabelled as the transfer window',()=>{
  assert.match(view,/<th>Valid until<\/th>/);
  assert.doesNotMatch(view,/<th>Window<\/th>/);
});
test('club request wages show recorded pay period and tax basis',()=>{
  assert.match(view,/clubNeedFinancialFacts\(need\)/);
  assert.match(view,/wageBudgetLabel\(need\)/);
  const facts=clubNeedFinancialFacts({salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net'});
  assert.ok(facts.some(([key,value])=>key==='Salary budget'&&/5,000 per month · net/.test(value)));
});
test('priorities, deal preferences and mobile request cards are legible',()=>{
  assert.match(view,/requestPriorityLabel\(need.priority\)/);
  assert.match(view,/transferPreferenceLabel\(need.transfer_type\)/);
  assert.match(view,/<th>Deal preference<\/th>/);
  assert.match(css,/\.requestTable tbody tr\.clickable td::before/);
  assert.match(view,/styles\.requestCardWrap/);
  for(const key of ['Position','Wage budget','Transfer budget','Deal preference','Valid until'])
    assert.ok(view.includes('data-label="'+key+'"'));
});
