import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/(djm-os)/opportunities/page.tsx', 'utf8');
const resource = readFileSync('components/ClubNeedCardResource.tsx', 'utf8');
const css = readFileSync('components/ClubNeedCardResource.module.css', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260901123000_djm_opportunities_club_card_resource_v1.sql',
  'utf8',
);

test('need cards expose club league country and Transfermarkt identity', () => {
  assert.match(page, /djm_market_needs_v3/);
  assert.match(page, /ClubNeedIdentity/);

  assert.match(resource, /organisation_league_name/);
  assert.match(resource, /organisation_country/);
  assert.match(resource, /transfermarkt_url/);
  assert.match(resource, /League not set/);
  assert.match(resource, /Country not set/);
  assert.match(resource, /Transfermarkt/);

  assert.match(migration, /add column if not exists league_name text/);
  assert.match(migration, /organisation_league_name/);
  assert.match(migration, /transfermarkt_url/);
});

test('club contacts can be created directly from a need card and are attached to that need', () => {
  assert.match(page, /ClubNeedContactControl/);

  assert.match(resource, /Add club contact/);
  assert.match(resource, /djm_market_add_need_contact/);
  assert.match(resource, /Name/);
  assert.match(resource, /Role/);
  assert.match(resource, /Email/);
  assert.match(resource, /WhatsApp/);

  assert.match(migration, /public\.djm_network_upsert_person/);
  assert.match(migration, /source_person_id = v_person_id/);
  assert.match(migration, /CLUB_NEED_CONTACT_LINKED/);
});

test('club identity and contact write paths remain staff-only', () => {
  assert.match(migration, /DJM team access required/);
  assert.match(migration, /revoke all on function public\.djm_market_update_club_identity/);
  assert.match(migration, /revoke all on function public\.djm_market_add_need_contact/);
  assert.match(migration, /grant execute on function public\.djm_market_update_club_identity.*authenticated/);
  assert.match(migration, /grant execute on function public\.djm_market_add_need_contact.*authenticated/);
  assert.match(migration, /Transfermarkt URL must point to a Transfermarkt domain/);
});

test('club card resource is responsive and does not hard reload the app', () => {
  assert.match(css, /\.identity/);
  assert.match(css, /\.contactControl/);
  assert.match(css, /\.inlinePanel/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(resource, /window\.location\.reload/);
  assert.equal(resource.includes('\u2014'), false);
});
