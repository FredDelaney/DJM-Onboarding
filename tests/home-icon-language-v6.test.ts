import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('Home navigation actions use chevrons rather than long arrows', () => {
  const homeStart = component.indexOf('function Home(');
  const homeEnd = component.indexOf('function Players(', homeStart);
  const home = component.slice(homeStart, homeEnd);
  assert.match(home, /ChevronRight/);
  assert.doesNotMatch(home, /<ArrowRight/);
});

test('recent activity no longer uses boxed speech icons', () => {
  const start = component.indexOf('recentConnected.slice(0, 3)');
  const end = component.indexOf('handledConnectedCount', start);
  const recent = component.slice(start, end);
  assert.doesNotMatch(recent, /MessageCircle/);
  assert.match(css, /Home icon language v6/);
});

test('secondary priority CTAs are lighter than the hero action', () => {
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*width: 36px/);
  assert.match(css, /background: #eef4f8/);
});
