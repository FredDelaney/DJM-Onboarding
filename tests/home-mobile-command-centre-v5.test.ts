import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('Home remains isolated behind one command-centre scope', () => {
  assert.match(component, /styles\.homeCommandCentre/);
  assert.match(css, /Home command centre v5: single authoritative mobile layer/);
  assert.match(css, /\.homeCommandCentre \.attentionCardPrimary/);
});

test('ranked Today cards stay contained on phone', () => {
  assert.match(component, /styles\.todayQueueCard/);
  assert.match(component, /styles\.todayQueueAction/);
  assert.match(css, /\.todayQueueList/);
  assert.match(css, /\.todayQueueCard/);
  assert.match(css, /\.todayQueueAction/);
  assert.match(css, /@media\(max-width:680px\)[\s\S]*\.todayQueueList/);
});

test('mobile Home actions remain thumb-safe labelled controls', () => {
  assert.match(css, /\.todayQueueAction \.compactButton/);
  assert.match(css, /min-width:44px/);
  assert.match(css, /\.todayQueueAction \.compactButton/);
});

test('empty Today state stays bounded', () => {
  assert.match(css, /\.homeTodayQueue \.emptyState\{min-height:180px\}/);
});
