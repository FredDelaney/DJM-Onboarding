import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import test from 'node:test';

const tellSource = readFileSync(
  'supabase/functions/djm-tell-process/index.ts',
  'utf8',
);

const workspaceMigration = readFileSync(
  'supabase/migrations/20260913103355_tenantize_tell_djm_and_agency_workspaces.sql',
  'utf8',
);

const grantMigration = readFileSync(
  'supabase/migrations/20260913103544_harden_tell_djm_tenant_rpc_grants.sql',
  'utf8',
);

const intelligenceMigration = readFileSync(
  'supabase/migrations/20260913103940_enable_rls_on_internal_football_intelligence.sql',
  'utf8',
);

const staffMigration = readFileSync(
  'supabase/migrations/20260913104036_tenant_scope_staff_assignment_rpcs.sql',
  'utf8',
);

test(
  'Tell DJM vocabulary resolves inside the stored capture tenant',
  () => {
    assert.match(
      tellSource,
      /"djm_tell_capture_vocabulary"[\s\S]{0,160}p_capture_id:\s*capture\.capture_id/,
    );
  },
);

test(
  'agency workspaces receive immutable tenant ownership',
  () => {
    assert.match(
      workspaceMigration,
      /assign_workspace_tenant/,
    );

    assert.match(
      workspaceMigration,
      /Tenant ownership is immutable/,
    );

    assert.match(
      workspaceMigration,
      /tenant_staff_select/,
    );

    assert.match(
      workspaceMigration,
      /workspace_entity_tenant/,
    );
  },
);

test(
  'Tell DJM worker and resolver internals are not browser RPCs',
  () => {
    assert.match(
      workspaceMigration,
      /revoke execute on function public\.djm_tell_worker_claim/,
    );

    assert.match(
      grantMigration,
      /djm_tell_resolve_entity_typed_unscoped/,
    );

    assert.match(
      grantMigration,
      /from anon,authenticated/,
    );
  },
);

test(
  'internal football intelligence tables have RLS enabled',
  () => {
    for (const table of [
      'football_intelligence_subjects',
      'football_subject_projection_snapshots',
      'football_subject_provider_snapshots',
      'football_subject_scorecards',
    ]) {
      assert.match(
        intelligenceMigration,
        new RegExp(
          `alter table djm_os\\.${table} enable row level security`,
        ),
      );
    }
  },
);

test(
  'staff assignment RPCs authorise against the owning tenant',
  () => {
    assert.match(
      staffMigration,
      /user_has_staff_tenant_access/,
    );

    assert.match(
      staffMigration,
      /p\.tenant_id/,
    );

    assert.match(
      staffMigration,
      /sp\.tenant_id/,
    );

    assert.match(
      staffMigration,
      /t\.tenant_id/,
    );
  },
);
