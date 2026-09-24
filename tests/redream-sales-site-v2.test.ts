import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const site = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const css = fs.readFileSync('components/ReDreamPublicLanding.module.css', 'utf8');
const live = fs.readFileSync('components/ReDreamLiveOperatingDemo.tsx', 'utf8');
const liveCss = fs.readFileSync('components/ReDreamLiveOperatingDemo.module.css', 'utf8');
const decision = fs.readFileSync('components/ReDreamDecisionLayer.tsx', 'utf8');
const decisionCss = fs.readFileSync('components/ReDreamDecisionLayer.module.css', 'utf8');
const journey = fs.readFileSync('components/ReDreamCommercialJourney.tsx', 'utf8');
const journeyCss = fs.readFileSync('components/ReDreamCommercialJourney.module.css', 'utf8');
const pagesCss = fs.readFileSync('components/ReDreamMarketingPages.module.css', 'utf8');
const product = fs.readFileSync('app/(redream-public)/product/page.tsx', 'utf8');
const security = fs.readFileSync('app/(redream-public)/security/page.tsx', 'utf8');
const switchPage = fs.readFileSync('app/(redream-public)/switch/page.tsx', 'utf8');
const sandboxContract = fs.readFileSync('lib/redream-public-sandbox.ts', 'utf8');
const edge = fs.readFileSync('supabase/functions/redream-public-sandbox/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260924122500_redream_public_demo_snapshot_v1.sql', 'utf8');

test('V6 homepage is a short product experience rather than a feature-document wall', () => {
  assert.match(site, /THE DECISION LAYER FOR FOOTBALL AGENCIES/);
  assert.match(site, /Ask the agency, not the dashboard/);
  assert.match(site, /THE PRODUCT IS THE DEMO/);
  assert.match(site, /ONE COMMERCIAL THREAD/);
  assert.match(site, /AGENCY AUTOPILOT/);
  assert.doesNotMatch(site, /RECORD LAYER → DECISION LAYER/);
  assert.doesNotMatch(site, /signalStrip/);
  assert.doesNotMatch(site, /operatingSpine/);
});

test('the signature decision-layer experience crosses multiple agency contexts', () => {
  for (const term of [
    'What needs me first?',
    'Where is revenue exposed?',
    'Which relationship route is stronger?',
    'What is blocked by player strategy?',
    'CONNECTED IMPACT',
    'ONE QUEUE. THREE CONTROL LANES.',
    'Autopilot can do',
    'Confirm with me',
    'Agent judgement',
  ]) assert.match(decision, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(decision, /decision_layer_/);
});

test('decision-layer answers come from the public synthetic contract', () => {
  assert.match(sandboxContract, /redream_public_sandbox_v1/);
  assert.match(decision, /loadReDreamPublicSandbox/);
  assert.match(sandboxContract, /payload\?\.synthetic === true/);
  assert.match(sandboxContract, /isReDreamPublicSandboxPayload/);
  assert.match(sandboxContract, /sharedSandboxRequest/);
  assert.match(decision, /data\.scenarios/);
  assert.match(decision, /data\.pursuits/);
  assert.match(decision, /data\.revenue/);
  assert.match(decision, /data\.attention/);
  assert.match(decision, /Not chatbot theatre/);
  assert.match(decision, /cannot mutate the agency or send an external action/);
});

test('hero and main operating loop use the connected product model', () => {
  assert.match(site, /ReDreamLiveOperatingDemo variant="hero"/);
  assert.match(site, /<ReDreamLiveOperatingDemo \/>/);
  assert.match(live, /loadReDreamPublicSandbox/);
  assert.match(live, /LIVE SYNTHETIC PRODUCT MODEL/);
  assert.match(live, /LIVE REDREAM OPERATING MODEL/);
  assert.match(live, /Real product logic\. Synthetic data\./);
  assert.match(sandboxContract, /isolated synthetic demo environment/);
});

test('commercial journey is grouped into discover pursue and close rather than ten equal boxes', () => {
  assert.match(site, /ReDreamCommercialJourney/);
  for (const term of ['Discover','Pursue','Close','Club demand','Player fit','Relationship route','Opportunity','Pitch','Follow-up','Deal','Negotiation','Closeout','Commission']) {
    assert.match(journey, new RegExp(term));
  }
  assert.match(journey, /Context travels with the opportunity/);
  assert.match(journeyCss, /journey-pulse/);
  assert.match(journeyCss, /prefers-reduced-motion/);
});

test('website demo stays connected to first-party funnel and demo-request context', () => {
  assert.match(live, /trackFunnel\('scenario_select'/);
  assert.match(live, /trackFunnel\('scenario_run'/);
  assert.match(live, /trackFunnel\('scenario_complete'/);
  assert.match(live, /live_synthetic_operating_loop/);
  assert.match(live, /initialPriority=/);
  assert.match(decision, /trackFunnel\('product_mode'/);
  assert.match(decision, /v6_decision_layer/);
});

test('sandbox source contract can resolve only the isolated staging synthetic tenant', () => {
  assert.match(migration, /northstar-football-management/);
  assert.match(migration, /synthetic_test_tenant/);
  assert.match(migration, /environment/);
  assert.match(migration, /staging/);
  assert.match(migration, /public_demo_tenant_safety_check_failed/);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*service_role/i);
});

test('public edge endpoint is read-only and sanitises the server-only source contract', () => {
  assert.match(edge, /req\.method !== "GET"/);
  assert.match(edge, /source\.synthetic !== true/);
  assert.match(edge, /redream_public_demo_source_v1/);
  assert.match(edge, /sanitizeCommand/);
  assert.match(edge, /sanitizeNetworkClub/);
  assert.match(edge, /sanitizeDemand/);
  assert.match(edge, /sanitizePursuit/);
  assert.doesNotMatch(edge, /insert\(/);
  assert.doesNotMatch(edge, /update\(/);
  assert.doesNotMatch(edge, /delete\(/);
});

test('the deeper research pages stay small visual and truthful', () => {
  assert.match(product, /THREE LAYERS, ONE SYSTEM/);
  assert.match(product, /ReDreamDecisionLayer/);
  assert.match(security, /AUTONOMY ROUTER/);
  assert.match(security, /Public product demos use isolated synthetic agency data/);
  assert.match(switchPage, /PLAYER ROSTER MIGRATION/);
  assert.match(switchPage, /nothing is written until approval/i);
  assert.doesNotMatch(switchPage, /automatic contact migration/i);
});

test('canonical pricing remains unchanged while first value is explicit', () => {
  assert.match(site, /€149/);
  assert.match(site, /€399/);
  assert.match(site, /€799/);
  assert.match(site, /From €1,500/);
  assert.match(site, /5 staff · 40 players/);
  assert.match(site, /15 staff · 100 players/);
  assert.match(site, /30 staff · 250 players/);
  assert.match(site, /First value before full rollout/);
  assert.match(site, /ReDream should earn the right to expand/);
});

test('V6 keeps public typography readable and motion respectful', () => {
  for (const source of [css, liveCss, decisionCss, journeyCss, pagesCss]) {
    const sizes = [...source.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 13), 'Public text must stay readable');
  }
  for (const source of [css, liveCss, decisionCss, journeyCss]) assert.match(source, /prefers-reduced-motion/);
});

test('V6 avoids fabricated proof tenant-specific branding and football visual clichés', () => {
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
  assert.doesNotMatch(site, /\bDJM\b/);
  assert.doesNotMatch(site, /stadium|football pitch|soccer ball/i);
  assert.match(site + live + decision, /synthetic/i);
});
