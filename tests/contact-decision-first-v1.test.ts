import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contact = readFileSync('components/AgencyContactIntelligenceDrawer.tsx', 'utf8');
const css = readFileSync('components/AgencyContactIntelligenceDrawer.module.css', 'utf8');

test('contact workspace leads with one context-aware next move', () => {
  assert.match(contact, /const nextMove = !quickActions\.length/);
  assert.match(contact, /Add a direct contact route/);
  assert.match(contact, /Confirm .*current role/);
  assert.match(contact, /Contact \$\{name\}/);
  assert.match(contact, /aria-label=\"Next relationship action\"/);
  assert.match(css, /\.nextMove \{/);
});

test('contact workspace puts reach and employment before relationship administration', () => {
  const next = contact.indexOf('aria-label="Next relationship action"');
  const reach = contact.indexOf('Contact now');
  const employment = contact.indexOf('CURRENT EMPLOYMENT');
  const relationshipActions = contact.indexOf('<AgencyRelationshipActions', reach);
  const memory = contact.indexOf('<AgencyRelationshipMemory', reach);
  const birthday = contact.indexOf('<AgencyBirthdayEditor', reach);
  assert.ok(next > -1 && reach > next);
  assert.ok(employment > reach);
  assert.ok(relationshipActions > employment);
  assert.ok(memory > relationshipActions);
  assert.ok(birthday > memory);
});
