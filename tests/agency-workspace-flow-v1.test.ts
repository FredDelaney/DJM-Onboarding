import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const shellCss = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const playersCss = readFileSync('components/AgencyPlayersWorkspace.module.css','utf8');
const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');
const contact = readFileSync('components/AgencyContactIntelligenceDrawer.tsx','utf8');
const contactCss = readFileSync('components/AgencyContactIntelligenceDrawer.module.css','utf8');

const heavy = [
  ['Club', 'components/AgencyClubAccountDrawer.tsx', 'components/AgencyClubAccountDrawer.module.css'],
  ['Pursuit', 'components/AgencyPursuitRoom.tsx', 'components/AgencyPursuitRoom.module.css'],
  ['Intelligence', 'components/AgencyEntityIntelligenceDrawer.tsx', 'components/AgencyEntityIntelligenceDrawer.module.css'],
  ['Negotiation', 'components/AgencyNegotiationCommandRoom.tsx', 'components/AgencyNegotiationCommandRoom.module.css'],
  ['Business', 'components/AgencyOwnerCommandCentre.tsx', 'components/AgencyOwnerCommandCentre.module.css'],
] as const;

test('represented players and recruitment targets are real URL-backed workspaces', () => {
  assert.match(players, /params\.set\('player', id\)/);
  assert.match(players, /params\.set\('target', id\)/);
  assert.match(players, /role="region" aria-label=\{`\$\{playerName\} player workspace`\}/);
  assert.match(players, /aria-label="Recruitment target workspace"/);
  assert.match(players, /<ArrowLeft size=\{18\}/);
  assert.match(playersCss, /\.playerPagePanel[\s\S]*box-shadow:\s*none/);
});

test('Network person detail is URL-backed and presented as a workspace', () => {
  assert.match(network, /params\.set\('person', id\)/);
  assert.match(network, /presentation="page"/);
  assert.match(contact, /presentation\?: 'drawer' \| 'page'/);
  assert.match(contact, /pageMode[\s\S]*<ArrowLeft size=\{17\}/);
  assert.match(contactCss, /\.pagePanel[\s\S]*box-shadow:\s*none/);
});

test('the generic list header disappears when an entity workspace owns the screen', () => {
  assert.match(shell, /inlineEntityWorkspaceOpen/);
  assert.match(shell, /selectedNetworkPersonId/);
  assert.match(shell, /selectedRecruitmentTargetId/);
  assert.match(shell, /styles\.pageHeadHidden/);
  assert.match(shellCss, /\.pageHeadHidden[\s\S]*display:\s*none/);
});

test('heavy agency work uses full-screen page presentation instead of a side panel', () => {
  for (const [name, sourcePath, cssPath] of heavy) {
    const source = readFileSync(sourcePath,'utf8');
    const css = readFileSync(cssPath,'utf8');
    assert.match(source, /presentation\?: 'drawer' \| 'page'/, `${name} supports page presentation`);
    assert.match(source, /pageMode \? styles\.pageShell : styles\.backdrop/, `${name} switches presentation`);
    assert.match(css, /\.pageShell[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/, `${name} page takes over the screen`);
  }
  assert.match(shell, /presentation="page"/);
});

test('quick actions preserve the heavy workspace behind them', () => {
  assert.doesNotMatch(shell, /onOpenAction=\{\(request\) => \{\s*setPursuitRequest\(null\);\s*setActionRequest\(request\)/);
  assert.doesNotMatch(shell, /onOpenAction=\{\(request\) => \{\s*setClubAccountRequest\(null\);\s*setActionRequest\(request\)/);
  assert.doesNotMatch(shell, /onOpenAction=\{\(request\) => \{\s*setOwnerCommandOpen\(false\);\s*setActionRequest\(request\)/);
  assert.match(shell, /setActionRequest\(request\)/);
});
