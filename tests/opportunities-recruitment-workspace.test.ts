import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/(djm-os)/opportunities/page.tsx', 'utf8');
const css = readFileSync('app/(djm-os)/opportunities/page.module.css', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260901110000_djm_opportunities_recruitment_workspace_v1.sql',
  'utf8',
);

test('club needs render as complete recruitment briefs for scouts', () => {
  for (const label of [
    'Primary position',
    'Secondary position',
    'Age range',
    'Preferred foot',
    'Minimum height',
    'Transfer type',
    'Transfer fee budget',
    'Salary budget',
    'Salary period',
    'Salary tax basis',
    'Nationality preference',
    'Passport requirement',
    'Foreign player rules',
    'Playing style',
    'Original club wording',
    'Scout profile notes',
    'Registration notes',
    'Source context',
  ]) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(page, /source_person_name/);
  assert.match(page, /source_person_role/);
  assert.match(page, /Open relationship record/);
  assert.match(page, /No contact linked/);
});

test('quick need capture links the real club contact and opens structured editing', () => {
  assert.match(page, /djm_network_club_workspace/);
  assert.match(page, /p_source_person_id: sourcePersonId \|\| null/);
  assert.match(page, /djm_market_create_need_from_text/);
  assert.match(page, /djm_market_update_need_v2/);
  assert.match(page, /Save recruitment brief/);
});

test('follow-up tasks belong to the specific club need and are editable in Opportunities', () => {
  assert.match(page, /djm_market_need_workspace/);
  assert.match(page, /djm_market_upsert_need_task/);
  assert.match(page, /Tasks for this need/);
  assert.match(page, /Follow-up date/);
  assert.match(page, /Update task/);

  assert.match(migration, /t\.club_need_id = p_need_id/);
  assert.match(migration, /club_need_id = p_need_id/);
  assert.match(migration, /Only the task owner can edit this task/);
  assert.match(migration, /Task contact must be linked to this club/);
  assert.match(migration, /DJM team access required/);
});

test('need cards expose the scouting and follow-up information needed before opening the brief', () => {
  assert.match(page, /label="Age"/);
  assert.match(page, /label="Transfer fee"/);
  assert.match(page, /label="Salary"/);
  assert.match(page, /label="Deal"/);
  assert.match(page, /label="Foot"/);
  assert.match(page, /label="Height"/);
  assert.match(page, /next_task_due_at/);
  assert.match(page, /open_task_count/);
  assert.match(page, /Open brief/);
  assert.match(page, /Find candidates/);

  assert.match(migration, /source_person_role/);
  assert.match(migration, /open_task_count/);
  assert.match(migration, /next_task_due_at/);
});

test('candidate view stays evidence-led and does not bring back player scoring or comparison', () => {
  assert.match(page, /This is a scouting shortlist, not a player score/);
  assert.match(page, /View player/);
  assert.doesNotMatch(page, /\/compare/);
  assert.doesNotMatch(page, /ux-fit-badge/);
  assert.doesNotMatch(page, /overall_score/);
  assert.doesNotMatch(page, /match_score/);
});

test('opportunities-only CSS provides responsive recruitment workspace surfaces', () => {
  assert.match(css, /\.needGrid/);
  assert.match(css, /\.needCard/);
  assert.match(css, /\.workspace/);
  assert.match(css, /\.factGrid/);
  assert.match(css, /\.contactCard/);
  assert.match(css, /\.taskList/);
  assert.match(css, /\.editForm/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
