import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clubNeedFinancialFacts,validateClubNeedBrief,emptyClubNeedBrief} from '../lib/club-need-brief.ts';

test('the monthly striker brief separates annual, initial and optional budgets',()=>{
 const brief={...emptyClubNeedBrief,salary_budget:'5000',currency:'EUR',salary_period:'monthly',contract_months:'12',contract_guaranteed:'true',option_months:'12'};
 validateClubNeedBrief(brief);
 assert.deepEqual(clubNeedFinancialFacts(brief),[
  ['Salary budget','EUR 5,000 per month · tax basis unknown'],
  ['Annualised budget (12 paid months)','EUR 60,000'],
  ['Initial-term base budget','EUR 60,000 over 12 months'],
  ['Optional extension budget (not guaranteed)','EUR 60,000 over 12 months'],
  ['Initial contract','12 months · guaranteed term requested'],['Extension option','12 months · not guaranteed'],
 ]);
});
test('missing money, currency, period, tax and guarantees stay unknown',()=>{
 assert.deepEqual(clubNeedFinancialFacts({}),[]);
 assert.deepEqual(clubNeedFinancialFacts({salary_budget:'0'}),[['Salary budget','Currency unknown 0 period unknown · tax basis unknown']]);
 assert.deepEqual(clubNeedFinancialFacts({contract_months:12}),[['Initial contract','12 months · guarantee not established']]);
 assert.throws(()=>validateClubNeedBrief({contract_guaranteed:'true'}),/initial contract term/);
});
test('decimal arithmetic is exact, preserves currencies and makes no tax or exchange conversion',()=>{
 const facts=clubNeedFinancialFacts({salary_budget:'1234.567',currency:'KWD',salary_period:'monthly',salary_tax_basis:'net',contract_months:12});
 assert.equal(facts[1][1],'KWD 14,814.804');
 assert.match(facts[0][1],/net$/);
 assert.equal(clubNeedFinancialFacts({salary_budget:'999999999999.9999',currency:'CLF',salary_period:'monthly'})[1][1],'CLF 11,999,999,999,999.9988');
 assert.equal(clubNeedFinancialFacts({salary_budget:'100',currency:'GBP',salary_period:'weekly',contract_months:12}).some(([label])=>label==='Initial-term base budget'),false);
});
test('invalid budgets, precision, enums and terms cannot be saved',()=>{
 for(const salary_budget of ['-1','1e3','NaN','Infinity','1,000','1000000000000','0.00001'])assert.throws(()=>validateClubNeedBrief({salary_budget}));
 for(const brief of [{salary_budget:'100.50',currency:'JPY'},{currency:'XXX'},{salary_period:'daily'},{salary_tax_basis:'tax free'},{contract_months:'0'},{contract_months:'121'},{option_months:'1.5'},{transfer_type:'confirmed'},{source_status:'predicted'},{availability_notes:'x'.repeat(2001)}])assert.throws(()=>validateClubNeedBrief(brief));
 for(const brief of [{salary_budget:'0',currency:'JPY'},{salary_budget:'1.234',currency:'KWD'},{salary_budget:'1.2345',currency:'CLF'},{contract_months:'12',contract_guaranteed:'false'},{salary_budget:'5000'}])assert.doesNotThrow(()=>validateClubNeedBrief(brief));
});
