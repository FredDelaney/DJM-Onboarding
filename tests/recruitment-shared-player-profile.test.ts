import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {recruitmentToPlayerProfile} from '../lib/recruitment-player-profile.ts';

const roster=readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const shared=readFileSync('components/PlayerExperienceDetail.tsx','utf8');
const adapter=readFileSync('lib/recruitment-player-profile.ts','utf8');

test('recruitment and signed players use exactly one detailed profile surface',()=>{
 assert.match(roster,/if \(targetId\) \{/);
 assert.match(roster,/\<PlayerExperienceDetail[\s\S]*?recruitment=\{\{/);
 assert.match(roster,/if \(playerId\) \{/);
 assert.match(shared,/aria-label=\{name\+' player workspace'\}/);
 assert.match(shared,/\['profile','Profile'\],\['tasks','Tasks'\],\['updates','Updates'\],\['deals','Deals'\]/);
 assert.doesNotMatch(roster,/aria-label="Recruitment target workspace"/);
});

test('prospected label never implies an agency-signed player or forged canonical ID',()=>{
 const profile=recruitmentToPlayerProfile({
   id:'recruitment-id',full_name:'Rising Prospect',nationality:'New Zealand',
   primary_position:'Centre back',current_club:'Harbour FC',preferred_foot:'Left',
   raw_stage:'agreement_sent',ui_stage:'offer',date_of_birth:'2003-04-05',
   next_action_at:'2026-12-05T11:00:00Z',contract_expiry:'2027-06-30'
 },[{id:'interaction-1',channel:'phone',direction:'outbound',summary:'Spoke to his coach',occurred_at:'2026-11-04T10:00:00Z'}]);
 assert.equal(profile?.identity.name,'Rising Prospect');
 assert.equal(profile?.identity.recruitment_stage,'Offer');
 assert.equal(profile?.identity.agency_status,null);
 assert.deepEqual(profile?.identity.nationalities,['New Zealand']);
 assert.equal(profile?.identity.current_club,'Harbour FC');
 assert.equal(profile?.activity[0].summary,'Spoke to his coach');
 assert.deepEqual(profile?.agreements,[]);
 assert.deepEqual(profile?.deals,[]);
 assert.equal(profile?.identity.next_action_due,'2026-12-05T11:00:00Z');
 assert.equal(recruitmentToPlayerProfile(null),null);
});

test('recruitment data never calls player-only write endpoints before promotion',()=>{
 assert.match(shared,/if\(!recruitment\)\{/);
 assert.match(shared,/isRecruitment\?'recruitment_target':'player'/);
 assert.match(shared,/!isRecruitment&&canEdit\?<PlayerSalaryTerms/);
 assert.match(shared,/isRecruitment\?<p className=\{styles\.editHelp\}>Agency agents/);
 assert.match(shared,/!isRecruitment&&canEdit\?<PlayerLeadAgentControl/);
 assert.match(shared,/!isRecruitment\?<div className=\{styles\.staffCard\}>/);
 assert.match(shared,/isRecruitment\?'Prospected'/);
 assert.match(shared,/onRecover/);
 assert.match(adapter,/Every write must continue through the recruitment-target API/);
});

test('existing recruitment permissions and promotion gating are retained',()=>{
 assert.match(roster,/canWork:canWorkRecruitment/);
 assert.match(roster,/canPromote:canPromoteRecruitment/);
 assert.match(roster,/nextStage/);
 assert.match(roster,/onConfirmStage:\(\)=>setConfirmStage/);
 assert.match(roster,/onConfirmPromotion:\(\)=>setConfirmPromotion/);
 assert.match(roster,/onRefresh:refreshTarget/);
 assert.match(roster,/onRecover:retryTargetRefresh/);
 assert.match(roster,/recruitment_promote/);
 assert.match(roster,/targetId/);
});
