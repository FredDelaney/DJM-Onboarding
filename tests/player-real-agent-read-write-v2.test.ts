import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(path,'utf8');
const sql=read('supabase/migrations/20261104092849_players_real_agent_assignment_v2.sql');
const roster=read('components/PlayerExperienceDirectory.tsx');
const control=read('components/PlayerLeadAgentControl.tsx');
const detail=read('components/PlayerExperienceDetail.tsx');

test('all three player workspace read models expose recorded lead rather than invented agent data',()=>{
 assert.ok((sql.match(/'primary_agent',/g)||[]).length>=3);
 assert.match(sql,/v_admin then \(select jsonb_build_object/);
 assert.match(sql,/\(v_item->'identity'\) - array\['primary_agent'/);
 assert.match(sql,/from public\.profiles pr where pr\.id=v_player\.primary_staff_user_id/);
 assert.match(roster,/const lead=player\?\.identity\?\.primary_agent/);
 assert.match(roster,/agent\.name/);
 assert.doesNotMatch(roster,/assigned_agent_name/);
});

test('real assignment uses tenant admin authority, an existing audited write and safe player access',()=>{
 assert.match(sql,/create or replace function public\.redream_player_lead_agent_v1/);
 assert.match(sql,/private\.calendar_staff_tenant/);
 assert.match(sql,/private\.user_is_tenant_admin\(v_tenant,auth\.uid\(\)\)/);
 assert.match(sql,/v_previous is distinct from p_expected_agent_id/);
 assert.match(sql,/public\.djm_assign_player\(p_player_id,p_new_agent_id\)/);
 assert.match(sql,/insert into public\.staff_player_access/);
 assert.match(sql,/on conflict \(staff_user_id,player_id\) do nothing/);
 assert.match(sql,/revoke all on function public\.redream_player_lead_agent_v1/);
 assert.match(sql,/grant execute on function public\.redream_player_lead_agent_v1/);
 assert.doesNotMatch(sql,/delete from public\.staff_player_access/);
});

test('agent assignment and notification tagging remain distinct',()=>{
 assert.match(detail,/PlayerLeadAgentControl/);
 assert.match(detail,/PlayerStaffControl/);
 assert.match(control,/redream_player_lead_agent_v1/);
 assert.match(control,/writeWithDeadline/);
 assert.match(control,/p_expected_agent_id:currentId/);
 assert.match(control,/The save could not be confirmed/);
 assert.match(control,/Existing access remains unchanged/);
 assert.doesNotMatch(control,/redream_player_staff_tags_v1/);
});

test('filter controls only use real roster fields and disclose partial-page filtering',()=>{
 for(const category of ['agent','position','status','agencyContract','clubContract','club','clubCountry','nationality','stage'])
  assert.match(roster,new RegExp('key:\\x27'+category+'\\x27'));
 assert.match(roster,/primary\?\.user_id/);
 assert.match(roster,/Filters apply to loaded players/);
 assert.match(roster,/aria-label="Player filters"/);
});
