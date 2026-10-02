import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyPursuitRoom.tsx','utf8');
const css = readFileSync('components/AgencyPursuitRoom.module.css','utf8');

test('mobile pursuit page uses one route identity header and compact timeline', () => {
  assert.match(component, /styles\.routePlayer/);
  assert.match(component, /styles\.routeArrow/);
  assert.match(css, /Pursuit page mobile redesign v3/);
  assert.match(css, /\.pagePanel \.journey[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.pagePanel \.step strong[\s\S]*display: none/);
});

test('career-gated route puts Review career plan inside the current-decision hero', () => {
  assert.match(component, /styles\.heroAction/);
  assert.match(component, /Review career plan/);
  assert.match(css, /\.pagePanel \.heroAction[\s\S]*min-height: 46px/);
});

test('commercial deal form stays collapsed while career direction is gated', () => {
  assert.match(component, /!careerIsOpen \? \([\s\S]*styles\.dealLocked/);
  assert.match(component, /Commercial controls stay locked for now/);
  assert.match(css, /\.pagePanel \.dealLocked[\s\S]*background: #f5f7f8/);
});

test('club response and deal control receive dedicated compact mobile surfaces', () => {
  assert.match(component, /styles\.responsePanel/);
  assert.match(component, /styles\.dealPanel/);
  assert.match(css, /\.pagePanel \.responsePanel/);
  assert.match(css, /\.pagePanel \.dealPanel/);
});
