import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const launcherCss = readFileSync(
  'components/DjmTellDjmLauncher.module.css',
  'utf8',
);
const resolverMigration = readFileSync(
  'supabase/migrations/20260901171253_fix_tell_djm_resolver_search_path.sql',
  'utf8',
);

test('Tell DJM desktop launcher leaves the top workspace visible', () => {
  assert.match(launcherCss, /place-items:start center/);
  assert.match(launcherCss, /padding:84px 18px 18px/);
  assert.match(launcherCss, /calc\(100vh - 102px\)/);
  assert.match(launcherCss, /@media\(max-width:760px\).*place-items:end center/s);
});

test('Tell DJM resolver qualifies pg_trgm similarity under locked search_path', () => {
  assert.match(resolverMigration, /extensions\.similarity\(/);
  assert.match(resolverMigration, /djm_tell_resolve_entity/);
  assert.match(resolverMigration, /reload schema/);
});
