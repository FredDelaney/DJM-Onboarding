import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const ai =
  readFileSync(
    'supabase/functions/_shared/ai-process.ts',
    'utf8',
  );

const migration =
  readFileSync(
    'supabase/migrations/20260928200000_redream_semantic_email_task_completion_v1.sql',
    'utf8',
  );

test(
  'unsafe thread-only completion trigger is removed',
  () => {
    assert.match(
      migration,
      /drop trigger if exists[\s\S]*redream_complete_email_thread_followup/,
    );

    assert.doesNotMatch(
      migration,
      /create trigger[\s\S]*redream_complete_email_thread_followup/,
    );
  },
);

test(
  'outbound email capture exposes only one unambiguous thread task candidate',
  () => {
    assert.match(
      migration,
      /redream_enrich_email_task_candidate/,
    );

    assert.match(
      migration,
      /email_thread_task_candidate_count/,
    );

    assert.match(
      migration,
      /when v_candidate_count = 1[\s\S]*v_task_id/,
    );
  },
);

test(
  'AI completion requires exact provider-thread candidate and grounded evidence',
  () => {
    assert.match(
      migration,
      /email_thread_task_candidate_mismatch/,
    );

    assert.match(
      migration,
      /email_thread_task_candidate_changed/,
    );

    assert.match(
      migration,
      /email_completion_evidence_not_grounded/,
    );

    assert.match(
      migration,
      /coalesce\([\s\S]*p_confidence[\s\S]*0[\s\S]*\) < 0\.90/,
    );
  },
);

test(
  'AI prompt refuses future promises as task completion',
  () => {
    assert.match(
      ai,
      /complete_email_thread_task may be used only/,
    );

    assert.match(
      ai,
      /Never use complete_email_thread_task for future tense/,
    );

    assert.match(
      ai,
      /copy task_id exactly from current_context\.email_thread_task_candidate_id/,
    );
  },
);

test(
  'worker routes semantic completion through the dedicated audited RPC',
  () => {
    assert.match(
      ai,
      /redream_ai_complete_email_thread_task/,
    );

    assert.match(
      ai,
      /candidateCount !== 1/,
    );

    assert.match(
      ai,
      /String\(action\.task_id \|\| ""\)\.trim\(\) !== candidateId/,
    );
  },
);

test(
  'semantic completion is reversible without exposing compatibility undo core',
  () => {
    assert.match(
      migration,
      /redream_ai_undo_action_core_pre_email/,
    );

    assert.match(
      migration,
      /action_type <>[\s\S]*complete_email_thread_task/,
    );

    assert.match(
      migration,
      /v_before_status/,
    );

    assert.match(
      migration,
      /undo_supported,[\s\S]*applied_at/,
    );

    assert.match(
      migration,
      /revoke all on function[\s\S]*redream_ai_undo_action_core_pre_email\(uuid\)[\s\S]*authenticated/,
    );
  },
);
