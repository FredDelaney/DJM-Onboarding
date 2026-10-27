// Read-only document and initial-asset audit. No sign-in or customer data writes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const base = new URL(process.env.SITE_LOADING_URL || 'https://app.djmsports.com');
const paths = (process.env.SITE_LOADING_PATHS || '/,/sign-in,/home,/workspace/djm,/settings,/career').split(',');
const assets = new Map();
const asset = (path) => {
  const url = new URL(path.replaceAll('&amp;', '&'), base);
  assert.equal(url.origin, base.origin, 'Only audit assets on the requested origin');
  if (!assets.has(url.href)) assets.set(url.href, (async () => {
    const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
    assert.equal(response.status, 200, 'Asset must load: ' + url.pathname);
    const body = Buffer.from(await response.arrayBuffer());
    return {path: url.pathname, bytes: body.length, gzipBytes: gzipSync(body).length};
  })());
  return assets.get(url.href);
};

const pages = [];
for (const path of paths) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), {signal: AbortSignal.timeout(30_000)});
  const ttfbMs = Math.round(performance.now() - started);
  assert.equal(response.status, 200, 'Document must load: ' + path);
  const html = await response.text();
  const documentMs = Math.round(performance.now() - started);
  const scriptPaths = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]))];
  const cssPaths = [...new Set([...html.matchAll(/<link\b[^>]*>/g)].filter(match => /rel="stylesheet"/.test(match[0])).map(match => match[0].match(/href="([^"]+)"/)?.[1]).filter(Boolean))];
  const resources = [];
  for (const [kind, paths] of [['js', scriptPaths], ['css', cssPaths]]) {
    for (let i = 0; i < paths.length; i += 4) {
      resources.push(...await Promise.all(paths.slice(i, i + 4).map(async path => ({kind, ...await asset(path)}))));
    }
  }
  const sum = (kind, key) => resources.filter(resource => resource.kind === kind).reduce((total, resource) => total + resource[key], 0);
  const page = {path, status: response.status, ttfbMs, documentMs, htmlBytes: Buffer.byteLength(html), jsBytes: sum('js', 'bytes'), jsGzipBytes: sum('js', 'gzipBytes'), cssBytes: sum('css', 'bytes'), cssGzipBytes: sum('css', 'gzipBytes'), resources};
  pages.push(page);
  console.log(JSON.stringify({...page, resources: resources.length}));
}
const report = {createdAt: new Date().toISOString(), base: base.origin, note: 'Unauthenticated HTML and its initial script/stylesheet assets. Gzip sizes are calculated consistently from decoded assets; these are payload measurements, not a Core Web Vitals or signed-in speed score.', pages};
if (process.env.SITE_LOADING_REPORT) await writeFile(process.env.SITE_LOADING_REPORT, JSON.stringify(report, null, 2) + '\n');
