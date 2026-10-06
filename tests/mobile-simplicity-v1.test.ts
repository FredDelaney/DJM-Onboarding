import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const shellCss = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const playersCss = readFileSync('components/AgencyPlayersWorkspace.module.css','utf8');
const opportunitiesCss = readFileSync('components/AgencyOpportunitiesWorkspace.module.css','utf8');
const networkCss = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const pursuit = readFileSync('components/AgencyPursuitRoom.tsx','utf8');
const pursuitCss = readFileSync('components/AgencyPursuitRoom.module.css','utf8');
const owner = readFileSync('components/AgencyOwnerCommandCentre.tsx','utf8');
const launcher = readFileSync('components/AiLauncher.tsx','utf8');
const capture = readFileSync('components/AiCapture.tsx','utf8');
const captureCss = readFileSync('components/AiCapture.module.css','utf8');
const relationshipCss = readFileSync('components/AgencyRelationshipMemory.module.css','utf8');
const account = readFileSync('components/AccountMenu.tsx','utf8');

test('mobile primary navigation stays focused on five everyday destinations', () => {
  assert.match(shell, /styles\.navManagement/);
  assert.match(shellCss, /\.navManagement[\s\S]*display:\s*none/);
  assert.match(account, /label="Business"/);
  assert.match(account, /workspaceBase/);
});

test('mobile header keeps account identity and moves Tell ReDream to one persistent control', () => {
  assert.match(shell, /desktopHeadActions/);
  assert.match(shell, /mobileHeadActions/);
  assert.match(shell, /mobileTell/);
  assert.match(shellCss, /\.mobileTell[\s\S]*position:\s*fixed/);
});

test('Home shows one bounded five-item queue on mobile', () => {
  assert.match(shell, /\.slice\(0, 5\)/);
  assert.match(shell, /styles\.homeTodayQueue/);
  assert.match(shell, /styles\.todayQueueCard/);
  assert.match(shellCss, /\.todayQueueList/);
  assert.match(shellCss, /\.todayQueueAction/);
  assert.doesNotMatch(shellCss, /\.homePulseGrid\s*\{/);
  assert.doesNotMatch(shellCss, /\.connectedWorkRow\s*\{/);
});

test('player list is scan-first and player detail exposes four primary tabs', () => {
  assert.match(players, /role="button"/);
  assert.match(players, /\['overview','opportunities','career','more'\]/);
  assert.match(players, /More player detail/);
  assert.match(playersCss, /\.playerFacts > div:nth-child\(1\)/);
  assert.match(playersCss, /\.playerFacts > div:nth-child\(3\)/);
});

test('opportunities and Network defer supporting evidence on phone', () => {
  assert.match(opportunitiesCss, /\.connectedContextCopy > span,[\s\S]*display:\s*none/);
  assert.match(networkCss, /\.hero[\s\S]*display:\s*none/);
  assert.match(networkCss, /\.signalBar[\s\S]*display:\s*none/);
  assert.match(networkCss, /\.peopleBlock[\s\S]*display:\s*none/);
});

test('Pursuit Room speaks like an agent workflow while preserving internal controls', () => {
  assert.match(pursuit, /Confirm player direction/);
  assert.doesNotMatch(pursuit, /BEFORE YOU CONTACT THE CLUB/);
  assert.match(pursuit, /Commercial controls stay locked for now/);
  assert.match(pursuit, /Review career plan/);
  assert.doesNotMatch(pursuit, /NEXT LEGITIMATE MOVE/);
  assert.match(pursuitCss, /\.heroScore,[\s\S]*\.grid[\s\S]*display:\s*none/);
});

test('Business uses plain agency language', () => {
  assert.match(owner, /Run the agency/);
  assert.match(owner, /Deals, money owed, player service and who owns what/);
  assert.doesNotMatch(owner, /Run the business without losing the football/);
});

test('Tell ReDream compact mode is materially smaller on phone', () => {
  assert.match(launcher, />Tell ReDream</);
  assert.match(capture, /compact \? styles\.compact/);
  assert.match(captureCss, /\.compact \.hero[\s\S]*min-height:\s*250px/);
  assert.match(relationshipCss, /-webkit-line-clamp:\s*2/);
});
