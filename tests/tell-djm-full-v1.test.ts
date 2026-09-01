import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const capture = read('components/TellDjmCapture.tsx');
const launcher = read('components/DjmTellDjmLauncher.tsx');
const fullPage = read('components/TellDjmFullPage.tsx');
const recent = read('components/TellDjmRecentCaptures.tsx');
const header = read('components/DjmWorkspaceHeader.tsx');
const offline = read('lib/tell-djm-offline.ts');
const upload = read('supabase/functions/djm-tell-capture/index.ts');
const worker = read('supabase/functions/djm-tell-process/index.ts');
const migration = read(
  'supabase/migrations/20260901150000_djm_tell_djm_full_v1.sql',
);
const opportunitiesPath = 'app/(djm-os)/opportunities/page.tsx';

test('Tell DJM is globally available without removing the existing Add workflow', () => {
  assert.match(header, /DjmTellDjmLauncher/);
  assert.match(header, /<DjmTellDjmLauncher \/>/);
  assert.match(header, /<DjmQuickCapture \/>/);
  assert.match(launcher, /Tell DJM/);
  assert.match(launcher, /Say what happened\. DJM does the admin\./);
});

test('voice capture uses browser recording with runtime MIME detection', () => {
  assert.match(capture, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(capture, /new MediaRecorder/);
  assert.match(offline, /MediaRecorder\.isTypeSupported/);
  assert.match(offline, /audio\/webm;codecs=opus/);
  assert.match(offline, /audio\/mp4/);
  assert.doesNotMatch(offline, /audio\/ogg/);
  assert.match(capture, /MAX_SECONDS = 240/);
});

test('offline capture is persisted before claiming it is safe', () => {
  assert.match(offline, /indexedDB\.open/);
  assert.match(capture, /let locallySaved = false/);
  assert.match(capture, /if \(!locallySaved\)/);
  assert.match(capture, /Saved on this phone/);
  assert.match(capture, /window\.addEventListener\('online'/);
});

test('a transient queue error never deletes an already stored recording', () => {
  assert.match(upload, /Never delete a stored recording here/);
  assert.doesNotMatch(upload, /if \(queueError\) \{[\s\S]{0,300}\.remove\(/);
});

test('capture retries are idempotent at both client and database layers', () => {
  assert.match(capture, /crypto\.randomUUID\(\)/);
  assert.match(capture, /client_capture_id/);
  assert.match(migration, /captures_submitter_client_capture_uidx/);
  assert.match(migration, /submitted_by, client_capture_id/);
  assert.match(upload, /duplicate: Boolean\(queued\?\.duplicate\)/);
});

test('audio remains private and the server validates the recording again', () => {
  assert.match(upload, /bucketInfo\.public/);
  assert.match(upload, /Tell DJM capture bucket must remain private/);
  assert.match(upload, /supportedAudioMimes/);
  assert.match(upload, /split\(";"\)/);
  assert.match(upload, /12 \* 1024 \* 1024/);
  assert.match(upload, /max_audio_seconds/);
});

test('browser-triggered reprocessing supports CORS after one-tap answers', () => {
  assert.match(worker, /Access-Control-Allow-Origin/);
  assert.match(worker, /request\.method === "OPTIONS"/);
  assert.match(capture, /djmInvoke\('djm-tell-process'/);
});

test('closing the phone cannot cancel processing', () => {
  assert.match(upload, /EdgeRuntime\.waitUntil/);
  assert.match(migration, /djm-tell-djm-worker/);
  assert.match(migration, /'\* \* \* \* \*'/);
  assert.match(migration, /c\.status='processing'/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(worker, /batch \|\| 1/);
});

test('OpenAI usage is server-side and uses the verified current model APIs', () => {
  assert.match(worker, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(capture, /OPENAI_API_KEY/);
  assert.match(worker, /gpt-transcribe/);
  assert.match(worker, /keywords\[\]/);
  assert.match(worker, /gpt-5\.6-terra/);
  assert.match(worker, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(worker, /type: "json_schema"/);
  assert.match(worker, /strict: true/);
});

test('paid interpretation is persisted so retries do not reinterpret the same note', () => {
  assert.match(migration, /djm_tell_worker_store_transcript/);
  assert.match(migration, /djm_tell_worker_store_plan/);
  assert.match(worker, /extracted_json\?\.tell_djm_plan/);
  assert.match(worker, /reusedPlan: true/);
  assert.match(worker, /transcript_text/);
});

test('AI can propose but deterministic DJM RPCs own all business writes', () => {
  assert.match(worker, /djm_tell_apply_action/);
  assert.doesNotMatch(worker, /\.from\("club_needs"\)\.insert/);
  assert.doesNotMatch(worker, /\.from\("tasks"\)\.insert/);
  assert.match(migration, /create or replace function public\.djm_tell_apply_action/);
  assert.match(migration, /Tell DJM write could not be verified/);
  assert.match(migration, /'read_back',true/);
});

test('entities and financial currencies are never guessed', () => {
  assert.match(worker, /Which club did you mean/);
  assert.match(worker, /Which player did you mean/);
  assert.match(worker, /DJM will not guess between people/);
  assert.match(worker, /What currency is the budget in/);
  assert.match(worker, /Unknown means null/);
  assert.match(worker, /bare 250 with no magnitude/);
  assert.match(migration, /djm_tell_answer_question/);
});

test('club page context disambiguates a named contact without overriding explicit clubs', () => {
  assert.match(worker, /action\.club_name \|\| club\.label \|\| capture\?\.context_json\?\.organisation_name/);
  assert.match(worker, /an explicitly named club, contact, player or prospect always overrides page context/);
});

test('one spoken entity ambiguity is asked once across the capture', () => {
  assert.match(worker, /function entityFieldKey/);
  assert.ok(worker.includes('return `entity:${type}:'));
  assert.doesNotMatch(worker, /entity:\$\{actionKey\}:contact/);
  assert.match(migration, /confirmed_alias/);
  assert.match(migration, /tell_djm_aliases/);
});

test('action execution is idempotent and undo refuses to overwrite later human work', () => {
  assert.match(migration, /unique\(capture_id, action_hash\)/);
  assert.match(worker, /capture_id: capture\.capture_id/);
  assert.match(worker, /key: actionKey/);
  assert.match(migration, /djm_tell_undo_action/);
  assert.match(migration, /changed after Tell DJM created it/);
});

test('founders and scouts have different automation permissions', () => {
  assert.match(migration, /permission_scope in \('full', 'scout', 'read_only'\)/);
  assert.match(migration, /like '%admin%'/);
  assert.match(migration, /v_permission='scout'/);
  assert.match(migration, /status='needs_review'/);
});

test('multiple restricted actions consolidate into one capture review item', () => {
  assert.match(migration, /Check Tell DJM updates/);
  assert.match(migration, /on conflict \(capture_id,review_type\)/);
  assert.match(migration, /coalesce\(djm_os\.review_items\.payload->'actions'/);
});

test('cost and raw-audio retention are capped in the database', () => {
  assert.match(migration, /monthly_ai_budget_usd numeric\(10,2\) not null default 5\.00/);
  assert.match(migration, /audio_retention_days integer not null default 7/);
  assert.match(worker, /budget_exhausted/);
  assert.match(migration, /djm-tell-djm-audio-cleanup/);
  assert.match(worker, /mode === "cleanup"/);
});

test('stats-first decision is preserved', () => {
  assert.match(worker, /Do not produce player scores/);
  assert.match(migration, /overall_score,football_score/);
  assert.match(migration, /null,null,null,null,null,null/);
  assert.doesNotMatch(capture, /Global Score/);
  assert.doesNotMatch(capture, /\/compare/);
});

test('worker-only RPCs are not callable by authenticated users', () => {
  assert.match(migration, /djm_tell_worker_claim\(uuid,text\)[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /djm_tell_apply_action\(uuid,text,integer,text,numeric,text,jsonb\)[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /to service_role/);
});

test('new source contains no literal em dash', () => {
  for (const source of [capture, launcher, header, offline, upload, worker, migration]) {
    assert.equal(source.includes('\u2014'), false);
  }
});

test('zero-match entities never disappear into a false Done receipt', () => {
  assert.match(worker, /unknownClubCandidates/);
  assert.match(worker, /unknownContactCandidates/);
  assert.match(worker, /\[reviewCandidate\(\)\]/);
  assert.match(worker, /Keep for review/);
  assert.match(worker, /if \(blocked\)/);
  assert.match(migration, /when v_open_questions>0 then 'needs_input'/);
  assert.match(migration, /when v_review>0 then 'needs_review'/);
});

test('unknown contacts can be explicitly created at a known club or left unlinked', () => {
  assert.match(worker, /kind: "create_contact"/);
  assert.match(worker, /kind: "leave_unlinked"/);
  assert.match(migration, /djm_tell_create_confirmed_contact/);
  assert.match(migration, /TELL_DJM_CONTACT_CREATED_OR_LINKED/);
  assert.match(migration, /same-name contact is already current at another organisation/);
  assert.match(migration, /djm_os\.relationships/);
});

test('only full-access users get one-tap creation of a genuinely new club', () => {
  assert.match(worker, /capture\?\.permission_scope === "full"/);
  assert.match(worker, /kind: "create_club"/);
  assert.match(migration, /djm_tell_create_confirmed_club/);
  assert.match(migration, /Only full-access DJM users can create a new club from Tell DJM/);
  assert.match(migration, /A very similar club now exists/);
});

test('global mic inherits stable context from player club contact recruitment and opportunity routes', () => {
  assert.match(launcher, /usePathname/);
  assert.match(launcher, /\/admin\/players\//);
  assert.match(launcher, /\/network\/clubs\//);
  assert.match(launcher, /\/network\/contacts\//);
  assert.match(launcher, /\/recruitment\//);
  assert.match(launcher, /opportunities\|market\/deals/);
  assert.match(launcher, /djm_tell_context_for_route/);
  assert.match(migration, /create or replace function public\.djm_tell_context_for_route/);
  assert.match(migration, /'context_type','opportunity'/);
});

test('scout voice notes create or reuse Recruitment targets and dated scouting reports', () => {
  assert.match(worker, /log_scout_observation/);
  assert.match(worker, /djm_tell_apply_scout_observation/);
  assert.match(migration, /djm_os\.scouting_prospects/);
  assert.match(migration, /djm_os\.scouting_reports/);
  assert.match(migration, /recruitment_stage,recruitment_priority/);
  assert.match(migration, /'identified'/);
  assert.match(migration, /scout_user_id/);
});

test('Tell DJM never fabricates numeric scouting scores from casual speech', () => {
  assert.match(worker, /never invent numeric scout scores/i);
  assert.match(migration, /football_score,physical_score,tactical_score,mentality_score,personality_score/);
  assert.match(migration, /null,null,null,null,null,null/);
  assert.match(worker, /scout_recommendation/);
});

test('scout reports and prospects are retry-safe', () => {
  assert.match(migration, /scouting_reports_source_key_uidx/);
  assert.match(migration, /on conflict \(source_key\)/);
  assert.match(migration, /on conflict \(canonical_key\) where canonical_key is not null/);
  assert.match(migration, /log_scout_observation/);
  assert.match(migration, /djm_tell_undo_action/);
});

test('needs-review actions stay stable while other questions are answered', () => {
  assert.match(migration, /and status in \('pending','failed'\);/);
  assert.doesNotMatch(migration, /and status in \('pending','failed','needs_review'\);/);
});


test('bare financial amounts require a one-tap magnitude decision before currency', () => {
  assert.match(worker, /salary_budget_raw/);
  assert.match(worker, /transfer_budget_raw/);
  assert.match(worker, /What did “\$\{raw\}” mean\?/);
  assert.match(worker, /DJM heard a financial amount but will not guess its magnitude/);
  assert.match(worker, /kind: "omit_field"/);
  assert.match(worker, /never assume 250 means 250000/);
});


test('Tell DJM raw workflow rows are private to the capture owner or full access staff', () => {
  assert.match(migration, /Tell DJM capture access denied/);
  assert.match(migration, /c\.submitted_by=\(select auth\.uid\(\)\)/);
  assert.match(migration, /p\.permission_scope='full'/);
  assert.match(migration, /owner_user_id=\(select auth\.uid\(\)\)/);
});


test('safely uploaded captures survive refresh and reconnect to their receipt', () => {
  assert.match(offline, /ACTIVE_KEY = 'djm-tell-djm-active-captures'/);
  assert.match(offline, /rememberActiveTellDjmCapture/);
  assert.match(offline, /listActiveTellDjmCaptures/);
  assert.match(offline, /forgetActiveTellDjmCapture/);
  assert.match(capture, /rememberActiveTellDjmCapture\(result\.capture_id\)/);
  assert.match(capture, /listActiveTellDjmCaptures\(\)\.slice\(-1\)/);
  assert.match(capture, /forgetActiveTellDjmCapture\(captureId\)/);
});

test('server acknowledgement releases navigation while AI continues in background', () => {
  assert.match(capture, /await uploadPending\(pending\);\n      setBusy\(false\)/);
  assert.doesNotMatch(capture, /setBusy\(true\);\n        setStatus\('Got it\. DJM is finishing/);
  assert.match(capture, /You can close this screen/);
});

test('older background receipts cannot overwrite the capture the user opened', () => {
  assert.match(capture, /displayCaptureRef/);
  assert.match(capture, /displayCaptureRef\.current === captureId/);
  assert.match(capture, /async \(captureId: string, focus = true\)/);
});

test('recording and unsafe save guard against accidental navigation', () => {
  assert.match(capture, /beforeunload/);
  assert.match(capture, /document\.addEventListener\('click', guardLinks, true\)/);
  assert.match(capture, /Finish the voice note before leaving this screen/);
  assert.match(launcher, /Finish saving before opening full screen/);
  assert.match(launcher, /disabled=\{unsafeToClose\}/);
});

test('full-screen Tell DJM preserves route and active workspace context', () => {
  assert.match(launcher, /fullScreenHref/);
  assert.match(launcher, /club_need_id: context\.club_need_id/);
  assert.match(launcher, /djm:tell-context/);
  assert.match(fullPage, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(fullPage, /setQueryContext/);
  assert.match(fullPage, /club_need_id/);
  assert.match(fullPage, /djm_tell_context_for_route/);
  assert.match(fullPage, /context=\{context\}/);
});

test('Opportunities publishes the selected need to Tell DJM in the full repository', () => {
  if (!existsSync(opportunitiesPath)) return;
  const opportunities = read(opportunitiesPath);
  assert.match(opportunities, /new CustomEvent\('djm:tell-context'/);
  assert.match(opportunities, /club_need_id: selectedNeed\.id \|\| null/);
  assert.match(opportunities, /organisation_id: selectedNeed\.organisation_id \|\| null/);
  assert.match(opportunities, /\}, \[selectedNeed\]\);/);
});

test('pending local notes retry while the app remains open and connected', () => {
  assert.match(capture, /window\.setInterval/);
  assert.match(capture, /60_000/);
  assert.match(capture, /document\.visibilityState === 'visible'/);
  assert.match(capture, /pending\.slice\(0, 20\)/);
});


test('attention states reuse the existing DJM notification and web-push stack without spam', () => {
  assert.match(migration, /djm_tell_notify_attention/);
  assert.match(migration, /tell_djm_attention/);
  assert.match(migration, /on conflict\(fingerprint\).*do nothing/);
  assert.match(migration, /notification_outbox/);
  assert.match(worker, /dispatch-player-push/);
  assert.match(worker, /notifyAttention/);
  assert.doesNotMatch(worker, /notifyAttention\(admin, supabaseUrl, capture\.capture_id\);[\s\S]{0,120}status: "done"/);
});

test('push links reopen the exact capture receipt', () => {
  assert.match(migration, /'\/tell\?capture='\|\|v_capture\.id::text/);
  assert.match(fullPage, /params\.get\('capture'\)/);
  assert.match(fullPage, /new RegExp\(`\^\$\{UUID\}\$`\)\.test\(requestedCaptureId\)/);
  assert.match(fullPage, /setSelectedCaptureId\(requestedCaptureId\)/);
});

test('full-screen Tell DJM has a simple recent history that reopens receipts', () => {
  assert.match(migration, /create or replace function public\.djm_tell_recent_captures/);
  assert.match(migration, /c\.submitted_by=\(select auth\.uid\(\)\)/);
  assert.match(fullPage, /TellDjmRecentCaptures/);
  assert.match(fullPage, /resumeCaptureId=\{selectedCaptureId\}/);
  assert.match(capture, /resumeCaptureId/);
  assert.match(recent, /Needs one thing/);
  assert.match(recent, /Processing/);
  assert.match(recent, /onOpen\(item\.id\)/);
});

test('Tell DJM launch switch defaults off until backend deployment and smoke tests are complete', () => {
  assert.match(migration, /is_live boolean not null default false/);
  assert.match(migration, /coalesce\(v_enabled,false\) and coalesce\(v_system_live,false\)/);
  assert.match(migration, /and s\.is_live=true/);
});

test('Tell DJM is feature-gated so frontend deployment cannot expose a broken backend', () => {
  assert.match(launcher, /djm_tell_current_access/);
  assert.match(launcher, /if \(!access\?\.enabled\) return null/);
  assert.match(fullPage, /djm_tell_current_access/);
  assert.match(fullPage, /Tell DJM is not enabled yet/);
  assert.match(capture, /maxAudioSeconds/);
});

test('task idempotency uses the exact capture action source key rather than fuzzy title matching', () => {
  assert.match(migration, /source='tell_djm:'\|\|p_capture_id::text\|\|':'\|\|p_action_hash/);
  assert.match(migration, /'tell_djm:'\|\|v_action\.capture_id::text\|\|':'\|\|v_action\.action_hash/);
  assert.doesNotMatch(migration, /t\.created_at>=v_capture\.created_at-interval '2 minutes'/);
});

test('every automatic action must be grounded in a verbatim source excerpt', () => {
  assert.match(worker, /Evidence must be a short verbatim excerpt copied from the transcript/);
  assert.match(worker, /function evidenceIsGrounded/);
  assert.match(worker, /The AI evidence excerpt could not be found verbatim in the source transcript/);
});

test('club needs are executed before player suggestion actions that depend on them', () => {
  assert.match(worker, /function actionPriority/);
  assert.match(worker, /type === "upsert_club_need"\) return 0/);
  assert.match(worker, /type === "suggest_player" \|\| type === "exclude_player"\) return 2/);
  assert.match(worker, /enrichNeedDependentAction/);
});

test('currency is accepted only when grounded in source text or explicitly answered by the user', () => {
  assert.match(worker, /function explicitCurrenciesFromText/);
  assert.match(worker, /function groundedCurrency/);
  assert.match(worker, /action\.currency = groundedCurrency\(transcript, action\)/);
  assert.doesNotMatch(worker, /normaliseCurrency\(action\.currency\) \|\|/);
});

test('partial or failed captures can retry only their unfinished work from the persisted plan', () => {
  assert.match(migration, /create or replace function public\.djm_tell_retry_capture/);
  assert.match(migration, /v_capture\.status not in \('partial','failed'\)/);
  assert.match(capture, /Retry failed updates/);
  assert.match(capture, /djm_tell_retry_capture/);
  assert.match(capture, /DJM reuses the saved transcript and plan/);
});

test('receipt polling spans the durable one-minute cron fallback without fan-out on reconnect', () => {
  assert.match(capture, /const POLL_ATTEMPTS = 90/);
  assert.match(capture, /pollingRef/);
  assert.match(capture, /uploadPending\(item, false\)/);
  assert.match(capture, /listActiveTellDjmCaptures\(\)\.slice\(-1\)/);
});

test('rare orphan voice uploads are also removed after the retention window', () => {
  assert.match(migration, /djm_tell_orphan_audio_cleanup_due/);
  assert.match(migration, /o\.bucket_id='djm-network-captures'/);
  assert.match(migration, /o\.created_at<now\(\)-interval '8 days'/);
  assert.match(migration, /not exists \([\s\S]*c\.source_uri=o\.bucket_id\|\|'\/'\|\|o\.name/);
  assert.match(worker, /djm_tell_orphan_audio_cleanup_due/);
  assert.match(worker, /orphan_removed/);
});


test('service-role worker has explicit privileges for every private-schema dependency', () => {
  assert.match(migration, /djm_os\.relationships,/);
  assert.match(migration, /djm_os\.scouting_prospects,/);
  assert.match(migration, /djm_os\.scouting_reports,/);
  assert.match(migration, /grant select on djm_os\.deal_rooms to service_role/);
  assert.match(migration, /grant select, insert on public\.notification_outbox to service_role/);
});
