import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const players = readFileSync(
  'components/AgencyPlayersWorkspace.tsx',
  'utf8',
);
const styles = readFileSync(
  'components/AgencyPlayersWorkspace.module.css',
  'utf8',
);

test('Players does not repeat the page title inside the workspace', () => {
  assert.doesNotMatch(players, /<p>PLAYERS<\/p>/);
  assert.doesNotMatch(players, /<h2>Your players<\/h2>/);
  assert.doesNotMatch(players, /Who needs you next\./);
  assert.match(players, /Our Players/);
  assert.match(players, /Recruitment/);
});

test('Players keeps one compact controls row for mode search and recruitment creation', () => {
  const toolbar = players.slice(
    players.indexOf('<section className={styles.toolbar}>'),
    players.indexOf("{section==='players'?(", players.indexOf('<section className={styles.toolbar}>')),
  );
  assert.match(toolbar, /styles\.sectionTabs/);
  assert.match(toolbar, /styles\.search/);
  assert.match(toolbar, /Add target/);
});

test('the whole player card opens the full player profile', () => {
  assert.match(players, /className=\{styles\.playerCard\}/);
  assert.match(players, /role="button"/);
  assert.match(players, /aria-label=\{`Open \$\{name\}`\}/);
  assert.match(players, /onClick=\{\(\) => openPlayerProfile\(String\(item\.player_id\)\)\}/);
  assert.match(players, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('player cards keep one explicit next-step control without duplicate desktop actions', () => {
  assert.doesNotMatch(
    players,
    /<UserRound size=\{14\}\/> Open/,
  );
  assert.doesNotMatch(players, /className=\{styles\.playerCardActions\}/);
  assert.match(players, /aria-label=\{`\$\{priority\.actionLabel\} for \$\{name\}`\}/);
  assert.match(players, /event\.stopPropagation\(\);openPriority\(\)/);
  assert.match(players, /Review next step/);
  assert.match(players, /Prepare next move/);
});

test('clickable player cards have clear desktop hover and keyboard focus feedback', () => {
  assert.match(styles, /\.playerCard\[role='button'\]:hover/);
  assert.match(styles, /transform: translateY\(-1px\)/);
  assert.match(styles, /\.playerCard\[role='button'\]:focus-visible/);
});


test('Recruitment target capture is minimum-first with optional detail collapsed', () => {
  assert.match(players,/AgencyCreateDrawer[\s\S]{0,130}kind="recruitment_target"/);
  const shared=readFileSync('components/AgencyCreateDrawer.tsx','utf8');
  const create=shared.slice(shared.indexOf("{kind === 'player'||kind==='recruitment_target'"),shared.indexOf("{kind === 'club' ? ("));
  assert.match(create, /Player name/);
  assert.match(create, /Primary position/);
  assert.match(create, /Current club/);
  assert.match(create, /DetailsToggle/);
  assert.match(create, /showDetails/);
  assert.match(create, /styles\.optionalDetails/);

  const toggleIndex = create.indexOf('<DetailsToggle');
  const countryIndex = create.indexOf('label="Country"');
  const transfermarktIndex = create.indexOf('label="Transfermarkt URL"');
  assert.ok(toggleIndex >= 0);
  assert.ok(countryIndex > toggleIndex);
  assert.ok(transfermarktIndex > toggleIndex);
});
