import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/platform/page.tsx', 'utf8');
const css = readFileSync('app/platform/platform.module.css', 'utf8');

test('ReDream hero presents live portfolio truth without inventing new metrics', () => {
  assert.match(page, /Portfolio control/);
  assert.match(page, /summary\.external_customers/);
  assert.match(page, /summary\.live_customers/);
  assert.match(page, /summary\.customers_needing_action/);
  assert.match(page, /Portfolio live/);
  assert.match(page, /environmentLabel/);
});

test('showcase hero keeps new agency creation on the existing guarded path', () => {
  const heroStart = page.indexOf('<section className={styles.hero}>');
  const heroEnd = page.indexOf('</section>', heroStart);
  const hero = page.slice(heroStart, heroEnd);

  assert.match(hero, /setPendingDemoRequestId\(null\)/);
  assert.match(hero, /setAgency\(\{ \.\.\.EMPTY_AGENCY \}\)/);
  assert.match(hero, /setCreateOpen\(true\)/);
  assert.match(hero, /New agency/);
  assert.doesNotMatch(hero, /create_customer/);

  assert.match(page, /action: 'create_customer'/);
});

test('commercial and operator safety contracts remain untouched', () => {
  assert.match(page, /action: 'update_customer'/);
  assert.match(page, /AgencyActionBar/);
  assert.match(page, /action_surface/);
  assert.match(page, /commercial-control/);
  assert.match(page, /set_customer_service_state/);
  assert.match(page, /set_contract_term/);
});

test('control plane showcase adds premium hierarchy across hero metrics and portfolio', () => {
  assert.match(css, /\.heroKicker\s*\{/);
  assert.match(css, /\.heroPills\s*\{/);
  assert.match(css, /\.heroStatus\s*\{/);
  assert.match(css, /\.heroPrimaryButton\s*\{/);
  assert.match(css, /\.signalPanel\s*\{/);
  assert.match(css, /\.customerCard\s*\{/);
});

test('showcase treatment remains responsive', () => {
  assert.match(
    css,
    /@media \(max-width: 820px\)[\s\S]*\.heroActions/,
  );
  assert.match(
    css,
    /@media \(max-width: 540px\)[\s\S]*\.heroPills/,
  );
});
