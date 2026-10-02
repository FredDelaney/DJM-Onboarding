import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('Home v5 is isolated behind a single command-centre scope', () => {
  assert.match(component, /styles\.homeCommandCentre/);
  assert.match(css, /Home command centre v5: single authoritative mobile layer/);
  assert.match(css, /\.homeCommandCentre \.attentionCardPrimary/);
});

test('recent activity icon remains contained inside the row grid', () => {
  assert.match(component, /styles\.homeTimelineIcon/);
  assert.match(css, /grid-template-columns: 34px minmax\(0, 1fr\) 20px/);
  assert.match(css, /\.homeTimelineIcon[\s\S]*overflow: hidden/);
  assert.match(css, /\.homeTimelineIcon svg[\s\S]*display: block[\s\S]*margin: 0/);
});

test('all mobile Home action arrows use centred square geometry', () => {
  assert.match(css, /\.attentionCardPrimary \.compactButton[\s\S]*display: grid[\s\S]*place-items: center/);
  assert.match(css, /\.attentionCard:not\(\.attentionCardPrimary\) \.compactButton[\s\S]*display: grid[\s\S]*place-items: center/);
  assert.match(css, /\.simpleTimelineArrow[\s\S]*align-self: center[\s\S]*justify-self: center/);
});

test('empty Today card stays compact on mobile', () => {
  assert.match(css, /\.homeDayPanel \.emptyState[\s\S]*min-height: 126px/);
});
