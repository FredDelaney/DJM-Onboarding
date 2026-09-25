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
const retirement = readFileSync(
  'supabase/migrations/20260925123500_retire_legacy_djm_staff_runtime_v1.sql',
  'utf8',
);

test('legacy Opportunities route hands off to the shared ReDream Market', () => {
  assert.match(page, /redirect\('\/agency\?view=market'\)/);
  assert.doesNotMatch(page, /djm_market_needs_v3|ClubNeedIdentity|ClubNeedContactControl/);
});

test('historical club-card resource keeps its recorded identity and contact contract', () => {
  assert.match(resource, /organisation_league_name/);
  assert.match(resource, /organisation_country/);
  assert.match(resource, /transfermarkt_url/);
  assert.match(resource, /League not set/);
  assert.match(resource, /Country not set/);
  assert.match(resource, /Transfermarkt/);
  assert.match(resource, /Add club contact/);
  assert.match(resource, /djm_market_add_need_contact/);

  assert.match(migration, /add column if not exists league_name text/);
  assert.match(migration, /organisation_league_name/);
  assert.match(migration, /source_person_id = v_person_id/);
  assert.match(migration, /CLUB_NEED_CONTACT_LINKED/);
});

test('legacy club-card write RPCs are retired from browser execution', () => {
  assert.match(retirement, /djm_market_%/);
  assert.match(
    retirement,
    /revoke all on function %s from public, anon, authenticated/,
  );
  assert.match(
    retirement,
    /grant execute on function %s to service_role/,
  );
});

test('historical club card resource is responsive and does not hard reload the app', () => {
  assert.match(css, /\.identity/);
  assert.match(css, /\.contactControl/);
  assert.match(css, /\.inlinePanel/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(resource, /window\.location\.reload/);
  assert.equal(resource.includes('\u2014'), false);
});
