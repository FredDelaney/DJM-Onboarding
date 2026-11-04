import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const sql=readFileSync(
  'supabase/migrations/20261104152422_recruitment_promotion_signed_agency_status.sql','utf8'
);
const previous=readFileSync(
  'supabase/migrations/20260925211500_redream_players_recruitment_workspace_v2_promotion_merge.sql','utf8'
);

test('only confirmed recruitment promotion creates a Signed agency player',()=>{
  assert.match(previous,/v_prospect\.recruitment_stage<>'signed'/);
  assert.match(sql,/v_prospect\.recruitment_stage/);
  assert.match(sql,/agency_status/);
  assert.match(sql,/'football_status,\\1agency_status,\\1onboarding_status,'/);
  assert.match(sql,/'\\1\\2''signed'',\\2\\3'/);
  assert.doesNotMatch(sql,/insert into public\.player_agreements/i);
  assert.doesNotMatch(sql,/update public\.players/i);
  assert.doesNotMatch(sql,/alter table public\.players/i);
});

test('migration only patches recognised writer and preserves tenant boundaries',()=>{
  assert.match(sql,/regexp_count\(v_original, v_columns_old\) <> 1/);
  assert.match(sql,/regexp_count\(v_original, v_values_old\) <> 1/);
  assert.match(sql,/platform\.tenant_memberships/);
  assert.match(sql,/public\.staff_player_access/);
  assert.match(sql,/pg_get_functiondef/);
  assert.match(sql,/EXECUTE v_updated/);
  assert.match(sql,/CREATE OR REPLACE retains/);
  assert.doesNotMatch(sql,/grant execute|revoke all/i);
  assert.match(sql,/IF regexp_count\(v_original, v_columns_new\) = 1/);
});

test('the promotion patch supports both spaced and compact existing SQL',()=>{
  for(const [cols,vals] of [
    ['football_status,\n    onboarding_status,',"'active',\n    'not_started',"],
    ['football_status,\n    onboarding_status,',"'active','not_started',"],
  ]){
    const original='insert into public.players('+cols+') values('+vals+')';
    const patched=original
      .replace(/football_status,(\s*)onboarding_status,/,(_m,ws)=>'football_status,'+ws+'agency_status,'+ws+'onboarding_status,')
      .replace(/('active',)(\s*)('not_started',)/,(_m,a,ws,b)=>a+ws+"'signed',"+ws+b);
    assert.match(patched,/football_status,\s*agency_status,\s*onboarding_status,/);
    assert.match(patched,/'active',\s*'signed',\s*'not_started',/);
    assert.equal(original.includes('agency_status'),false);
  }
});
