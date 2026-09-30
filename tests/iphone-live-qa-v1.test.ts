import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

test('mobile shell cannot exceed the iPhone viewport', () => {
  assert.match(shell, /Live iPhone QA v1/);
  assert.match(
    shell,
    /\.main[\s\S]*width: 100%[\s\S]*max-width: 100vw[\s\S]*box-sizing: border-box/,
  );
  assert.match(shell, /\.root[\s\S]*overflow-x: clip/);
});

test('bottom navigation gets the full mobile width', () => {
  assert.match(
    shell,
    /\.sidebar[\s\S]*left: 16px[\s\S]*right: 16px[\s\S]*width: auto/,
  );
  assert.match(
    shell,
    /\.nav[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    shell,
    /\.mobileTell[\s\S]*bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\)/,
  );
});
