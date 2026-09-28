import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929023000_redream_connected_reply_drafts_v1.sql',
  'utf8',
);

const edge = readFileSync(
  'supabase/functions/redream-connected-reply-draft/index.ts',
  'utf8',
);

const router = readFileSync(
  'supabase/functions/_shared/ai-router.ts',
  'utf8',
);

const drawer = readFileSync(
  'components/AgencyConnectedReplyDrawer.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyConnectedReplyDrawer.module.css',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test(
  'reply draft storage is internal and tenant owned',
  () => {
    assert.match(
      migration,
      /create table if not exists djm_os\.connected_reply_drafts/,
    );
    assert.match(
      migration,
      /alter table djm_os\.connected_reply_drafts[\s\S]*enable row level security/,
    );
    assert.match(
      migration,
      /revoke all on djm_os\.connected_reply_drafts[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant[\s\S]*on djm_os\.connected_reply_drafts[\s\S]*to service_role/,
    );
  },
);

test(
  'reply context is one exact interaction owned by the signed in agent',
  () => {
    assert.match(
      migration,
      /i\.id=p_interaction_id/,
    );
    assert.match(
      migration,
      /i\.tenant_id=p_tenant_id/,
    );
    assert.match(
      migration,
      /i\.team_member_id=p_user_id/,
    );
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
  },
);

test(
  'reply context is limited to connected channels and requires Network identity',
  () => {
    for (const channel of [
      'google_email',
      'microsoft_email',
      'instagram_selected_chat',
      'whatsapp_selected_chat',
    ]) {
      assert.match(migration, new RegExp(channel));
    }

    assert.match(
      migration,
      /i\.person_id is not null/,
    );
  },
);

test(
  'outbound activity cannot be used as reply evidence',
  () => {
    assert.match(
      migration,
      /'outbound'/,
    );
    assert.match(
      migration,
      /'sent'/,
    );
    assert.match(
      migration,
      /reply_draft_requires_inbound_interaction/,
    );
  },
);

test(
  'connected email requires explicit inbound or received direction',
  () => {
    assert.match(
      migration,
      /v_interaction\.channel in \([\s\S]*'google_email'[\s\S]*'microsoft_email'[\s\S]*not in \([\s\S]*'inbound'[\s\S]*'received'/,
    );
    assert.match(
      workspace,
      /emailChannel[\s\S]*\['inbound', 'received'\]\.includes\(direction\)/,
    );
  },
);

test(
  'reply context exposes summaries but never raw connected message bodies',
  () => {
    assert.match(
      migration,
      /'summary',left\(i\.summary,1200\)/,
    );
    assert.doesNotMatch(
      migration,
      /'raw_text'/,
    );
  },
);

test(
  'recent reply context stays same agent same person and bounded',
  () => {
    assert.match(
      migration,
      /i\.team_member_id=p_user_id/,
    );
    assert.match(
      migration,
      /i\.person_id=v_interaction\.person_id/,
    );
    assert.match(
      migration,
      /interval '90 days'/,
    );
    assert.match(
      migration,
      /limit 4/,
    );
  },
);

test(
  'reply store distinguishes AI generation from human edits',
  () => {
    assert.match(
      migration,
      /CONNECTED_REPLY_DRAFT_GENERATED/,
    );
    assert.match(
      migration,
      /CONNECTED_REPLY_DRAFT_EDITED/,
    );
    assert.match(
      migration,
      /human_edit/,
    );
  },
);

test(
  'reply context and store server contracts are not browser APIs',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_connected_reply_context[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_connected_reply_store[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*platform_server_connected_reply_store[\s\S]*service_role/,
    );
  },
);

test(
  'authenticated Edge Function resolves the requested tenant workspace',
  () => {
    assert.match(
      edge,
      /createSupabaseContext\(req, \{ auth: "user" \}\)/,
    );
    assert.match(
      edge,
      /platform_server_user_workspaces/,
    );
    assert.match(
      edge,
      /String\(item\?\.tenant_id \|\| ""\) === tenantId/,
    );
  },
);

test(
  'only generate mode requires OpenAI and AI entitlement',
  () => {
    const getIndex = edge.indexOf('if (action === "get")');
    const saveIndex = edge.indexOf('if (action === "save")');
    const keyIndex = edge.indexOf('if (!openAiKey)');
    const authorizeIndex = edge.indexOf(
      '"platform_server_authorize_usage"',
    );

    assert.ok(getIndex >= 0);
    assert.ok(saveIndex > getIndex);
    assert.ok(keyIndex > saveIndex);
    assert.ok(authorizeIndex > keyIndex);
  },
);

test(
  'reply generation uses shared AI routing and central metering',
  () => {
    assert.match(
      router,
      /'connected_reply'/,
    );
    assert.match(
      edge,
      /selectAiRoute\("connected_reply"/,
    );
    assert.match(
      edge,
      /platform_server_authorize_usage/,
    );
    assert.match(
      edge,
      /p_feature_key: "ai_assistant"/,
    );
    assert.match(
      edge,
      /platform_server_record_ai_usage/,
    );
  },
);

test(
  'reply generation uses strict structured output and source guardrails',
  () => {
    assert.match(
      edge,
      /type: "json_schema"/,
    );
    assert.match(
      edge,
      /redream_connected_reply_draft/,
    );
    assert.match(
      edge,
      /Do not invent player availability, prices, salaries, fees, dates, deadlines/,
    );
    assert.match(
      edge,
      /Do not write a legal or contractual commitment/,
    );
    assert.match(
      edge,
      /Do not introduce a deadline or promise a response time/,
    );
  },
);

test(
  'reply drafting has no external send capability',
  () => {
    assert.doesNotMatch(
      edge,
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
    assert.doesNotMatch(
      drawer,
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
    assert.match(
      drawer,
      /ReDream does not send this message/,
    );
    assert.match(
      migration,
      /external_action',false/,
    );
  },
);

test(
  'drawer loads existing draft before deciding to generate',
  () => {
    assert.match(
      drawer,
      /const result = await call\('get'\)/,
    );
    assert.match(
      drawer,
      /if \(existing\)[\s\S]*apply\(result\)[\s\S]*return/,
    );
    assert.match(
      drawer,
      /await generate\(\)/,
    );
  },
);

test(
  'human edits are saved before copy without another AI call',
  () => {
    assert.match(
      drawer,
      /call\('save', next\)/,
    );
    assert.match(
      drawer,
      /if \(dirty\)[\s\S]*await save\(\)/,
    );
    assert.match(
      drawer,
      /navigator\.clipboard\.writeText/,
    );
  },
);

test(
  'Connected Work uses Prepare reply only for replyable interactions',
  () => {
    assert.match(
      workspace,
      /const replyable =/,
    );
    assert.match(
      workspace,
      /!\['outbound', 'sent'\]\.includes\(direction\)/,
    );
    assert.match(
      workspace,
      /onPrepareConnectedReply\(item\)/,
    );
    assert.match(
      workspace,
      /Prepare reply/,
    );
    assert.match(
      workspace,
      /Open Network/,
    );
  },
);

test(
  'reply drawer stays outside workspace flow',
  () => {
    assert.match(
      workspace,
      /connectedReplyRequest \? \([\s\S]*AgencyConnectedReplyDrawer/,
    );
    assert.match(
      workspace,
      /tenantId=\{workspace\.tenant_id\}/,
    );
  },
);

test(
  'reply drawer is mobile safe and avoids iOS textarea zoom',
  () => {
    assert.match(
      styles,
      /env\(safe-area-inset-bottom\)/,
    );
    assert.match(
      styles,
      /@media \(max-width: 680px\)/,
    );
    assert.match(
      styles,
      /\.draftSection textarea \{[\s\S]*font-size: 16px/,
    );
  },
);
