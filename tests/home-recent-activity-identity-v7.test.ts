import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('Home recent activity uses identity initials instead of speech icons', () => {
  const start = component.indexOf('recentConnected.slice(0, 3)');
  const end = component.indexOf('handledConnectedCount', start);
  const recent = component.slice(start, end);
  assert.match(recent, /homeTimelineAvatar/);
  assert.match(recent, /activityInitial/);
  assert.doesNotMatch(recent, /MessageCircle/);
});

test('Recent activity identity marker is compact and circular', () => {
  assert.match(css, /Home recent-activity identity v7/);
  assert.match(css, /\.homeTimelineAvatar[\s\S]*width: 28px[\s\S]*border-radius: 50%/);
});
