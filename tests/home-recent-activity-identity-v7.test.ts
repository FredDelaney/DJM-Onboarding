import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

const homeStart = component.indexOf('function Home(');
const homeEnd = component.indexOf('function Players(', homeStart);
const home = component.slice(homeStart, homeEnd);

test('Home does not render raw recent conversations as a second feed', () => {
  assert.doesNotMatch(home, /recentConnected/);
  assert.doesNotMatch(home, /homeTimelineAvatar/);
  assert.doesNotMatch(home, /MessageCircleMore[\s\S]*recentConnected/);
});

test('Home uses structured ranked cards for visible context', () => {
  assert.match(home, /styles\.todayQueueCard/);
  assert.match(home, /item\.category\.toUpperCase\(\)/);
  assert.match(home, /item\.why/);
  assert.match(css, /\.todayQueueCard/);
});
