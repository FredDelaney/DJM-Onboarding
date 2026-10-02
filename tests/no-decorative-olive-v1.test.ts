import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'components/AgencyPursuitRoom.module.css',
  'components/AgencyActionDrawer.module.css',
  'app/djm-os-ux-overhaul.css',
];
const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
const forbidden = [
  '#969638', '#aeb45b', '#7f8525', '#8a934e', '#8b8f37', '#a9a94f',
  '#735d17', '#937d35', '#f8f3df',
];

test('decorative olive/mustard colour family is removed from product surfaces', () => {
  for (const colour of forbidden) {
    assert.doesNotMatch(source.toLowerCase(), new RegExp(colour.slice(1), 'i'));
  }
});

test('route and decision accents now use professional slate/navy tones', () => {
  const pursuit = readFileSync('components/AgencyPursuitRoom.module.css','utf8');
  const drawer = readFileSync('components/AgencyActionDrawer.module.css','utf8');
  assert.match(pursuit, /\.routeArrow[\s\S]*color: #5f7385/);
  assert.match(drawer, /color: #52697d/);
});
