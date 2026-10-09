import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  brandContrastRatio,
  foregroundForBrandColour,
  readableBrandInk,
  tenantBrandTokens,
} from '../lib/tenant-brand-style.ts';

const layout = readFileSync('app/layout.tsx', 'utf8');
const tenantTheme = readFileSync('app/tenant-theme.css', 'utf8');
const agencyWorkspace = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const playerProfile = readFileSync('components/AgencyPlayerProfile.tsx', 'utf8');
const launch = readFileSync('app/launch/page.tsx', 'utf8');
const activation = readFileSync('app/activate/[tenantSlug]/page.tsx', 'utf8');
const ownerInvite = readFileSync('app/platform/join/[token]/page.tsx', 'utf8');
const agencySettings = readFileSync('app/(djm-os)/settings/agency/page.tsx', 'utf8');
const playerPremium = readFileSync('app/player-premium.css', 'utf8');

test('DJM yellow is preserved as a raw brand accent but never used as unreadable white-surface ink', () => {
  const brand = tenantBrandTokens({
    primary: '#061F3A',
    secondary: '#FFFFFF',
    accent: '#F5E900',
  });

  assert.equal(brand.accentRaw, '#F5E900');
  assert.notEqual(brand.accent, brand.accentRaw);
  assert.ok(brandContrastRatio(brand.accent, '#FFFFFF') >= 4.5);
  assert.equal(foregroundForBrandColour(brand.accentRaw), '#111827');
  assert.equal(brand.onAccentRaw, '#111827');
});

test('brand ink automatically darkens any light tenant colour until it is readable', () => {
  for (const colour of ['#FFFF00', '#FFD54F', '#A7F3D0', '#BFDBFE']) {
    const safe = readableBrandInk(colour, '#FFFFFF');
    assert.ok(
      brandContrastRatio(safe, '#FFFFFF') >= 4.5,
      `${colour} should become readable on white`,
    );
  }
});

test('dark secondary colours cannot silently replace the app canvas', () => {
  const brand = tenantBrandTokens({
    primary: '#F8FAFC',
    secondary: '#111827',
    accent: '#FACC15',
  });
  assert.equal(brand.surface, '#FFFFFF');
  assert.ok(brandContrastRatio(brand.primary, '#FFFFFF') >= 4.5);
});

test('safe tenant tokens are applied at the root shell and primary product surfaces', () => {
  assert.match(layout, /tenantBrandCssVariables/);
  assert.match(tenantTheme, /--tenant-accent-raw/);
  assert.match(tenantTheme, /--tenant-on-primary/);
  assert.match(agencyWorkspace, /tenantBrandCssVariables/);
  assert.match(playerProfile, /tenantBrandTokens/);
});

test('legacy yellow keeps the raw brand accent for decoration but uses safe ink for text', () => {
  const premium = readFileSync('app/player-premium.css', 'utf8');
  assert.match(tenantTheme, /--yellow: var\(--tenant-accent-raw\)/);
  assert.match(tenantTheme, /--yellow-ink: var\(--tenant-accent\)/);
  assert.doesNotMatch(premium, /color: var\(--yellow\);/);
  assert.match(premium, /color: var\(--yellow-ink\);/);
});

test('tenant activation and invite screens also use contrast-safe UI colours', () => {
  assert.match(launch, /tenantBrandTokens/);
  assert.match(activation, /tenantBrandTokens/);
  assert.match(ownerInvite, /tenantBrandTokens/);
  assert.match(activation, /'--launch-primary': launchBrand\.primary/);
  assert.match(ownerInvite, /'--agency-primary': inviteBrand\.primary/);
});



test('Agency settings explains the automatic contrast guardrail before save', () => {
  const settings = readFileSync('app/(djm-os)/settings/agency/page.tsx', 'utf8');
  assert.match(settings, /tenantBrandTokens/);
  assert.match(settings, /Accent highlight/);
  assert.match(settings, /Readable accent text/);
  assert.match(settings, /Text and controls use accessible contrast/);
});

test('tenant admins can see the brand contrast guardrail and player UI uses safe accent ink', () => {
  assert.match(agencySettings, /Text and controls use accessible contrast/);
  assert.match(agencySettings, /brandPreview\.accentRaw/);
  assert.match(agencySettings, /brandPreview\.accent/);
  assert.match(playerPremium, /var\(--yellow-ink\)/);
});
