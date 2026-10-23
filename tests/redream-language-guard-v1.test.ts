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

// Registry integrity digests are opaque bytes, not product language. A patched
// native dependency happened to contain the category token inside its checksum.
function categoryText(file:string,source:string){
  return (file==='package-lock.json'
    ? JSON.stringify(JSON.parse(source),(key,value)=>key==='integrity'?undefined:value)
    : source).toLowerCase();
}

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
    const source = categoryText(file,fs.readFileSync(file, 'utf8'));
    return source.includes(forbidden);
  });

  assert.deepEqual(
    offenders,
    [],
    `Forbidden category language found in: ${offenders.join(', ')}`,
  );
});

test('only lockfile checksums are ignored; readable copy and other JSON stay guarded',()=>{
  const checksum=JSON.stringify({packages:{example:{integrity:'sha512-'+forbidden}}});
  assert.equal(categoryText('package-lock.json',checksum).includes(forbidden),false);
  assert.equal(categoryText('product.json',checksum).includes(forbidden),true);
  const metadata=JSON.stringify({packages:{example:{integrity:'sha512-'+forbidden,description:forbidden}}});
  assert.equal(categoryText('package-lock.json',metadata).includes(forbidden),true);
});
