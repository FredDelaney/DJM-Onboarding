import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const page = fs.readFileSync('app/page.tsx', 'utf8');
const sitemap = fs.readFileSync('app/sitemap.ts', 'utf8');
const robots = fs.readFileSync('app/robots.ts', 'utf8');
const landing = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const product = fs.readFileSync('app/(redream-public)/product/page.tsx', 'utf8');
const security = fs.readFileSync('app/(redream-public)/security/page.tsx', 'utf8');
const migration = fs.readFileSync('app/(redream-public)/switch/page.tsx', 'utf8');

test('ReDream public root retains clear canonical production metadata for indexing', () => {
  assert.match(layout, /metadataBase: new URL\('https:\/\/redreamsystems\.com'\)/);
  assert.match(layout, /canonical: '\/'/);
  assert.match(layout, /index:\s*true/);
  assert.match(layout, /follow:\s*true/);
  assert.match(page, /Software for football agencies/);
  assert.match(page, /what needs attention and what to do next/);
});

test('public sitemap exposes only intentional ReDream research routes', () => {
  for (const route of ["'/'", "'/product'", "'/security'", "'/switch'"]) {
    assert.match(sitemap, new RegExp(route.replace('/', '\\/')));
  }
  assert.match(sitemap, /changeFrequency: 'weekly'/);
  assert.doesNotMatch(sitemap, /\/platform/);
  assert.doesNotMatch(sitemap, /\/workspace/);
});

test('deeper public pages own their canonical metadata', () => {
  assert.match(product, /canonical: '\/product'/);
  assert.match(security, /canonical: '\/security'/);
  assert.match(migration, /canonical: '\/switch'/);
});

test('robots advertises the sitemap while keeping private application routes out of search', () => {
  assert.match(robots, /https:\/\/redreamsystems\.com\/sitemap\.xml/);
  assert.match(robots, /allow: '\/'/);
  for (const route of ['/activate/', '/admin/', '/join/', '/platform/', '/workspace/']) {
    assert.match(robots, new RegExp(route.replaceAll('/', '\\/')));
  }
});

test('public sales root exposes SoftwareApplication structured data in plain language', () => {
  assert.match(landing, /'@type': 'SoftwareApplication'/);
  assert.match(landing, /applicationCategory: 'BusinessApplication'/);
  assert.match(landing, /football agencies/);
});
