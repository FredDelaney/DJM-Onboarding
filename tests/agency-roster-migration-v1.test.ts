import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseRosterMigrationCsv,
  rosterMigrationTemplate,
} from '../lib/agency-roster-migration.ts';

const read = (path: string) => readFileSync(path, 'utf8');

test('roster CSV maps common agency spreadsheet headings into canonical player rows', () => {
  const parsed = parseRosterMigrationCsv(
    [
      'Player Name,Position,Current Club,Nationality,Contract Expiry',
      '"Alex Example",RW,"Example FC","Netherlands;Belgium",2027-06-30',
    ].join('\n'),
  );

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].normalized.first_name, 'Alex');
  assert.equal(parsed.rows[0].normalized.last_name, 'Example');
  assert.deepEqual(
    parsed.rows[0].normalized.nationalities,
    ['Netherlands', 'Belgium'],
  );
});

test('roster CSV preserves quoted commas and explicit first and last names', () => {
  const parsed = parseRosterMigrationCsv(
    [
      'First Name,Last Name,Current Club',
      'Jean Pierre,"van Dijk","Rotterdam, FC"',
    ].join('\n'),
  );

  assert.equal(parsed.rows[0].normalized.first_name, 'Jean Pierre');
  assert.equal(parsed.rows[0].normalized.last_name, 'van Dijk');
  assert.equal(parsed.rows[0].normalized.current_club, 'Rotterdam, FC');
});

test('roster template is usable CSV and not a JSON migration workflow', () => {
  assert.match(
    rosterMigrationTemplate,
    /First Name,Last Name,Position/,
  );
  assert.doesNotMatch(rosterMigrationTemplate, /^\s*\{/);
});

test('roster migration reuses the existing tenant migration engine', () => {
  const panel = read(
    'components/AgencyRosterMigrationPanel.tsx',
  );
  const edge = read('supabase/functions/agency-os/index.ts');

  assert.match(panel, /migration_create_batch/);
  assert.match(panel, /migration_preflight/);
  assert.match(panel, /migration_row_decision/);
  assert.match(panel, /migration_approve/);
  assert.match(panel, /migration_apply/);

  assert.match(edge, /platform_server_create_migration_batch/);
  assert.match(edge, /platform_server_migration_preflight/);
  assert.match(edge, /platform_server_apply_migration_batch/);
});

test('duplicate warnings require an explicit create or skip decision', () => {
  const panel = read(
    'components/AgencyRosterMigrationPanel.tsx',
  );

  assert.match(panel, /Create anyway/);
  assert.match(panel, />\s*Skip\s*</);
  assert.match(panel, /approval_gate\.can_approve/);
  assert.match(panel, /Nothing is written until you/);
});

test('roster import is an owner admin operations setup utility, not a fifth daily workspace', () => {
  const workspace = read(
    'components/AgencyOperatingWorkspace.tsx',
  );

  assert.match(workspace, /Import players/);
  assert.match(workspace, /AgencyRosterMigrationPanel/);
  assert.match(
    workspace,
    /\['owner', 'admin', 'operations'\]/,
  );
  assert.doesNotMatch(workspace, /label: 'Import'/);
});
