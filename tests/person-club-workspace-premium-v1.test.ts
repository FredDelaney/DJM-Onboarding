import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const person = readFileSync('components/AgencyContactIntelligenceDrawer.tsx','utf8');
const personCss = readFileSync('components/AgencyContactIntelligenceDrawer.module.css','utf8');
const actionsCss = readFileSync('components/AgencyRelationshipActions.module.css','utf8');
const memoryCss = readFileSync('components/AgencyRelationshipMemory.module.css','utf8');
const clubCss = readFileSync('components/AgencyClubAccountDrawer.module.css','utf8');

test('person header owns relationship context rather than a duplicate hero card', () => {
  assert.match(person, /styles\.headerMeta/);
  assert.doesNotMatch(person, /styles\.hero/);
  assert.match(personCss, /Person workspace premium hierarchy v4/);
});

test('empty reach collapses to one actionable surface', () => {
  assert.match(person, /styles\.reachEmpty/);
  assert.match(person, /Add contact details/);
  assert.match(person, /quickActions\.length \|\| editingReach/);
});

test('relationship actions use one primary action with compact secondary tools', () => {
  assert.match(actionsCss, /Relationship action hierarchy v3/);
  assert.match(actionsCss, /\.actions button:first-child[\s\S]*grid-column: 1 \/ -1/);
  assert.match(actionsCss, /grid-template-columns: repeat\(3/);
});

test('relationship memory hides empty mobile blocks and uses compact summary strip', () => {
  assert.match(memoryCss, /Relationship memory compression v3/);
  assert.match(memoryCss, /grid-template-columns: 1\.6fr repeat\(3/);
  assert.match(memoryCss, /\.block:has\(\.empty\)[\s\S]*display: none/);
});

test('person employment and context are compressed on mobile', () => {
  const final = personCss.slice(personCss.lastIndexOf('Person workspace premium hierarchy v4'));
  assert.match(final, /\.employment[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(final, /\.contextGrid[\s\S]*grid-template-columns: repeat\(2/);
});

test('club account shares the same premium hierarchy', () => {
  assert.match(clubCss, /Club account premium hierarchy v3/);
  assert.match(clubCss, /\.nextMove[\s\S]*#0b2d49/);
  assert.match(clubCss, /\.quickFacts[\s\S]*repeat\(4/);
});

test('club account row actions stay compact on mobile', () => {
  const final = clubCss.slice(clubCss.lastIndexOf('Club account row action refinement v4'));
  assert.match(final, /\.row[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(final, /\.row button[\s\S]*width: auto/);
});
