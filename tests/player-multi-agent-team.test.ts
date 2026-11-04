import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(p:string)=>readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261104103833_player_team_agents_v1.sql');
const directory=read('components/PlayerExperienceDirectory.tsx');
const detail=read('components/PlayerExperienceDetail.tsx');
const control=read('components/PlayerTeamAgentsControl.tsx');

test('the roster shows all assigned agents and makes its Agent cell editable',()=>{
 assert.match(directory,/identity\?\.assigned_agents/);
 assert.match(directory,/agentsOf\(player\)/);
 assert.match(directory,/PlayerTeamAgentsControl playerId=\{id\}/);
 assert.match(directory,/onAgentsChanged/);
 assert.match(directory,/assignedAgents\.some\(a=>a\.user_id===wanted\)/);
 assert.match(directory,/!player\?\.access\?\.restricted/);
 assert.match(detail,/PlayerTeamAgentsControl/);
 assert.match(control,/role="dialog" aria-label=\{'Manage agents for '/);
 assert.match(control,/aria-label="Search agents"/);
 assert.match(control,/aria-label=\{person\.name\}/);
 assert.match(control,/Save agents/);
});

test('agent teams are not the single lead, notification tags or permission records',()=>{
 assert.match(migration,/create table if not exists platform\.player_agent_teams/);
 assert.match(migration,/private\.redream_player_agent_people/);
 assert.match(migration,/union all select p_lead_user_id/);
 assert.match(migration,/revision integer not null/);
 assert.match(migration,/platform\.audit_events/);
 assert.match(migration,/insert into public\.staff_player_access/);
 assert.match(migration,/can_edit\)\s*select selected\.user_id,p_player_id,false/);
 assert.doesNotMatch(migration,/delete from public\.staff_player_access/);
 assert.doesNotMatch(migration,/delete from platform\.player_staff_tags/);
 assert.match(control,/Reminder tags and edit permissions remain separate/);
});

test('all player read models expose the multi-agent team with privacy redaction',()=>{
 assert.equal((migration.match(/'assigned_agents',private\.redream_player_agent_people/g)||[]).length,3);
 assert.match(migration,/\(v_item->'identity'\) - array\['assigned_agents','primary_agent'/);
 assert.match(migration,/platform\.tenant_memberships m/);
 assert.match(migration,/public\.profiles pr/);
});

test('writes verify scope, active agency members and no stale overwrite',()=>{
 assert.match(migration,/private\.user_is_tenant_admin\(v_tenant,auth\.uid\(\)\)/);
 assert.match(migration,/p_expected_revision is distinct from v_revision/);
 assert.match(migration,/m\.tenant_id=v_tenant and m\.user_id=selected\.user_id/);
 assert.match(migration,/m\.status='active'/);
 assert.match(migration,/on conflict\(staff_user_id,player_id\) do nothing/);
 assert.match(migration,/revoke all on platform\.player_agent_teams from public,anon,authenticated/);
 assert.match(migration,/revoke all on function public\.redream_player_agents_v1/);
 assert.match(migration,/grant execute on function public\.redream_player_agents_v1/);
 assert.match(control,/writeWithDeadline/);
 assert.match(control,/p_expected_revision:data\.revision/);
 assert.match(control,/Reload this player before changing agents again/);
});
