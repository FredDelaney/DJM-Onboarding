import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PLAYER_AGENCY_STATUSES,playerAgencyStatus,playerAgencyStatusLabel} from '../lib/player-agency-status.ts';

const directory=readFileSync('components/PlayerExperienceDirectory.tsx','utf8');
const detail=readFileSync('components/PlayerExperienceDetail.tsx','utf8');
const migration=readFileSync('supabase/migrations/20261103230347_player_agency_status_three_tags.sql','utf8');

test('agency relationship has only three supported tags',()=>{
  assert.deepEqual(PLAYER_AGENCY_STATUSES.map(v=>v.value),['signed','prospect','mandated']);
  assert.deepEqual(PLAYER_AGENCY_STATUSES.map(v=>v.label),['Signed','Prospect','Mandated']);
  for(const value of ['signed','prospect','mandated'])assert.equal(playerAgencyStatus(value),value);
  assert.equal(playerAgencyStatus('active'),'prospect');
  assert.equal(playerAgencyStatus('represented'),'prospect');
  assert.equal(playerAgencyStatusLabel('mandated'),'Mandated');
});

test('roster and player profile use agency status, not service or football status',()=>{
  assert.match(directory,/identity\?\.agency_status/);
  assert.match(directory,/playerAgencyStatusLabel\(status\)/);
  assert.match(directory,/Agency status filter/);
  assert.doesNotMatch(directory,/service\?\.state\|\|player\?\.identity\?\.representation_status/);
  assert.match(detail,/playerAgencyStatusLabel\(identity\.agency_status\)/);
  assert.match(detail,/Agency status<select/);
  assert.match(detail,/patch\.agency_status=agencyStatusDraft/);
});

test('database validates and exposes status on each player read model',()=>{
  assert.match(migration,/check \(agency_status in \('signed','prospect','mandated'\)\)/);
  assert.equal((migration.match(/'agency_status',v_player\.agency_status/g)||[]).length,3);
  assert.match(migration,/p_patch-'agency_status'/);
  assert.match(migration,/private\.redream_entity_management_access/);
  assert.match(migration,/private\.user_is_tenant_admin/);
  assert.match(migration,/PLAYER_AGENCY_STATUS_CHANGED/);
  assert.doesNotMatch(migration,/set football_status=/);
});
