import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCurrentSeasonEvidence, seasonDraft, validateSeasonDraft, refreshOutcome, safeSourceUrl } from '../lib/player-data-workflow.ts';

const player = {current_season_label:'2026/27',current_club:'Example FC II',current_league:'Regional League'};
const row = {id:'r1',season_label:'2026-27',club_name:'Example Reserves',league:'Regional League',appearances:8,starts:5,minutes:450,goals:0,assists:null,source_reviewed_at:'2026-10-01T12:00:00Z',source_name:'Official league',source_url:'https://league.example/player',updated_at:'2026-10-01T12:00:00Z'};
test('current evidence never substitutes first-team, historical or another competition figures', () => {
 const history={...row,id:'old',season_label:'2025/26'};
 const senior={...row,id:'senior',club_name:'Example FC',appearances:30};
 const cup={...row,id:'cup',league:'Regional Cup',appearances:2};
 assert.equal(selectCurrentSeasonEvidence([history,senior,cup,row],player)?.id,'r1');
 assert.equal(selectCurrentSeasonEvidence([history,senior,cup],player),null);
});
test('a tracked season with no evidence remains missing rather than falling back', () => {
 assert.equal(selectCurrentSeasonEvidence([{...row,season_label:'2025/26'}],player),null);
 assert.equal(selectCurrentSeasonEvidence([row],{...player,current_season_label:null}),null);
 assert.equal(selectCurrentSeasonEvidence([row],{...player,current_club:null}),null);
 assert.equal(selectCurrentSeasonEvidence([row],{...player,current_league:null}),null);
});
test('season aliases match without changing calendar-year and split-season meaning', () => {
 assert.equal(selectCurrentSeasonEvidence([{...row,season_label:'2026/2027'}],player)?.id,'r1');
 assert.equal(selectCurrentSeasonEvidence([{...row,season_label:'2026'}],player),null);
});
test('manual reviewed evidence wins over another provider without adding duplicate totals', () => {
 const provider={...row,id:'provider',source_reviewed_at:null,source_provider:'thesportsdb',source_synced_at:'2026-10-05T12:00:00Z',appearances:9};
 assert.equal(selectCurrentSeasonEvidence([provider,row],player)?.id,'r1');
});
test('a draft retains real zero and leaves unsupported statistics blank', () => {
 const draft=seasonDraft(player,row);
 assert.equal(draft.goals,'0');
 assert.equal(draft.assists,'');
 assert.equal(draft.expected_updated_at,row.updated_at);
});
test('manual corrections require a source, context and explicit source review', () => {
 const draft=seasonDraft(player,row);
 assert.match(validateSeasonDraft(draft)||'',/confirm/i);
 draft.source_confirmed=true;
 assert.equal(validateSeasonDraft(draft),null);
 assert.match(validateSeasonDraft({...draft,source_url:'javascript:alert(1)'})||'',/source/i);
 assert.match(validateSeasonDraft({...draft,season_label:''})||'',/season/i);
 assert.match(validateSeasonDraft({...draft,club_name:''})||'',/club/i);
});
test('negative, decimal and inconsistent statistics cannot be saved', () => {
 const draft={...seasonDraft(player,row),source_confirmed:true};
 for(const appearances of ['-1','1.5','Infinity','true']) assert.ok(validateSeasonDraft({...draft,appearances}));
 assert.match(validateSeasonDraft({...draft,appearances:'4',starts:'5'})||'',/starts/i);
 assert.match(validateSeasonDraft({...draft,appearances:'',starts:'',minutes:'',goals:'',assists:''})||'',/figure/i);
});
test('a provider failure with existing figures never claims a successful fresh check', () => {
 const outcome=refreshOutcome({ok:true,refresh_ok:false,current_data:true,current_row:row,ai:{timed_out:true,reason:'AI web research reached the safe time limit.'}});
 assert.equal(outcome.status,'failed');
 assert.equal(outcome.checked_at,null);
 assert.match(outcome.message,/existing|recorded/i);
});
test('a completed check distinguishes retained figures from changed figures', () => {
 const retained=refreshOutcome({ok:true,refresh_ok:true,skipped:true,current_row:row,fresh:true,checked_at:'2026-10-01T12:00:00Z'});
 assert.equal(retained.status,'applied');
 assert.match(retained.message,/already|retained/i);
 assert.equal(retained.checked_at,'2026-10-01T12:00:00Z');
 const updated=refreshOutcome({ok:true,refresh_ok:true,current_data:true,ai:{fields_filled:['appearances','minutes']}},'2026-10-05T12:00:00Z');
 assert.equal(updated.changed_fields.length,2);
 assert.match(updated.message,/review/i);
});
test('unstructured success and missing worker output never count as evidence', () => {
 assert.equal(refreshOutcome({ok:true,current_data:true}).status,'failed');
 assert.equal(refreshOutcome({}).status,'failed');
});
test('only plain http and https source links are rendered', () => {
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:secret@league.example','file:///tmp/x']) assert.equal(safeSourceUrl(value),null);
 assert.equal(safeSourceUrl('https://league.example/player'),'https://league.example/player');
});
