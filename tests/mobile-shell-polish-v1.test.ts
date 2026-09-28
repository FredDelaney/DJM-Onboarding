import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const styles = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test(
  'mobile workspace respects iPhone top and bottom safe areas',
  () => {
    assert.match(
      styles,
      /padding:[\s\S]*calc\(18px \+ env\(safe-area-inset-top\)\)/,
    );

    assert.match(
      styles,
      /calc\(64px \+ env\(safe-area-inset-bottom\)\)/,
    );

    assert.match(
      styles,
      /calc\(6px \+ env\(safe-area-inset-bottom\)\)/,
    );
  },
);

test(
  'mobile bottom navigation is compact and visually centred',
  () => {
    assert.match(
      styles,
      /\.nav a \{[\s\S]*min-height: 44px/,
    );

    assert.match(
      styles,
      /grid-template-rows: 19px auto/,
    );

    assert.match(
      styles,
      /place-items: center/,
    );

    assert.match(
      styles,
      /text-align: center/,
    );
  },
);

test(
  'mobile active navigation no longer adds top visual height',
  () => {
    assert.match(
      styles,
      /\.nav a\.navActive \{[\s\S]*inset 0 0 0 1px/,
    );
  },
);
