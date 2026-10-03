import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const final = css.slice(css.lastIndexOf('ReDream authenticated control system v2'));
const componentFiles = readdirSync('components').filter((name) => /^Agency.*\.tsx$/.test(name));
const allAgency = componentFiles.map((name) => readFileSync(`components/${name}`,'utf8')).join('\n');

test('authenticated control system defines five semantic roles', () => {
  for (const role of ['primary','secondary','tertiary','icon','nav']) {
    assert.match(final, new RegExp(`data-ui-button=\\"${role}\\"`));
  }
});

test('primary and secondary mobile controls share geometry and wrap full labels', () => {
  assert.match(final, /data-ui-button="primary"[\s\S]*data-ui-button="secondary"[\s\S]*flex-direction: row !important/);
  assert.match(final, /min-height: var\(--ui-control-h\) !important/);
  assert.match(final, /border-radius: var\(--ui-control-radius\) !important/);
  assert.match(final, /white-space: normal !important/);
});

test('icon and nav controls are mathematically centred', () => {
  assert.match(final, /data-ui-button="icon"[\s\S]*display: grid !important[\s\S]*place-items: center !important/);
  assert.match(final, /data-ui-button="nav"[\s\S]*display: grid !important[\s\S]*place-items: center !important/);
});

test('semantic controls are used broadly across authenticated Agency components', () => {
  const count = (allAgency.match(/data-ui-button=/g) || []).length;
  assert.ok(count >= 130, `expected at least 130 semantic controls, saw ${count}`);
});

test('control palette standardises light and inverse surfaces', () => {
  const palette = css.slice(css.lastIndexOf('ReDream authenticated control palette v3'));
  assert.match(palette, /data-ui-button="primary"[^\n]*not\(\[data-ui-tone="inverse"\]\)[\s\S]*background: #0b2d49 !important/);
  assert.match(palette, /data-ui-button="secondary"[^\n]*not\(\[data-ui-tone="inverse"\]\)[\s\S]*background: #f1f4f6 !important/);
  assert.match(palette, /data-ui-tone="inverse"\]\[data-ui-button="primary"\][\s\S]*background: #fff !important/);
  assert.match(palette, /data-ui-tone="inverse"\]\[data-ui-button="secondary"\][\s\S]*background: rgba\(255,255,255,.08\) !important/);
});

test('controls expose consistent focus and pressed states', () => {
  const palette = css.slice(css.lastIndexOf('ReDream authenticated control palette v3'));
  assert.match(palette, /data-ui-button\]:focus-visible[\s\S]*outline: 3px solid/);
  assert.match(palette, /data-ui-button\]:active:not\(:disabled\)[\s\S]*translateY\(1px\)/);
});

test('recognised standard Agency button classes cannot bypass the shared control system', () => {
  const recognised = new Set([
    'primary','primaryAction','primaryButton','save','createContactStart','createContactSubmit',
    'createContactConfirm','confirmProvider','confirm','outcomeButton','heroAction','fallback',
    'shareFollowUpButton','addEntityButton','createButton','firstValueHandoffAction',
    'secondary','secondaryAction','secondaryButton','quietButton','shareUtilityButton','regenerate',
    'retry','createContactCancel','back','refresh','textButton','detailsToggle','createDetailsToggle',
    'clearFocus','close','closeButton','iconButton','action','actionAttention',
  ]);
  for (const name of componentFiles) {
    const source = readFileSync(`components/${name}`,'utf8');
    for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
      const tag = match[0];
      const classMatch = tag.match(/className=\{\s*styles\.([A-Za-z0-9_]+)\s*\}/);
      if (!classMatch || !recognised.has(classMatch[1])) continue;
      assert.match(tag, /data-ui-button=/, `${name} ${classMatch[1]} bypassed shared controls`);
    }
  }
});

test('dark hero controls explicitly opt into inverse tone', () => {
  const profile = readFileSync('components/AgencyPlayerProfile.tsx','utf8');
  const pursuit = readFileSync('components/AgencyPursuitRoom.tsx','utf8');
  assert.match(profile, /data-ui-button="primary" data-ui-tone="inverse"/);
  assert.match(profile, /data-ui-button="secondary" data-ui-tone="inverse"/);
  assert.match(pursuit, /data-ui-button="primary" data-ui-tone="inverse"[\s\S]*heroAction/);
});

test('Network Open club is tertiary navigation rather than a competing boxed CTA', () => {
  const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');
  const networkCss = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
  assert.match(network, /data-ui-button="tertiary"[\s\S]*className=\{styles\.secondaryAction\}[\s\S]*Open club/);
  const finalNetwork = networkCss.slice(networkCss.lastIndexOf('Network tertiary club navigation v6'));
  assert.match(finalNetwork, /background: transparent !important/);
  assert.match(finalNetwork, /border: 0 !important/);
});

test('contextual create controls stay secondary while final submissions stay primary', () => {
  const operating = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
  const players = readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
  assert.match(operating, /data-ui-button="secondary"[\s\S]{0,120}className=\{styles\.createButton\}/);
  assert.match(players, /data-ui-button="secondary"[\s\S]{0,120}openRecruitmentCreate/);
  assert.match(players, /data-ui-button="primary"[\s\S]{0,500}Add target/);
});


test('Network contextual Add contact/club stays secondary', () => {
  const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');
  assert.match(network, /data-ui-button="secondary"[\s\S]*className=\{styles\.addEntityButton\}/);
});
