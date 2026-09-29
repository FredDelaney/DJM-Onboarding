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

test('the whole player card is the open-player action', () => {
  assert.match(players, /className=\{styles\.playerCard\}/);
  assert.match(players, /role="button"/);
  assert.match(players, /aria-label=\{`Open \$\{name\}`\}/);
  assert.match(players, /onClick=\{\(\) => openPlayer\(String\(item\.player_id\)\)\}/);
  assert.match(players, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('player cards do not duplicate opening with a separate Open button', () => {
  assert.doesNotMatch(
    players,
    /<UserRound size=\{14\}\/> Open/,
  );
  assert.match(players, /\{attention\?\([\s\S]*styles\.playerCardActions/);
  assert.match(players, /Fix this/);
  assert.match(players, /Prepare next move/);
});

test('clickable player cards have clear desktop hover and keyboard focus feedback', () => {
  assert.match(styles, /\.playerCard\[role='button'\]:hover/);
  assert.match(styles, /transform: translateY\(-1px\)/);
  assert.match(styles, /\.playerCard\[role='button'\]:focus-visible/);
});
