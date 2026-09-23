import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const forbidden = String.fromCharCode(67, 82, 77).toLowerCase();

const searchableExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.md',
  '.json',
  '.css',
  '.sql',
  '.html',
  '.txt',
  '.yml',
  '.yaml',
  '.webmanifest',
]);

test('ReDream language stays inside its own operating-system category', () => {
  const files = execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((file) => searchableExtensions.has(path.extname(file)));

  const offenders = files.filter((file) => {
    const source = fs.readFileSync(file, 'utf8').toLowerCase();
    return source.includes(forbidden);
  });

  assert.deepEqual(
    offenders,
    [],
    `Forbidden category language found in: ${offenders.join(', ')}`,
  );
});
