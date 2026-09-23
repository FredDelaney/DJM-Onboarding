import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const warRoom = fs.readFileSync(
  'components/AgencyEntityIntelligenceDrawer.tsx',
  'utf8',
);
const closeout = fs.readFileSync(
  'components/AgencyDealCloseoutDrawer.tsx',
  'utf8',
);

test('Deal War Room opens one closeout and collection surface instead of a separate navigation area', () => {
  assert.match(workspace, /AgencyDealCloseoutDrawer/);
  assert.match(warRoom, /Closeout & commission/);
  assert.doesNotMatch(workspace, /key: 'closeout'/);
});

test('Closeout reads and writes only through existing tenant-native Agency OS contracts', () => {
  for (const action of [
    'deal_closeout',
    'deal_closeout_save',
    'deal_receivables',
    'deal_receivable_save',
    'receivable_payment_record',
  ]) {
    assert.match(closeout, new RegExp(action));
  }
});

test('Confirmed closeout remains stage-gated and explicitly human-confirmed', () => {
  assert.match(closeout, /contracting/);
  assert.match(closeout, /completionConfirmed/);
  assert.match(closeout, /Record a final terms summary before confirmation/);
  assert.match(
    closeout,
    /Operational closeout is an agency record/,
  );
});

test('Expected commission never becomes a receivable automatically', () => {
  assert.match(closeout, /forecast commission/);
  assert.match(
    closeout,
    /Forecast commission remains separate/,
  );
  assert.match(
    closeout,
    /Expected commission is a forecast only/,
  );
});

test('Receivables and payments remain controlled collection records', () => {
  assert.match(
    closeout,
    /\['owner', 'admin', 'operations'\]\.includes/,
  );
  assert.match(closeout, /Payment cannot exceed/);
  assert.match(closeout, /not tax invoices or accounting ledger entries/);
});

test('Closeout surface remains tenant-neutral', () => {
  assert.doesNotMatch(closeout, /\bDJM\b/);
  assert.doesNotMatch(closeout, /\/admin\//);
});
