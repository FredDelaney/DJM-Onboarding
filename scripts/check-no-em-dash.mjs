import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['app', 'components', 'lib', 'public', 'supabase/functions'];
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.md',
]);
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

    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) {
        await walk(fullPath);
      }
      continue;
    }

    if (!textExtensions.has(extname(entry.name))) continue;

    const value = await readFile(fullPath, 'utf8');
    const lines = value.split(/\r?\n/);

    lines.forEach((line, lineIndex) => {
      let searchFrom = 0;
      while (true) {
        const columnIndex = line.indexOf(forbidden, searchFrom);
        if (columnIndex === -1) break;

        hits.push({
          path: fullPath,
          line: lineIndex + 1,
          column: columnIndex + 1,
        });

        searchFrom = columnIndex + forbidden.length;
      }
    });
  }
}

for (const root of roots) {
  await walk(root);
}

if (hits.length) {
  console.error(
    `Forbidden U+2014 character found ${hits.length} time(s) in user-facing source:`,
  );

  for (const hit of hits) {
    console.error(`- ${hit.path}:${hit.line}:${hit.column}`);
  }

  console.error(
    'Fix each U+2014 location intentionally with appropriate punctuation. Do not blindly auto-rewrite source.',
  );

  process.exit(1);
}

console.log('No U+2014 characters found in user-facing source.');
