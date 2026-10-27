import assert from 'node:assert/strict';
import test from 'node:test';

import { dossierContractExpiry, dossierHeadline, dossierPerformance, dossierPositionMap } from '../lib/dossier.ts';

test('maps primary and secondary positions onto distinct football locations', () => {
  assert.deepEqual(
    dossierPositionMap({ primary_position: 'CDM', secondary_positions: ['CB'] }),
    [
      { label: 'DM', x: 50, y: 59, primary: true, sourceLabel: 'CDM' },
      { label: 'CB', x: 50, y: 73, primary: false, sourceLabel: 'CB' },
    ],
  );
});

test('position map understands long-form football roles', () => {
  const spots = dossierPositionMap({
    primary_position: 'Right Winger',
    secondary_positions: ['Attacking Midfielder', 'Left Winger'],
  });

  assert.deepEqual(spots.map((spot) => spot.label), ['RW', 'AM', 'LW']);
  assert.equal(spots[0].primary, true);
});

test('season bars compare one honest measure and retain exact labels', () => {
  const result = dossierPerformance({
    career_timeline: [
      { season_label: '24/25', minutes: 900 },
      { season_label: '23/24', minutes: 450 },
    ],
  });

  assert.equal(result.metric, 'minutes');
  assert.deepEqual(result.rows.map((row) => row.visualPercentage), [100, 50]);
  assert.deepEqual(result.rows.map((row) => row.visualLabel), ['900 mins', '450 mins']);
});


test('contract expiry is an exact calendar date, with missing and impossible dates omitted', () => {
  assert.equal(dossierContractExpiry('2027-06-30'), '30 Jun 2027');
  assert.equal(dossierContractExpiry('2028-02-29'), '29 Feb 2028');
  for (const value of [null, undefined, '', '2027-02-29', '2027-04-31', '2027-13-01', '2027-06-30T00:00:00Z', 2027]) assert.equal(dossierContractExpiry(value), null);
});

test('the hero omits a repeated identity line and preserves a meaningful authored introduction', () => {
  const profile = {primary_position: 'Centre back', current_club: 'Example FC'};
  assert.equal(dossierHeadline({...profile, headline: '  Centre back · Example FC  '}), null);
  assert.equal(dossierHeadline({...profile, headline: 'CENTRE BACK · Example FC'}), null);
  assert.equal(dossierHeadline({...profile, headline: 'A left-footed defender with senior experience.'}), 'A left-footed defender with senior experience.');
});
