import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const drawer = fs.readFileSync(
  'components/AgencyContactIntelligenceDrawer.tsx',
  'utf8',
);

const migration = fs.readFileSync(
  'supabase/migrations/20260922115228_add_redream_contact_reach_verification_v1.sql',
  'utf8',
);

test('Relationships opens tenant-native contact intelligence in place', () => {
  assert.match(
    workspace,
    /AgencyContactIntelligenceDrawer/,
  );

  assert.match(
    workspace,
    /setSelectedContact/,
  );

  assert.match(
    workspace,
    /Open contact/,
  );

  assert.doesNotMatch(
    workspace,
    /\/network\/contacts\//,
  );
});

test('Contact Intelligence supports direct reach without claiming an external send', () => {
  assert.match(
    drawer,
    /WhatsApp/,
  );

  assert.match(
    drawer,
    /mailto:/,
  );

  assert.match(
    drawer,
    /tel:/,
  );

  assert.match(
    drawer,
    /whatsappHref/,
  );

  assert.doesNotMatch(
    drawer,
    /message sent/i,
  );
});

test('Contact Intelligence exposes Transfermarkt and explicit employment verification', () => {
  assert.match(
    drawer,
    /Find on Transfermarkt/,
  );

  assert.match(
    drawer,
    /Confirm still at/,
  );

  assert.match(
    drawer,
    /redream_relationship_confirm_employment/,
  );

  assert.match(
    drawer,
    /never changes someone's[\s\S]*club or role without[\s\S]*human confirmation/,
  );
});

test('Missing reach data stays actionable rather than blank', () => {
  assert.match(
    drawer,
    /Add email/,
  );

  assert.match(
    drawer,
    /Add WhatsApp/,
  );

  assert.match(
    drawer,
    /Add phone/,
  );

  assert.match(
    drawer,
    /redream_relationship_save_contact_method/,
  );
});

test('Missing reach rows open and focus the exact editor field', () => {
  assert.match(
    drawer,
    /openReachEditor/,
  );

  assert.match(
    drawer,
    /openReachEditor\(\s*'email'/,
  );

  assert.match(
    drawer,
    /openReachEditor\(\s*'whatsapp'/,
  );

  assert.match(
    drawer,
    /openReachEditor\(\s*'phone'/,
  );

  assert.match(
    drawer,
    /ref=\{emailInputRef\}/,
  );

  assert.match(
    drawer,
    /ref=\{whatsappInputRef\}/,
  );

  assert.match(
    drawer,
    /ref=\{phoneInputRef\}/,
  );

  assert.match(
    drawer,
    /contactLineButton/,
  );
});

test('External profiles remain tenant-scoped evidence', () => {
  assert.match(
    migration,
    /djm_os\.person_external_profiles/,
  );

  assert.match(
    migration,
    /tenant_id uuid not null/,
  );

  assert.match(
    migration,
    /private\.redream_request_tenant\(\)/,
  );

  assert.match(
    migration,
    /redream_relationship_save_external_profile/,
  );

  assert.match(
    migration,
    /External profiles are identity and verification evidence/,
  );
});
