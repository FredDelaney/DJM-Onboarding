import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('components/ClubNeedCardResource.tsx', 'utf8');
const css = readFileSync('components/ClubNeedCardResource.module.css', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260901131500_djm_opportunities_existing_contact_link_v1.sql',
  'utf8',
);

test('need card can select and link an existing club contact', () => {
  assert.match(component, /djm_network_club_workspace/);
  assert.match(component, /Use an existing club contact/);
  assert.match(component, /Choose a club contact/);
  assert.match(component, /djm_market_link_need_contact/);
  assert.match(component, /Link contact/);
  assert.match(component, /or create a new contact/);
});

test('existing contact linker refuses cross-club or historical contacts', () => {
  assert.match(migration, /e\.organisation_id = v_org_id/);
  assert.match(migration, /e\.person_id = p_person_id/);
  assert.match(migration, /e\.is_current = true/);
  assert.match(migration, /<> 'player'/);
  assert.match(migration, /Selected person is not a current contact at this club/);
});

test('existing contact linking is staff-only and does not duplicate Network people', () => {
  assert.match(migration, /DJM team access required/);
  assert.match(migration, /source_person_id = p_person_id/);
  assert.match(migration, /CLUB_NEED_EXISTING_CONTACT_LINKED/);
  assert.doesNotMatch(migration, /insert into djm_os\.people/i);
  assert.doesNotMatch(migration, /djm_network_upsert_person/);
  assert.match(
    migration,
    /revoke all on function public\.djm_market_link_need_contact\(uuid, uuid\) from anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.djm_market_link_need_contact\(uuid, uuid\) to authenticated/,
  );
});

test('existing contact selector stays responsive and source contains no em dash', () => {
  assert.match(css, /\.existingLinkRow/);
  assert.match(css, /\.inlinePanel select/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.equal(component.includes('\u2014'), false);
  assert.equal(migration.includes('\u2014'), false);
});
