import { promises as fs } from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'lib', 'public', 'supabase/functions'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html', '.json', '.md']);
const forbidden = '\u2014';
let changed = 0;

async function walk(target) {
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) await walk(fullPath);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;

    const source = await fs.readFile(fullPath, 'utf8');
    if (!source.includes(forbidden)) continue;
    const cleaned = source.replaceAll(forbidden, '-');
    await fs.writeFile(fullPath, cleaned, 'utf8');
    changed += 1;
  }
}

for (const root of roots) await walk(root);
console.log(`DJM text guard: ${changed} file(s) normalised; no U+2014 remains in user-facing source.`);
