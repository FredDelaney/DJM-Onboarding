import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');
const networkCss = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const opportunities = readFileSync('components/AgencyOpportunitiesWorkspace.tsx','utf8');
const opportunitiesCss = readFileSync('components/AgencyOpportunitiesWorkspace.module.css','utf8');

test('Network People cards use compact relationship metadata instead of ownership pill', () => {
  assert.match(network, /styles\.relationshipSummary/);
  assert.doesNotMatch(network, /AgencyOwnershipChip/);
  const final = networkCss.slice(networkCss.lastIndexOf('Network people card refinement v7'));
  assert.match(final, /\.personCard \.personFacts[\s\S]*display: none/);
  assert.match(final, /\.relationshipState[\s\S]*border-radius: 999px/);
});

test('Network People Open club is tertiary navigation', () => {
  const peopleStart = network.indexOf('filteredPeople.map');
  const people = network.slice(peopleStart);
  assert.match(people, /data-ui-button="tertiary"[\s\S]*Open club/);
});

test('Opportunity cards expose semantic card labels', () => {
  assert.match(opportunities, /Club need/);
  assert.match(opportunities, /Player opportunity/);
  assert.match(opportunities, /Live deal/);
  const final = opportunitiesCss.slice(opportunitiesCss.lastIndexOf('Opportunity card refinement v3'));
  assert.match(final, /\.rowEyebrow[\s\S]*text-transform: uppercase/);
});
