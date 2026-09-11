#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bootstrapDir = path.join(root, 'supabase', 'staging', 'bootstrap');
const apply = process.argv.includes('--apply');

const expectedBlobs = new Map([
  ['002_application_integrity.sql', '8457ff05c853fe76d2d5a3fa0aeea6a3a75ea526'],
  ['003_private_functions_01.sql', '1964b6890c26ad97123d890c246e7637206fdf06'],
  ['003_private_functions_02.sql', '9bb46bb37959ad9eab6db1b296d2617bb41ed929'],
  ['003_private_functions_03.sql', '11ebbf71ba6e200fe79c015ea25d54feac753e30'],
  ['003_private_functions_04_13-24.sql', '68470cec7f3df7bd1e38915cb39d3239401ee3f1'],
  ['003_private_functions_05_25-36.sql', '6a2364267b1e2a9804482ad6f5d9992977a5db39'],
  ['003_private_functions_06_37-53.sql', '0338b88559208d668d3ed3a274e0aec4f202db9e'],
  ['003_private_functions_07_54-70.sql', 'eb07e8a81748a7cfe2468e4528dcf7be042e701b'],
  ['004_djm_os_functions_01_01-20.sql', '586cceabd64a33b89bb54ca79057b7a91bd301bd'],
  ['004_djm_os_functions_02_21-40.sql', 'b97d4820bd615c0240dff34b8fa2bd7937e06561'],
  ['004_djm_os_functions_03_41-60.sql', '6c6add4fca7f01b9ec645253010898a96ee99046'],
  ['004_djm_os_functions_04_61-80.sql', '12add6c21448fa724f07adee8c16128e4a7ad4aa'],
  ['004_djm_os_functions_05_81-95.sql', '4b413cb5a9163d500b08391dc880dba762ca5e5d'],
  ['005_public_functions_01_01-20.sql', '1a00ffde7bd0a866b954b3e7884e82037d1640c9'],
  ['005_public_functions_02_21-60.sql', 'd47d4e7ae4b97ed243bd710165e1490a4c6b0f23'],
  ['005_public_functions_03_61-100.sql', '9ab05cc8fdc3047631fac0fd788db62d82aaba9b'],
  ['005_public_functions_04_101-140.sql', '6134def3534696b38a81633318e071b8c829cd36'],
  ['005_public_functions_05_141-180.sql', '50aa64d4a7c14ba53428ae940e69772f5ca785b3'],
  ['005_public_functions_06_181-220.sql', '85b8d77e4698d0aa0c73ffd37859cc601d66c899'],
  ['005_public_functions_07_221-240.sql', 'ffb082da24c3ba187d5cb831bf0883a3bf3642f1'],
]);

const expectedFunctionCounts = new Map([
  ['003_private_functions_01.sql', 4],
  ['003_private_functions_02.sql', 4],
  ['003_private_functions_03.sql', 4],
  ['003_private_functions_04_13-24.sql', 12],
  ['003_private_functions_05_25-36.sql', 12],
  ['003_private_functions_06_37-53.sql', 17],
  ['003_private_functions_07_54-70.sql', 17],
  ['004_djm_os_functions_01_01-20.sql', 20],
  ['004_djm_os_functions_02_21-40.sql', 20],
  ['004_djm_os_functions_03_41-60.sql', 20],
  ['004_djm_os_functions_04_61-80.sql', 20],
  ['004_djm_os_functions_05_81-95.sql', 15],
  ['005_public_functions_01_01-20.sql', 20],
  ['005_public_functions_02_21-60.sql', 40],
  ['005_public_functions_03_61-100.sql', 40],
  ['005_public_functions_04_101-140.sql', 40],
  ['005_public_functions_05_141-180.sql', 40],
  ['005_public_functions_06_181-220.sql', 40],
  ['005_public_functions_07_221-240.sql', 20],
]);

function gitBlob(file) {
  return execFileSync('git', ['hash-object', file], { cwd: root, encoding: 'utf8' }).trim();
}

function assertOriginalBlob(fileName) {
  const file = path.join(bootstrapDir, fileName);
  const expected = expectedBlobs.get(fileName);
  const actual = gitBlob(file);
  if (actual !== expected) {
    throw new Error(`${fileName}: expected source blob ${expected}, found ${actual}. Aborting rather than overwriting drift.`);
  }
}

function repairIntegrity(source) {
  const sectionStart = source.indexOf('-- SECTION 1: constraints');
  const sectionTwo = source.indexOf('-- SECTION 2: indexes');
  if (sectionStart < 0 || sectionTwo < 0 || sectionTwo <= sectionStart) {
    throw new Error('002_application_integrity.sql: expected section markers were not found');
  }

  const prefix = source.slice(0, sectionStart);
  const constraintBlock = source.slice(sectionStart, sectionTwo);
  const suffix = source.slice(sectionTwo);
  const statements = constraintBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^alter table\s+/i.test(line));

  const primary = [];
  const unique = [];
  const checks = [];
  const foreign = [];
  const unknown = [];

  for (const statement of statements) {
    if (/\sPRIMARY KEY\s/i.test(statement)) primary.push(statement);
    else if (/\sUNIQUE\s*\(/i.test(statement)) unique.push(statement);
    else if (/\sCHECK\s*\(/i.test(statement)) checks.push(statement);
    else if (/\sFOREIGN KEY\s*\(/i.test(statement)) foreign.push(statement);
    else unknown.push(statement);
  }

  const counts = { primary: primary.length, unique: unique.length, checks: checks.length, foreign: foreign.length };
  const expected = { primary: 117, unique: 44, checks: 207, foreign: 220 };
  if (JSON.stringify(counts) !== JSON.stringify(expected) || unknown.length) {
    throw new Error(`002_application_integrity.sql: unexpected constraint parse ${JSON.stringify({ ...counts, unknown: unknown.length })}`);
  }

  const rebuilt = [
    '-- SECTION 1: constraints',
    '-- Dependency-safe order: keys before checks, checks before foreign keys.',
    '-- 1A. Primary keys',
    ...primary,
    '',
    '-- 1B. Unique constraints',
    ...unique,
    '',
    '-- 1C. Check constraints',
    ...checks,
    '',
    '-- 1D. Foreign keys',
    ...foreign,
    '',
    '',
  ].join('\n');

  return prefix + rebuilt + suffix;
}

function repairFunctions(source, fileName) {
  const expectedCount = expectedFunctionCounts.get(fileName);
  const functionCount = (source.match(/CREATE OR REPLACE FUNCTION\s+/g) || []).length;
  if (functionCount !== expectedCount) {
    throw new Error(`${fileName}: expected ${expectedCount} functions, found ${functionCount}`);
  }

  const repaired = source.replace(
    /(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)(\r?\n)(?=\s*(?:CREATE OR REPLACE FUNCTION|commit;))/g,
    '$1;$2',
  );

  const missing = (repaired.match(/(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)\r?\n(?=\s*(?:CREATE OR REPLACE FUNCTION|commit;))/g) || []).length;
  if (missing !== 0) {
    throw new Error(`${fileName}: ${missing} unterminated function statements remain`);
  }
  return repaired;
}

const changes = [];

for (const fileName of expectedBlobs.keys()) {
  assertOriginalBlob(fileName);
  const file = path.join(bootstrapDir, fileName);
  const source = fs.readFileSync(file, 'utf8');
  const next = fileName === '002_application_integrity.sql'
    ? repairIntegrity(source)
    : repairFunctions(source, fileName);

  if (source === next) {
    throw new Error(`${fileName}: repair produced no change; source shape may have drifted`);
  }
  changes.push({ fileName, file, next });
}

console.log('DJM staging bootstrap repair check passed.');
console.log('Planned changes:');
for (const change of changes) console.log(`  MOD ${change.fileName}`);

if (!apply) {
  console.log('\nNo files changed. Run again with --apply to write the dependency-safe bootstrap source.');
  process.exit(0);
}

for (const change of changes) fs.writeFileSync(change.file, change.next);

console.log('\nApplied bootstrap repairs to the working tree only.');
console.log('No database, deployment, merge, or production action was performed.');
