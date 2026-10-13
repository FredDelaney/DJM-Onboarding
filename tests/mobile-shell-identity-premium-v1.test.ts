import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const brand = readFileSync('components/TenantWorkspaceBrand.module.css','utf8');
const account = readFileSync('components/AccountMenu.module.css','utf8');
const accountTsx = readFileSync('components/AccountMenu.tsx','utf8');
const shell = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');

test('mobile agency identity uses a consistent squircle tile', () => {
  const final = brand.slice(brand.lastIndexOf('Premium mobile workspace identity v2'));
  assert.match(final, /width: 44px/);
  assert.match(final, /height: 44px/);
  assert.match(final, /border-radius: 13px/);
  assert.doesNotMatch(final, /border-radius: 50%/);
});

test('mobile account trigger matches the same shell geometry', () => {
  const final = account.slice(account.lastIndexOf('Premium mobile account identity v2'));
  assert.match(final, /\.trigger[\s\S]*width: 44px[\s\S]*height: 44px[\s\S]*border-radius: 13px/);
  assert.match(final, /\.avatar[\s\S]*width: 32px[\s\S]*height: 32px[\s\S]*border-radius: 9px/);
});

test('mobile top bar uses a professional monogram rather than tiny profile photography', () => {
  assert.match(accountTsx, /styles\.mobileMonogram/);
  assert.match(accountTsx, /styles\.desktopAvatar/);
  const final = account.slice(account.lastIndexOf('Premium mobile account identity v2'));
  assert.match(final, /\.avatar > \.desktopAvatar[\s\S]*display: none/);
});

test('page title is optically centred between matched identity controls', () => {
  const final = shell.slice(shell.lastIndexOf('Premium mobile shell chrome v3'));
  assert.match(final, /\.pageHeadCopy[\s\S]*padding-inline: 54px/);
  assert.match(final, /\.mobileTenantBrand[\s\S]*top: 0/);
  assert.match(final, /\.mobileHeadActions[\s\S]*top: 0/);
});
