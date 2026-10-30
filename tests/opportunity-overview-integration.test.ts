import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const src=readFileSync(new URL('../components/AgencyOpportunitiesWorkspace.tsx',import.meta.url),'utf8');
test('new overview is opt-in until real agency acceptance',()=>{
  assert.match(src,/value === 'overview'/);
  assert.match(src,/AgencyOpportunityOverview/);
  assert.match(src,/view === 'overview' \? <AgencyOpportunityOverview/);
  assert.match(src,/view !== 'overview' \? <section className=\{styles\.listCard\}>/);
  assert.match(src,/\? value : 'needs'/);
});
