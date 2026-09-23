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
const negotiation = fs.readFileSync(
  'components/AgencyNegotiationCommandRoom.tsx',
  'utf8',
);

test('Deal War Room opens one tenant-native Negotiation Command Room', () => {
  assert.match(workspace, /AgencyNegotiationCommandRoom/);
  assert.match(warRoom, /Negotiation room/);
  assert.doesNotMatch(workspace, /key: 'negotiation'/);
});

test('Negotiation Command Room composes the existing decision and preparation contracts', () => {
  for (const action of [
    'negotiation_brief',
    'negotiation_readiness',
    'negotiation_sequence',
    'deal_decision_map',
    'deal_decision_pressure',
    'deal_guardrails',
    'deal_origin',
  ]) {
    assert.match(negotiation, new RegExp(action));
  }
});

test('Private negotiation limits remain human-set and never AI-invented', () => {
  assert.match(negotiation, /PRIVATE GUARDRAILS/);
  assert.match(negotiation, /deal_guardrails_save/);
  assert.match(
    negotiation,
    /never invents negotiation floors, targets, concessions or walk-away terms/,
  );
});

test('Guardrail approval stays owner or admin only and explicitly confirmed', () => {
  assert.match(
    negotiation,
    /\['owner', 'admin'\]\.includes/,
  );
  assert.match(negotiation, /deal_guardrails_approve/);
  assert.match(negotiation, /CONFIRM INTERNAL GUARDRAILS/);
  assert.match(
    negotiation,
    /does not send, accept or legally bind any term/,
  );
});

test('Negotiation next step stays inside the existing guarded action system', () => {
  assert.match(
    negotiation,
    /negotiation_next_step_prepare/,
  );
  assert.match(
    negotiation,
    /Create preparation task/,
  );
});

test('Negotiation intelligence does not masquerade as outcome or authority prediction', () => {
  assert.match(
    negotiation,
    /not signing probability/,
  );
  assert.match(
    negotiation,
    /does not prove formal signing authority/,
  );
  assert.match(
    negotiation,
    /not legal advice, regulatory clearance, authority confirmation, bargaining-power analysis or a prediction of signing outcome/,
  );
  assert.doesNotMatch(negotiation, /\bDJM\b/);
});
