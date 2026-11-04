import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {unifyPlayersAndRecruitment,recruitmentRosterTargetId} from '../lib/unified-player-roster.ts';

const existing = [{player_id:'player-1',identity:{name:'Signed Player',agency_status:'signed'}}];
const target = {id:'recruitment-1',full_name:'Example Prospect',nationality:'New Zealand',current_club:'Harbour FC',primary_position:'Centre back',ui_stage:'contact'};

test('combine two separate backend record types without creating a player record',()=>{
 const result = unifyPlayersAndRecruitment(existing,[target],true);
 assert.equal(result.length,2);
 assert.equal(result[0],existing[0]);
 assert.deepEqual(result[1].identity,{
  name:'Example Prospect',date_of_birth:null,nationalities:['New Zealand'],primary_position:'Centre back',
  current_club:'Harbour FC',current_country:'',contract_expiry:null,stage:'Contact'
 });
 assert.equal(result[1].roster_source,'recruitment');
 assert.equal(result[1].recruitment_id,target.id);
 assert.equal(result[1].player_id,'recruitment:recruitment-1');
 assert.equal(result[1].identity.agency_status,undefined);
 assert.equal(result[1].representation.recorded,false);
 assert.equal(existing.length,1);
 assert.equal(recruitmentRosterTargetId(result[1].player_id),target.id);
 assert.equal(recruitmentRosterTargetId(existing[0].player_id),null);
});

test('linked or repeated recruitment targets are never duplicated and names are not used for identity matching',()=>{
 const result=unifyPlayersAndRecruitment(existing,[
  target,target,
  {id:'linked',full_name:'Signed Player',linked_player_id:'player-1'},
  {id:'different-person',full_name:'Signed Player',ui_stage:'evaluation'},
  {id:'',full_name:'Invalid'}
 ],true);
 assert.deepEqual(result.map(row=>row.player_id),['player-1','recruitment:recruitment-1','recruitment:different-person']);
 assert.equal(result[2].identity.stage,'Evaluation');
});

test('recruitment stage signed does not imply an agency-signed status',()=>{
 const result=unifyPlayersAndRecruitment(existing,[{id:'stage-signed',full_name:'Not yet promoted',ui_stage:'represented',raw_stage:'signed'}],true);
 assert.equal(result[1].roster_source,'recruitment');
 assert.equal(result[1].identity.agency_status,undefined);
 assert.equal(result[1].representation.recorded,false);
 assert.equal(result[1].identity.stage,'Represented');
});

test('recruitment entries remain hidden when the role is not authorised',()=>{
 assert.deepEqual(unifyPlayersAndRecruitment(existing,[target],false),existing);
});

test('the combined frontend stays connected to distinct live reads and safe navigation',()=>{
 const coordinator=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
 const workspace=readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
 const directory=readFileSync('components/PlayerExperienceDirectory.tsx','utf8');
 assert.match(coordinator,/loadPlayersDirectory\(/);
 assert.match(readFileSync('lib/players-directory-read.ts','utf8'),/readRecruitmentRoster\(invoke\)/);
 assert.match(readFileSync('lib/recruitment-roster-read.ts','utf8'),/recruitment_error:friendlyError\(error\)/);
 assert.match(workspace,/unifyPlayersAndRecruitment\(players,targets,canWorkRecruitment/);
 assert.match(workspace,/recruitmentRosterTargetId\(id\)/);
 assert.match(workspace,/openTarget\(target,true\)/);
 assert.match(workspace,/returningToRoster/);
 assert.match(directory,/roster_source==='recruitment'\?'prospected'/);
 assert.match(directory,/status==='prospected'\?'Prospected'/);
 assert.match(directory,/recruitmentError/);
 assert.match(directory,/player\?\.roster_source==='recruitment'\?'–':rpc/);
});

test('failed recruitment reads remain visibly recoverable',()=>{
 const loader=readFileSync('lib/recruitment-roster-read.ts','utf8');
 assert.match(loader,/Array.isArray\(response\?\.recruitment\?\.items\)/);
 assert.match(loader,/recruitment_error:friendlyError\(error\)/);
 assert.match(loader,/recruitment:\{items:\[\]\}/);
});
