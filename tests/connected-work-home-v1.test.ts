import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928235900_redream_connected_work_home_v1.sql',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test(
  'Connected Work is personal to the signed-in agent',
  () => {
    assert.match(
      migration,
      /mt\.user_id=p_user_id/,
    );
    assert.match(
      migration,
      /t\.owner_user_id=p_user_id/,
    );
    assert.match(
      migration,
      /i\.team_member_id=p_user_id/,
    );
    assert.match(
      migration,
      /m\.owner_user_id=p_user_id/,
    );
  },
);

test(
  'Connected Work keeps shared identity tenant scoped',
  () => {
    assert.match(
      migration,
      /p\.tenant_id=i\.tenant_id/,
    );
    assert.match(
      migration,
      /o\.tenant_id=i\.tenant_id/,
    );
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
  },
);

test(
  'detached interaction history does not appear as live connected work',
  () => {
    assert.match(
      migration,
      /i\.person_id is not null[\s\S]*i\.organisation_id is not null/,
    );
  },
);

test(
  'unlinked selected chats remain unresolved until explicit linking',
  () => {
    assert.match(
      migration,
      /mt\.is_selected=true/,
    );
    assert.match(
      migration,
      /mt\.bound_person_id is null/,
    );
    assert.match(
      migration,
      /explicitly links them to an existing Network contact/,
    );
    assert.doesNotMatch(
      migration,
      /insert into\s+djm_os\.people/i,
    );
  },
);

test(
  'connected follow-up tasks stay in Needs you instead of being duplicated',
  () => {
    assert.match(
      workspace,
      /were already moved into Needs you/,
    );
    assert.doesNotMatch(
      workspace,
      /recentConnected\.map[\s\S]*connected_followups_open[\s\S]*map/,
    );
  },
);

test(
  'Home loads Connected Work through the tenant resolved RPC path',
  () => {
    assert.match(
      workspace,
      /rpc<any>\('redream_connected_work'/,
    );
    assert.match(
      workspace,
      /connected_work: connectedWork/,
    );
    assert.match(
      workspace,
      /REDREAM HANDLED/,
    );
  },
);

test(
  'identity resolution opens the focused Connected Work resolver',
  () => {
    assert.match(
      workspace,
      /onResolveConnectedIdentity/,
    );
    assert.match(
      workspace,
      /setConnectedIdentityResolverOpen\(true\)/,
    );
    assert.match(
      workspace,
      /AgencyConnectedIdentityResolverDrawer/,
    );
    assert.match(
      workspace,
      /Resolve identities/,
    );
    assert.match(
      workspace,
      /setConnectionsOpen\(true\)/,
    );
  },
);

test(
  'connected conversations and meetings preserve visible ownership',
  () => {
    assert.match(
      workspace,
      /label="Owner"/,
    );
    assert.match(
      workspace,
      /item\?\.owner_name/,
    );
    assert.match(
      migration,
      /'owner_user_id',p_user_id/,
    );
  },
);

test(
  'Connected Work never claims automatic external sending',
  () => {
    assert.match(
      migration,
      /never sends an external message automatically/,
    );
  },
);

test(
  'Connected Work stays compact on mobile',
  () => {
    assert.match(
      styles,
      /\.connectedWorkRow/,
    );
    assert.match(
      styles,
      /@media \(max-width: 680px\)[\s\S]*\.connectedWorkRow[\s\S]*grid-template-columns/,
    );
    assert.match(
      styles,
      /\.connectedWorkAction/,
    );
  },
);
