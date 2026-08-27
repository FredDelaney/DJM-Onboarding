import assert from 'node:assert/strict';
import test from 'node:test';

import { buildResearchLinks, normaliseWebUrl, whatsappHref } from '../lib/research-links.ts';

test('builds WhatsApp click-to-chat only from plausible international numbers', () => {
  assert.equal(whatsappHref('+39 333 123 4567'), 'https://wa.me/393331234567');
  assert.equal(whatsappHref('0039 333 123 4567'), 'https://wa.me/393331234567');
  assert.equal(whatsappHref('1234'), null);
});

test('normalises saved web links and rejects unsafe protocols', () => {
  assert.equal(normaliseWebUrl('www.sofascore.com/player/test/1'), 'https://www.sofascore.com/player/test/1');
  assert.equal(normaliseWebUrl('javascript:alert(1)'), null);
});

test('uses saved player profiles before targeted research searches', () => {
  const links = buildResearchLinks({
    kind: 'player',
    name: 'Ada Striker',
    clubName: 'Example FC',
    transfermarktUrl: 'https://www.transfermarkt.com/ada/profil/spieler/1',
  });

  assert.equal(links.find((link) => link.platform === 'transfermarkt')?.mode, 'direct');
  assert.equal(links.some((link) => link.platform === 'sofascore'), false);
  assert.equal(links.find((link) => link.platform === 'instagram')?.mode, 'search');
  assert.match(links.find((link) => link.platform === 'instagram')?.href || '', /^https:\/\/www\.instagram\.com\/explore\/search\/keyword\//);
  assert.equal(links.some((link) => link.href.includes('google.com')), false);
});

test('shows a stats platform only when a saved direct profile exists', () => {
  const links = buildResearchLinks({
    kind: 'player',
    name: 'Ada Striker',
    statsUrl: 'https://www.sofascore.com/player/ada-striker/123',
  });

  const stats = links.find((link) => link.platform === 'sofascore');
  assert.equal(stats?.mode, 'direct');
  assert.equal(stats?.href, 'https://www.sofascore.com/player/ada-striker/123');
});

test('gives clubs a complete organisation research set', () => {
  const links = buildResearchLinks({
    kind: 'club',
    name: 'Wellington Phoenix',
    country: 'New Zealand',
    websiteUrl: 'wellingtonphoenix.com',
  });

  assert.deepEqual(
    links.map((link) => link.platform),
    ['website', 'transfermarkt', 'instagram', 'linkedin'],
  );
  assert.equal(links[0].mode, 'direct');
  assert.equal(links[1].mode, 'search');
  assert.equal(links.some((link) => link.href.includes('google.com')), false);
});

test('keeps club-contact research focused on messaging and professional identity', () => {
  const links = buildResearchLinks({
    kind: 'contact',
    name: 'Alex Director',
    clubName: 'Example FC',
    whatsapp: '+44 7700 900123',
    email: 'alex@example.com',
    linkedinUrl: 'linkedin.com/in/alex-director',
  });

  assert.deepEqual(
    links.map((link) => link.platform),
    ['whatsapp', 'email', 'linkedin', 'instagram'],
  );
  assert.equal(links.find((link) => link.platform === 'linkedin')?.mode, 'direct');
  assert.equal(links.some((link) => link.platform === 'transfermarkt'), false);
});
