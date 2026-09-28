import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const owner = readFileSync(
  'components/AgencyOwnerCommandCentre.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyOwnerCommandCentre.module.css',
  'utf8',
);

const staffScope = readFileSync(
  'supabase/migrations/20260928233000_redream_team_capacity_staff_scope_v1.sql',
  'utf8',
);

test(
  'management loads tenant-native team capacity alongside Business data',
  () => {
    assert.match(
      workspace,
      /\['owner', 'admin'\]\.includes/,
    );
    assert.match(
      workspace,
      /invoke<any>\('team_capacity'\)/,
    );
    assert.match(
      workspace,
      /team_capacity: value\(3, 'capacity'\)/,
    );
  },
);
test(
  'team capacity excludes player portal memberships',
  () => {
    assert.match(
      staffScope,
      /m\.role in \([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'agent'[\s\S]*'operations'[\s\S]*'scout'/,
    );
    assert.match(
      staffScope,
      /Player portal memberships are excluded/,
    );
    assert.doesNotMatch(
      staffScope,
      /m\.role in \([\s\S]*'player'/,
    );
  },
);

test(
  'Team view renders each recorded agency member instead of summary only',
  () => {
    assert.match(
      owner,
      /data\?\.team_capacity/,
    );
    assert.match(
      owner,
      /teamCapacity\?\.members/,
    );
    assert.match(
      owner,
      /teamMembers\.map/,
    );
    assert.match(
      owner,
      /member\?\.name/,
    );
    assert.match(
      owner,
      /member\?\.role_title/,
    );
  },
);

test(
  'Team cards expose accountable ownership facts',
  () => {
    assert.match(owner, /load\.assigned_players/);
    assert.match(owner, /load\.owned_active_deals/);
    assert.match(owner, /load\.open_tasks/);
    assert.match(owner, /load\.overdue_tasks/);
    assert.match(owner, /load\.active_commitments/);
    assert.match(
      owner,
      /network\.recorded_relationships/,
    );
  },
);
test(
  'commercial exposure stays separated by recorded currency',
  () => {
    assert.match(
      owner,
      /member\?\.commercial_by_currency/,
    );
    assert.match(
      owner,
      /money\([\s\S]*item\.expected_commission[\s\S]*item\.currency/,
    );
    assert.doesNotMatch(
      owner,
      /team.*total.*revenue/i,
    );
  },
);

test(
  'Team view does not rank agents or invent utilisation',
  () => {
    assert.match(
      owner,
      /Work counts show recorded ownership, not effort or performance/,
    );
    assert.match(
      owner,
      /does not calculate a fake utilisation percentage/,
    );
    assert.doesNotMatch(
      owner,
      /top performer|leaderboard|performance score/i,
    );
  },
);

test(
  'Team view is responsive and compact on mobile',
  () => {
    assert.match(styles, /\.teamMembers/);
    assert.match(
      styles,
      /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    assert.match(
      styles,
      /@media \(max-width: 760px\)[\s\S]*\.teamMembers[\s\S]*grid-template-columns: 1fr/,
    );
  },
);
