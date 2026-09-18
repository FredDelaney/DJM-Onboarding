import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');
const ops = readFileSync('supabase/functions/platform-ops/index.ts', 'utf8');

test('direct onboarding requires real contract evidence at agency creation', () => {
  assert.match(page, /contractAmount: string/);
  assert.match(page, /contractCurrency: string/);
  assert.match(page, /annualCommitment: boolean/);
  assert.match(page, /const directOnboardingReady/);
  assert.match(
    page,
    /agency\.commercialStart !== 'onboarding'[\s\S]*agencyContractMonthlyCents > 0/,
  );
  assert.match(page, /disabled=\{creating \|\| !directOnboardingReady\}/);
});

test('direct onboarding sends contract truth through the existing create customer bridge', () => {
  assert.match(
    page,
    /contracted_monthly_cents:[\s\S]*agency\.commercialStart === 'onboarding'/,
  );
  assert.match(page, /contract_currency:/);
  assert.match(page, /annual_commitment:/);

  assert.match(ops, /if\(body\?\.contracted_monthly_cents!==undefined\)/);
  assert.match(ops, /lifecycleUpdates\.p_contracted_monthly_cents/);
  assert.match(ops, /platform_server_operator_update_customer/);
});

test('non-trial agencies can record or correct contract evidence without lifecycle mutation', () => {
  assert.match(page, /const updateCommercialContract = async/);
  assert.match(page, /action: 'update_customer'/);
  assert.match(page, /contracted_monthly_cents: conversionMonthlyCents/);
  assert.match(page, /contract_currency: conversionCurrency/);
  assert.match(page, /annual_commitment: detailAnnualCommitment/);

  const start = page.indexOf('const updateCommercialContract = async');
  const end = page.indexOf('const updateCustomerPlan', start);
  const source = page.slice(start, end);

  assert.doesNotMatch(source, /stage:/);
  assert.doesNotMatch(source, /plan_key:/);
  assert.doesNotMatch(source, /go_live_customer/);
});

test('contract corrections require review and explicit confirmation', () => {
  assert.match(page, /confirmingContractUpdate/);
  assert.match(page, /Review contract/);
  assert.match(page, /Confirm contract/);
  assert.match(page, /if \(!confirmingContractUpdate\)/);
  assert.match(page, /contractHasChanges/);
  assert.match(page, /contractUpdateReady/);
});

test('contract capture uses compact commercial styling', () => {
  assert.match(css, /\.directContract,/);
  assert.match(css, /\.contractControl\s*\{/);
  assert.match(css, /\.contractConfirm\s*\{/);
});
