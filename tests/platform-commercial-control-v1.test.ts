import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');
const health = readFileSync(
  'supabase/migrations/20260915122006_add_time_aware_operator_attention_v1.sql',
  'utf8',
);

test('commercial control reuses the operator portfolio truth already returned per agency', () => {
  assert.match(page, /const selectedCustomer = useMemo/);
  assert.match(page, /selectedCustomer\.trial_days_left/);
  assert.match(page, /selectedCustomer\?\.commercial/);
  assert.match(page, /selectedCustomer\?\.capacity/);
  assert.match(page, /selectedCustomer\?\.expansion_signals/);
  assert.match(health, /ai_cost_micros_30d/);
  assert.match(health, /trial_days_left/);
});

test('commercial control exposes decision-grade commercial context without auto conversion', () => {
  assert.match(page, /Plan and conversion/);
  assert.match(page, /Trial position/);
  assert.match(page, /Contracted MRR/);
  assert.match(page, /AI cost 30d/);
  assert.match(page, /Player capacity/);
  assert.match(page, /Staff capacity/);
  assert.match(page, /Conversion evidence available/);
  assert.match(page, /Trial still proving value/);
  assert.match(page, /Expansion evidence available/);
  assert.doesNotMatch(page, /action:\s*'convert_trial'/);
  assert.doesNotMatch(page, /action:\s*'upgrade_plan'/);
});

test('AI cost is labelled and converted from recorded micro USD rather than customer billing currency', () => {
  assert.match(page, /currency: 'USD'/);
  assert.match(page, /micros\) \/ 1_000_000/);
  assert.match(page, /Estimated model cost in US dollars/);
});

test('existing explicit plan mutation remains the only commercial write in this slice', () => {
  assert.match(page, /action: 'update_customer'/);
  assert.match(page, /plan_key: detailPlan/);
  assert.match(
    page,
    /Changing plan changes entitlements\. It does not convert[\s\S]*lifecycle stage by itself/,
  );
});

test('commercial control is compact and responsive inside the existing drawer', () => {
  assert.match(css, /\.commercialMetrics\s*\{/);
  assert.match(css, /\.commercialDecision\s*\{/);
  assert.match(css, /\.capacityGrid\s*\{/);
  assert.match(css, /\.expansionSignals\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*\.commercialMetrics/,
  );
});
