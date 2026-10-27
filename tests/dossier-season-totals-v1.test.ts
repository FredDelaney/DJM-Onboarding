import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  aggregateFootballStats,
  headlineSeasonRows,
  resolveHeadlineSeason,
} from '../lib/football-season-stats.ts';
import { dossierHeadlineStats, dossierHeadlineStatContext, dossierPerformance } from '../lib/dossier.ts';
import { withProfileStatEvidence } from '../supabase/functions/_shared/profile-stat-evidence.ts';

const jamesRows = [
  {
    season_label: '2026',
    stats_year: 2026,
    club_name: 'Auckland FC Reserves',
    league: 'National League - North',
    appearances: 9,
    starts: 9,
    minutes: 777,
    goals: 0,
    assists: 0,
  },
  {
    season_label: '2025-26',
    stats_year: 2026,
    club_name: 'Auckland FC',
    league: 'A-League Men',
    appearances: 2,
    starts: 0,
    minutes: 13,
    goals: 0,
    assists: 0,
  },
  {
    season_label: '2025',
    stats_year: 2025,
    club_name: 'Auckland FC Reserves',
    league: 'National League',
    appearances: 28,
    starts: 23,
    minutes: 1943,
    goals: 2,
    assists: 0,
  },
];

test('headline totals combine verified competitions in the selected calendar year', () => {
  const season = resolveHeadlineSeason(jamesRows, '2026');
  assert.equal(season, '2026');
  assert.deepEqual(aggregateFootballStats(headlineSeasonRows(jamesRows, season)), {
    appearances: 11,
    starts: 9,
    minutes: 790,
    goals: 0,
    assists: 0,
    contributions: 0,
  });
});

test('cross-year rows never join a calendar year without explicit evidence classification', () => {
  const unclassified = jamesRows.map((row) =>
    row.season_label === '2025-26' ? { ...row, stats_year: null } : row,
  );
  const totals = aggregateFootballStats(headlineSeasonRows(unclassified, '2026'));
  assert.equal(totals.appearances, 9);
  assert.equal(totals.minutes, 777);
});

test('an agent-selected profile statistic is not mixed with unselected career totals', () => {
  assert.deepEqual(dossierHeadlineStats({
    key_stats: [{ label: 'Goals', value: '7' }],
    career_timeline: [{ season_label: '2026', club_name: 'Club', appearances: 20, goals: 7 }],
  }), [{ label: 'Goals', value: '7' }]);
});

test('custom figures never inherit current career period, source or checked date', () => {
  const context=dossierHeadlineStatContext({key_stats:[{label:'Goals',value:0}],career_timeline:[{season_label:'2026',club_name:'Current FC',goals:99,source_name:'Current source',source_reviewed_at:'2026-10-20T12:00:00Z'}]});
  assert.deepEqual(context,{period:'Period not recorded',source:'Source not recorded',date:'Source date not recorded',notes:['']});
});

test('selected historical figures keep their own evidence and genuine zero values', () => {
  const stat=withProfileStatEvidence({label:'Goals',value:0},{season_label:'2025',club_name:'Former FC',league:'League',source_name:'Official report',source_reviewed_at:'2026-01-20T12:00:00Z',notes:'PRIVATE',expected_commission:123,owner_user_id:'PRIVATE'});
  assert.deepEqual(stat,{label:'Goals',value:0,season_label:'2025',club_name:'Former FC',league:'League',source_name:'Official report',source_reviewed_at:'2026-01-20T12:00:00Z'});
  const profile={key_stats:[stat],career_timeline:[{season_label:'2026',club_name:'Current FC',goals:9}]};
  assert.deepEqual(dossierHeadlineStats(profile),[{label:'Goals',value:'0'}]);
  assert.deepEqual(dossierHeadlineStatContext(profile),{period:'2025 · Former FC · League',source:'Official report',date:'Reviewed 20 Jan 2026',notes:['']});
});

test('mixed-period and partly sourced figures retain evidence per figure', () => {
  const context=dossierHeadlineStatContext({key_stats:[
    {label:'Apps',value:10,season_label:'2025',source_name:'Historical source',source_reviewed_at:'2026-01-20T12:00:00Z'},
    {label:'Goals',value:0,season_label:'2026',source_name:'Current source',checked_at:'2026-10-20T12:00:00Z'},
    {label:'Assists',value:3},
  ]});
  assert.equal(context.period,'Selected evidence');
  assert.equal(context.source,'Sources by figure');
  assert.equal(context.date,'Source dates vary');
  assert.deepEqual(context.notes,['2025 · Historical source · Reviewed 20 Jan 2026','2026 · Current source · Checked 20 Oct 2026','Period not recorded · Source not recorded · Date not recorded']);
});

test('fallback career totals and context use the same explicit classified period', () => {
  const profile={career_timeline:jamesRows.map(row=>({...row,source_name:'Official reports',source_reviewed_at:'2026-10-20T12:00:00Z'}))};
  assert.equal(dossierHeadlineStats(profile).find(stat=>stat.label==='Apps')?.value,'11');
  assert.equal(dossierHeadlineStatContext(profile).period,'2026');
  assert.equal(dossierHeadlineStatContext(profile).source,'Official reports');
});

test('invalid source dates never produce freshness claims', () => {
  const stat=withProfileStatEvidence({label:'Apps',value:2},{season_label:'2025',source_name:'Source',checked_at:'not-a-date',source_reviewed_at:'2026'});
  assert.equal(stat.checked_at,undefined);assert.equal(stat.source_reviewed_at,undefined);
  assert.equal(dossierHeadlineStatContext({key_stats:[stat]}).date,'Source date not recorded');
});

test('a missing goals or assists count is unknown, not zero contributions', () => {
  for (const row of [{season_label:'2026',goals:2},{season_label:'2026',assists:0}]) {
    assert.equal(aggregateFootballStats([row]).contributions,null);
    assert.equal(dossierHeadlineStats({career_timeline:[row]}).some(stat=>stat.label==='G+A'),false);
  }
  assert.equal(aggregateFootballStats([{goals:0,assists:0}]).contributions,0);
});

test('career charts omit unknown metric values while retaining a recorded zero', () => {
  const chart=dossierPerformance({career_timeline:[
    {season_label:'2026',club_name:'Current FC',goals:0},
    {season_label:'2025',club_name:'Former FC',appearances:0},
    {season_label:'2024',club_name:'Earlier FC',appearances:33},
  ]});
  assert.equal(chart.metric,'appearances');
  assert.deepEqual(chart.rows.map(row=>[row.season_label,row.visualLabel]),[['2025','0 apps'],['2024','33 apps']]);
});

test('dossier and stats panel use the shared full-period rule and six totals', () => {
  const panel = readFileSync('components/PlayerStatsPanel.tsx', 'utf8');
  const dossier = readFileSync('lib/dossier.ts', 'utf8');
  const publicProfile = readFileSync('components/PublicProfile.tsx', 'utf8');
  const pdf = readFileSync('components/ClubCvPdf.tsx', 'utf8');

  assert.match(panel, /stats_year/);
  assert.match(panel, /All competitions/);
  assert.match(panel, /headlineSeasonRows/);
  assert.match(panel, /Season history/);
  assert.match(dossier, /limit = 6/);
  assert.match(publicProfile, /dossierHeadlineStats\(\s*profile\s*,\s*6\s*,?\s*\)/);
  assert.match(pdf, /dossierHeadlineStats\(\s*profile\s*,\s*6\s*,?\s*\)/);
});

test('production connectivity hotfixes and edge functions are source controlled', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  const compatibility = readFileSync(
    'supabase/migrations/20260902112123_djm_connectivity_preference_compatibility_v1.sql',
    'utf8',
  );
  const reminders = readFileSync(
    'supabase/migrations/20260902112254_djm_smart_reminder_multichannel_delivery_v1.sql',
    'utf8',
  );
  const dossierMigration = readFileSync(
    'supabase/migrations/20260902113027_djm_dossier_season_totals_v1.sql',
    'utf8',
  );

  assert.match(config, /\[functions\.djm-calendar-feed\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.dispatch-djm-email\][\s\S]*verify_jwt = false/);
  assert.match(compatibility, /djm_sync_notification_preference_aliases/);
  assert.match(reminders, /djm_queue_delivery/);
  assert.match(reminders, /djm_queue_smart_reminders/);
  assert.match(dossierMigration, /add column if not exists stats_year smallint/);
  assert.match(dossierMigration, /'G\+A'/);
});
