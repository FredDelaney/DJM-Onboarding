// Check the actual production output, including transitive client dependencies.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';

const context = {globalThis: {}};
vm.runInNewContext(await readFile('.next/server/app/workspace/[tenantSlug]/page_client-reference-manifest.js', 'utf8'), context);
const manifest = Object.values(context.globalThis.__RSC_MANIFEST)[0];
const entry = Object.entries(manifest.clientModules).find(([name]) => name.endsWith('/components/AgencyOperatingWorkspace.tsx'))?.[1];
assert.ok(entry, 'The production workspace client entry must exist');
const chunks = [...new Set(entry.chunks)].filter(path => path.endsWith('.js'));
assert.ok(chunks.length, 'The workspace must have measurable client chunks');
let bytes = 0, gzipBytes = 0;
for (const path of chunks) {
  const local = '.next/' + path.replace(/^\/_next\//, '');
  bytes += (await stat(local)).size;
  gzipBytes += gzipSync(await readFile(local)).length;
}
console.log(JSON.stringify({entry: 'AgencyOperatingWorkspace', chunks: chunks.length, bytes, gzipBytes, gzipBudget: 150_000}));
assert.ok(gzipBytes <= 150_000, 'Home must stay below 150 KB of gzipped workspace entry code; hidden tools belong in separate chunks');
