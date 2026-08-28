import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['app', 'components', 'lib', 'public', 'supabase/functions'];
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html', '.json', '.md']);
const forbidden = String.fromCodePoint(0x2014);
const hits = [];

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (textExtensions.has(extname(entry.name))) {
      const value = await readFile(fullPath, 'utf8');
      if (value.includes(forbidden)) hits.push(fullPath);
    }
  }
}

for (const root of roots) await walk(root);

if (hits.length) {
  console.error('Forbidden U+2014 character found in user-facing source:');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log('No U+2014 characters found in user-facing source.');
