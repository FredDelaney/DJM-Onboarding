import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929021000_redream_team_handoff_v1.sql',
  'utf8',
);

const drawer = readFileSync(
  'components/AgencyTeamHandoffDrawer.tsx',
  'utf8',
);

const drawerStyles = readFileSync(
  'components/AgencyTeamHandoffDrawer.module.css',
  'utf8',
);

const owner = readFileSync(
  'components/AgencyOwnerCommandCentre.tsx',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
test(
  'team handoff is management-only and tenant resolved',
  () => {
    assert.match(
      migration,
      /m\.role in \('owner','admin'\)/,
    );
    assert.match(
      migration,
      /private\.redream_request_tenant\(\)/,
    );
    assert.match(
      migration,
      /management_access_required/,
    );
  },
);

test(
  'handoff covers all accountable agency work without treating relationships as property',
  () => {
    assert.match(migration, /'players',v_players/);
    assert.match(
      migration,
      /'recruitment_targets',v_prospects/,
    );
    assert.match(migration, /'club_needs',v_needs/);
    assert.match(migration, /'deals',v_deals/);
    assert.match(migration, /'tasks',v_tasks/);
    assert.match(
      migration,
      /relationship routes are evidence of agency access and are not treated as exclusive contact ownership/,
    );
  },
);

test(
  'target candidates are active tenant staff and workload remains factual',
  () => {
    assert.match(
      migration,
      /m\.status='active'[\s\S]*m\.role in \([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'agent'[\s\S]*'operations'[\s\S]*'scout'/,
    );
    assert.match(
      migration,
      /It is not a capacity score or performance ranking/,
    );
    assert.doesNotMatch(
      drawer,
      /best agent|top performer|recommended agent/i,
    );
  },
);
test(
  'handoff fails closed when any selected ownership is stale',
  () => {
    assert.match(
      migration,
      /handoff_player_selection_stale/,
    );
    assert.match(
      migration,
      /handoff_recruitment_selection_stale/,
    );
    assert.match(
      migration,
      /handoff_club_need_selection_stale/,
    );
    assert.match(
      migration,
      /handoff_deal_selection_stale/,
    );
    assert.match(
      migration,
      /handoff_task_selection_stale/,
    );
  },
);

test(
  'player requests and commitments follow their selected parent ownership',
  () => {
    assert.match(
      migration,
      /public\.player_requests[\s\S]*assigned_to_user_id=p_to_user_id/,
    );
    assert.match(
      migration,
      /assigned_to_user_id is null[\s\S]*assigned_to_user_id=p_from_user_id/,
    );
    assert.match(
      migration,
      /update platform\.agency_commitments[\s\S]*owner_user_id=p_to_user_id/,
    );
    assert.match(
      migration,
      /task_id=any\(v_task_ids\)/,
    );
  },
);

test(
  'handoff writes both entity ownership evidence and one aggregate audit event',
  () => {
    assert.match(
      migration,
      /PLAYER_ASSIGNMENT_UPDATED/,
    );
    assert.match(
      migration,
      /RECRUITMENT_OWNER_UPDATED/,
    );
    assert.match(
      migration,
      /CLUB_NEED_OWNER_UPDATED/,
    );
    assert.match(
      migration,
      /OPPORTUNITY_OWNER_UPDATED/,
    );
    assert.match(
      migration,
      /TASK_OWNER_UPDATED/,
    );
    assert.match(
      migration,
      /TEAM_HANDOFF_APPLIED/,
    );
  },
);
test(
  'server handoff writers are service-only while browser wrappers stay tenant guarded',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_team_handoff_preview[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_team_handoff_apply[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*redream_team_handoff_preview[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*redream_team_handoff_apply[\s\S]*authenticated/,
    );
  },
);

test(
  'drawer starts with current work selected but requires target review and explicit confirmation',
  () => {
    assert.match(
      drawer,
      /selected\[group\.key\]\.add/,
    );
    assert.match(
      drawer,
      /setStep\('review'\)/,
    );
    assert.match(
      drawer,
      /Confirm handoff/,
    );
    assert.match(
      drawer,
      /redream_team_handoff_apply/,
    );
  },
);

test(
  'drawer clearly preserves personal connections and allows selective handoff',
  () => {
    assert.match(
      drawer,
      /Personal calendars, email connections, selected chats/,
    );
    assert.match(
      drawer,
      /toggleItem/,
    );
    assert.match(
      drawer,
      /toggleGroup/,
    );
    assert.match(
      drawer,
      /Only selected accountable work moves/,
    );
  },
);
test(
  'Business Team cards open the handoff workflow in place',
  () => {
    assert.match(owner, /onOpenHandoff/);
    assert.match(owner, /Handoff work/);
    assert.match(workspace, /teamHandoffMember/);
    assert.match(
      workspace,
      /AgencyTeamHandoffDrawer/,
    );
    assert.match(
      workspace,
      /await loadView\(\)/,
    );
  },
);

test(
  'handoff drawer is mobile-first and safe-area aware',
  () => {
    assert.match(
      drawerStyles,
      /@media \(max-width: 680px\)/,
    );
    assert.match(drawerStyles, /91dvh/);
    assert.match(
      drawerStyles,
      /env\(safe-area-inset-bottom\)/,
    );
    assert.match(
      drawerStyles,
      /grid-template-columns: 1fr/,
    );
  },
);
