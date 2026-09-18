import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');
const ops = readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');

test('new agencies can start a real trial instead of collecting unused trial days', () => {
  assert.match(page, /commercialStart: 'trial'/);
  assert.match(page, /stage: agency\.commercialStart/);
  assert.match(
    page,
    /agency\.commercialStart === 'trial' \? agency\.trialDays : 14/,
  );
  assert.match(page, /Start as trial/);
  assert.match(page, /Direct onboarding/);
  assert.match(page, /agency\.commercialStart === 'trial'/);
});

test('trial conversion reuses the existing audited customer update bridge', () => {
  assert.match(page, /const convertTrial = async/);
  assert.match(page, /action: 'update_customer'/);
  assert.match(page, /stage: 'onboarding'/);
  assert.match(page, /contracted_monthly_cents: conversionMonthlyCents/);
  assert.match(page, /contract_currency: conversionCurrency/);
  assert.match(page, /annual_commitment: detailAnnualCommitment/);

  assert.match(ops, /action==="update_customer"/);
  assert.match(ops, /platform_server_operator_update_customer/);
  assert.match(ops, /p_contracted_monthly_cents/);
  assert.match(ops, /p_annual_commitment/);
});

test('paid conversion requires explicit review and confirmation', () => {
  assert.match(page, /confirmingConversion/);
  assert.match(page, /Review conversion/);
  assert.match(page, /Confirm conversion/);
  assert.match(page, /conversionReady/);
  assert.match(page, /conversionMonthlyCents > 0/);
  assert.match(page, /\^\[A-Z\]\{3\}\$/);
});

test('conversion does not falsely mark the agency live', () => {
  assert.match(
    page,
    /Go-live remains a separate[\s\S]*evidence-guarded action/,
  );
  assert.match(page, /It does not mark the agency live/);

  const convertStart = page.indexOf('const convertTrial = async');
  const planStart = page.indexOf('const updateCustomerPlan', convertStart);
  const conversionSource = page.slice(convertStart, planStart);

  assert.doesNotMatch(conversionSource, /stage: 'live'/);
  assert.doesNotMatch(conversionSource, /go_live_customer/);
});

test('trial lifecycle surfaces stay compact and responsive', () => {
  assert.match(css, /\.commercialStartPicker\s*\{/);
  assert.match(css, /\.trialConversion\s*\{/);
  assert.match(css, /\.conversionFields\s*\{/);
  assert.match(css, /\.conversionConfirm\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*\.commercialStartPicker/,
  );
});
