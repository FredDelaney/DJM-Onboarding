import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.module.css', 'utf8');
const network = readFileSync('components/AgencyNetworkWorkspace.module.css', 'utf8');
const opportunities = readFileSync('components/AgencyOpportunitiesWorkspace.module.css', 'utf8');
const calendar = readFileSync('components/AgencyCalendarWorkspace.module.css', 'utf8');

test('premium mobile pass covers every primary workspace', () => {
  for (const css of [shell, players, network, calendar]) {
    assert.match(css, /Premium mobile product v1/);
  }
  assert.match(opportunities, /width: 44px[\s\S]*min-height: 44px/);
});

test('primary mobile navigation and context actions remain comfortably tappable', () => {
  assert.match(shell, /\.nav a[\s\S]*min-height: 48px[\s\S]*font-size: 10px/);
  assert.match(shell, /mobileContextAction \.createButton[\s\S]*min-height: 44px[\s\S]*font-size: 13px/);
  assert.match(shell, /\.mobileTell button[\s\S]*width: 54px[\s\S]*height: 54px/);
});

test('home uses readable priority cards and full-row actions', () => {
  assert.match(shell, /\.attentionCard[\s\S]*grid-template-columns: minmax\(0, 1fr\) 44px/);
  assert.match(shell, /\.attentionCopy strong[\s\S]*font-size: 14px/);
  assert.match(shell, /\.attentionCard \.compactButton[\s\S]*width: 44px[\s\S]*min-height: 44px/);
  assert.match(shell, /\.attentionCard \.compactButton::before[\s\S]*inset: 0/);
});

test('players use readable identity-first cards and 44px controls', () => {
  assert.match(players, /\.sectionTab,[\s\S]*\.sectionTabActive[\s\S]*min-height: 44px[\s\S]*font-size: 13px/);
  assert.match(players, /\.playerIdentity h3[\s\S]*font-size: 15px/);
  assert.match(players, /\.playerIdentity span[\s\S]*font-size: 11px/);
  assert.match(players, /\.playerTab,[\s\S]*\.playerTabActive[\s\S]*min-height: 44px[\s\S]*font-size: 11px/);
});

test('network cards use readable hierarchy and one strong mobile action', () => {
  assert.match(network, /\.tab,[\s\S]*\.tabActive[\s\S]*min-height: 44px[\s\S]*font-size: 13px/);
  assert.match(network, /\.identity h3[\s\S]*font-size: 17px/);
  assert.match(network, /\.primaryAction[\s\S]*width: 100%[\s\S]*min-height: 44px[\s\S]*font-size: 12px/);
});

test('calendar rows are readable and the whole row activates the single action', () => {
  assert.match(calendar, /\.rangeButton,[\s\S]*\.rangeActive[\s\S]*min-height: 44px[\s\S]*font-size: 13px/);
  assert.match(calendar, /\.row,[\s\S]*\.rowAttention[\s\S]*grid-template-columns: 52px minmax\(0, 1fr\) 44px/);
  assert.match(calendar, /\.copy strong[\s\S]*font-size: 14px/);
  assert.match(calendar, /\.action[\s\S]*width: 44px[\s\S]*min-height: 44px/);
  assert.match(calendar, /\.action::before[\s\S]*inset: 0/);
});
