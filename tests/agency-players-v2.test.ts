import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const players=readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const edge=readFileSync('supabase/functions/agency-os/index.ts','utf8');
const migration=readFileSync('supabase/migrations/20260925204500_redream_players_recruitment_workspace_v2.sql','utf8');
const recruitment=readFileSync('app/(djm-os)/recruitment/page.tsx','utf8');
const hardening=readFileSync('supabase/migrations/20260925211000_redream_players_recruitment_workspace_v2_hardening.sql','utf8');
const promotion=readFileSync('supabase/migrations/20260925211500_redream_players_recruitment_workspace_v2_promotion_merge.sql','utf8');

test('Players contains Our Players and Recruitment',()=>{
  assert.match(workspace,/AgencyPlayersWorkspace/);
  assert.match(players,/Our Players/);
  assert.match(players,/Recruitment/);
  assert.match(recruitment,/view=players&tab=recruitment/);
});

test('player cards use real football identity and recorded dates',()=>{
  assert.match(players,/profile_photo_path/);
  assert.match(players,/Playing contract/);
  assert.match(players,/Agency agreement/);
  assert.match(players,/Representation agreement not recorded/);
  assert.doesNotMatch(players,/last meaningful player contact/i);
});

test('player workspace exposes simple operating sections and Player Profile',()=>{
  for(const label of ['Overview','Opportunities','Career','Contracts','Activity','Files']){
    assert.match(players,new RegExp(label,'i'));
  }
  assert.match(players,/Player Profile/);
  assert.match(players,/player_workspace/);
  assert.match(migration,/excludes player_private/);
});

test('player service actions stay human controlled',()=>{
  assert.match(players,/player_control_fix_prepare/);
  assert.match(players,/player_service_move_prepare/);
  assert.match(players,/career_strategy_action_prepare/);
});

test('recruitment uses simple seven-stage story over existing state machine',()=>{
  for(const label of ['Identified','Contact','Relationship','Evaluation','Representation discussion','Offer','Represented']){
    assert.match(players,new RegExp(label));
  }
  assert.match(migration,/ready_to_contact','contacted/);
  assert.match(migration,/replied','call_booked/);
  assert.match(migration,/agreement_sent','negotiating/);
});

test('browser recruitment uses only tenant-aware agency server interface',()=>{
  assert.match(edge,/players_workspace/);
  assert.match(edge,/recruitment_board/);
  assert.match(edge,/recruitment_create/);
  assert.match(edge,/recruitment_set_stage/);
  assert.match(edge,/recruitment_log_interaction/);
  assert.match(edge,/recruitment_promote/);
  assert.doesNotMatch(players,/djm_recruitment_/);
});

test('new privileged functions are service-role only and explicit tenant',()=>{
  assert.match(migration,/tenant_id=p_tenant_id/g);
  assert.match(migration,/platform\.tenant_memberships/);
  assert.match(migration,/revoke all on function/);
  assert.match(migration,/grant execute on function/);
  assert.match(migration,/to service_role/);
});

test('promotion does not invent a representation agreement',()=>{
  assert.match(migration,/insert into public\.players/);
  assert.match(migration,/representation_agreement_recorded',false/);
  assert.doesNotMatch(migration,/insert into public\.player_agreements/);
});


test('recruitment writers do not create legacy team members',()=>{
  assert.doesNotMatch(hardening,/platform_server_ensure_team_member/);
  assert.match(hardening,/platform\.tenant_memberships/);
  assert.match(hardening,/platform_actor_user_id/);
});

test('recruitment promotion preserves the existing intelligence subject',()=>{
  assert.match(promotion,/delete from djm_os\.football_intelligence_subjects created/);
  assert.match(promotion,/existing\.prospect_id=p_prospect_id/);
  assert.match(promotion,/tenant_id=p_tenant_id/);
  assert.match(promotion,/representation_agreement_recorded',false/);
});
