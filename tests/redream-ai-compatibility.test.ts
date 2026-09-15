import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { captureReturnPath } from '../lib/capture-return-path.ts';
import { aiCaptureHref } from '../lib/entity-context.ts';
const read=(path:string)=>readFileSync(path,'utf8');

test('canonical and legacy Edge entrypoints delegate to the same handler',()=>{
  for(const suffix of ['capture','process']) {
    const handler=suffix==='capture'?'handleAiCapture':'handleAiProcess';
    for(const prefix of ['djm-tell','redream-ai']) {
      const source=read(`supabase/functions/${prefix}-${suffix}/index.ts`);
      assert.match(source,new RegExp(`Deno.serve\\(${handler}\\)`));
      assert.ok(source.length<400,'entrypoint must remain a thin delegate');
      assert.match(source,new RegExp(`_shared/ai-${suffix}\\.ts`));
    }
  }
});
test('shared agency presentation is neutral and DJM legal/brand copy is tenant conditional',()=>{
  for(const file of ['AiCapture','AiLauncher','AiFullPage','AiRecentCaptures','AgencyOperatingWorkspace','WorkspaceHeader']) assert.doesNotMatch(read(`components/${file}.tsx`),/Tell DJM|\bDJM\b/);
  assert.match(read('components/Brand.tsx'),/runtime.slug ===\s*'djm-sports-management'/);
  assert.match(read('components/Brand.tsx'),/\? 'DJM PLAYER'/);
  assert.match(read('app/privacy/page.tsx'),/runtime.slug !== 'djm-sports-management'/);
  assert.doesNotMatch(read('app/page.tsx'),/djmsports\.com/);
  assert.match(read('components/AgencyOperatingWorkspace.tsx'),/<AiLauncher/);
});
test('capture return paths preserve context without allowing external redirects',()=>{
  for(const path of ['/tell?capture=old','/workspace/northstar/capture?capture=new']) assert.equal(captureReturnPath(path),path);
  for(const path of ['//evil.example','https://evil.example','/workspace/x/capture/../../evil','/tell\\evil','/admin']) assert.equal(captureReturnPath(path),null);
  assert.match(aiCaptureHref('/workspace/northstar',{},'northstar'),/^\/workspace\/northstar\/capture\?/);
});
test('offline store and historical processing remain compatible',()=>{
  assert.match(read('lib/ai-offline.ts'),/DB_NAME = 'djm-tell-djm'/);
  assert.match(read('lib/ai-offline.ts'),/LEGACY_ACTIVE_KEY = 'djm-tell-djm-active-captures'/);
  assert.match(read('supabase/migrations/20260915194224_redream_ai_canonical_api.sql'),/processing_version='tell_djm_v1'/);
  assert.match(read('supabase/functions/_shared/ai-process.ts'),/tell_djm_plan/);
});

test('legacy Deno router aliases use an explicit canonical module extension',()=>{
  const alias=read('supabase/functions/_shared/djm-ai-router.ts');
  assert.match(alias,/from '\.\/ai-router\.ts'/);
  assert.doesNotMatch(alias,/from '\.\/ai-router'/);
});
test('non-AI Edge presentation no longer assumes the DJM agency',()=>{
  for(const name of ['djm-network-capture','djm-network-import','djm-player-voice-message','club-pitch-response','import-player-evidence-json','import-player-stats','refresh-player-data','refresh-player-data-universal','refresh-player-peer-data','djm-transfermarkt-enrich']) {
    assert.doesNotMatch(read(`supabase/functions/${name}/index.ts`),/\bDJM\b/,name);
  }
  const calendar=read('supabase/functions/djm-calendar-feed/index.ts');
  assert.match(calendar,/X-WR-CALNAME:ReDream/);
  assert.match(calendar,/UID:djm-/,'preserve subscription item identity');
  assert.match(calendar,/REDREAM_APP_URL/);
});
