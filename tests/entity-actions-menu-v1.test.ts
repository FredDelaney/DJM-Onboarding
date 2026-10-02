import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/EntityActionsMenu.tsx','utf8');
const css = readFileSync('components/EntityActionsMenu.module.css','utf8');

test('shared entity menu exposes edit archive and delete', () => {
  assert.match(source, />Edit</);
  assert.match(source, />Archive</);
  assert.match(source, />Delete</);
  assert.match(source, /redream_entity_patch/);
  assert.match(source, /redream_entity_archive/);
  assert.match(source, /redream_entity_action_preview/);
  assert.match(source, /redream_entity_delete/);
});

test('delete requires preview before permanent confirmation', () => {
  assert.match(source, /Checking linked records/);
  assert.match(source, /Delete permanently/);
  assert.match(source, /impactEntries\(preview\?\.impact\)/);
});

test('entity actions use one premium bottom sheet', () => {
  assert.match(css, /\.sheet[\s\S]*border-radius:\s*24px/);
  assert.match(css, /\.backdrop[\s\S]*backdrop-filter:\s*blur\(4px\)/);
});
