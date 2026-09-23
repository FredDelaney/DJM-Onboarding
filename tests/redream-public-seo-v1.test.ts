import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const sitemap = fs.readFileSync('app/sitemap.ts', 'utf8');
const robots = fs.readFileSync('app/robots.ts', 'utf8');
const landing = fs.readFileSync(
  'components/ReDreamPublicLanding.tsx',
  'utf8',
);

test('ReDream public root has canonical production metadata for indexing', () => {
  assert.match(layout, /metadataBase: new URL\('https:\/\/redreamsystems\.com'\)/);
  assert.match(layout, /canonical: '\/'/);
  assert.match(layout, /index:\s*true/);
  assert.match(layout, /follow:\s*true/);
  assert.match(layout, /Operating system for football agencies/);
});

test('public sitemap contains only the intentional ReDream sales root', () => {
  assert.match(sitemap, /https:\/\/redreamsystems\.com\//);
  assert.match(sitemap, /changeFrequency: 'weekly'/);
  assert.doesNotMatch(sitemap, /\/platform/);
  assert.doesNotMatch(sitemap, /\/workspace/);
});

test('robots advertises the sitemap while keeping private application routes out of search', () => {
  assert.match(robots, /https:\/\/redreamsystems\.com\/sitemap\.xml/);
  assert.match(robots, /allow: '\/'/);
  for (const route of [
    '/activate/',
    '/admin/',
    '/join/',
    '/platform/',
    '/workspace/',
  ]) {
    assert.match(robots, new RegExp(route.replaceAll('/', '\\/')));
  }
});

test('public sales root exposes SoftwareApplication structured data with the correct application category', () => {
  assert.match(landing, /'@type': 'SoftwareApplication'/);
  assert.match(landing, /applicationCategory: 'BusinessApplication'/);
  assert.match(landing, /operating system for football agencies/);
});

test('legacy website contract remains represented inside the operating-system positioning', () => {
  assert.match(landing, /Player Service/);
  assert.match(landing, /Access\s+Intelligence/);
  assert.match(landing, /Deal Control/);
  assert.match(landing, /Closeout & Collection/);
});
