import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');

test('plan entitlement mutation requires explicit review and confirmation', () => {
  assert.match(page, /confirmingPlanChange/);
  assert.match(page, /Review plan change/);
  assert.match(page, /Confirm plan change/);
  assert.match(page, /if \(!confirmingPlanChange\)/);
  assert.match(page, /setConfirmingPlanChange\(true\)/);
});

test('plan review shows current and target plan context before mutation', () => {
  assert.match(page, /const currentPlan = useMemo/);
  assert.match(page, /currentPlan\.display_name/);
  assert.match(page, /selectedPlan\.display_name/);
  assert.match(page, /planPrice\(currentPlan\)/);
  assert.match(page, /planPrice\(selectedPlan\)/);
  assert.match(page, /planChangeKind/);
});

test('expansion evidence informs but never auto executes a plan change', () => {
  assert.match(
    page,
    /selectedCustomer\?\.capacity\?\.next_plan_key === detailPlan/,
  );
  assert.match(
    page,
    /No automatic upgrade decision is being made/,
  );

  const updateStart = page.indexOf('const updateCustomerPlan = async');
  const attachStart = page.indexOf('const attachOwner', updateStart);
  const source = page.slice(updateStart, attachStart);

  assert.match(source, /action: 'update_customer'/);
  assert.match(source, /plan_key: detailPlan/);
  assert.doesNotMatch(source, /next_plan_key/);
});

test('changing the target invalidates any previous confirmation', () => {
  assert.match(
    page,
    /setDetailPlan\(event\.target\.value\);[\s\S]*setConfirmingPlanChange\(false\)/,
  );
});

test('plan confirmation stays compact and responsive', () => {
  assert.match(css, /\.planChangeConfirm\s*\{/);
  assert.match(css, /\.planChangeEvidence\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*\.planChangeConfirm/,
  );
});
