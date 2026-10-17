import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {scheduleWorkspaceWarming} from '../lib/workspace-prefetch.ts';

function browser(t: TestContext, settings: {saveData?: boolean; effectiveType?: string; hidden?: boolean; online?: boolean; idle?: boolean} = {}) {
  let id = 0;
  const timers = new Map<number, () => void>(), idle = new Map<number, () => void>();
  const connection = Object.assign(new EventTarget(), {saveData: settings.saveData ?? false, effectiveType: settings.effectiveType ?? '4g'});
  const document = Object.assign(new EventTarget(), {hidden: settings.hidden ?? false});
  const navigator = {connection, onLine: settings.online ?? true};
  const window = Object.assign(new EventTarget(), {
    setTimeout(fn: () => void) {timers.set(++id, fn); return id;},
    clearTimeout(key: number) {timers.delete(key);},
    ...(settings.idle === false ? {} : {
      requestIdleCallback(fn: () => void) {idle.set(++id, fn); return id;},
      cancelIdleCallback(key: number) {idle.delete(key);},
    }),
  });
  const cleanup: Array<() => void> = [];
  t.after(() => {for (const fn of cleanup.reverse()) fn();});
  for (const [name, value] of Object.entries({window, document, navigator})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    cleanup.push(() => {if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name);});
  }
  const fire = async (map: Map<number, () => void>) => {const callbacks = [...map.values()]; map.clear(); callbacks.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve();};
  return {connection, document, navigator, window, timers, idle, cleanup: (fn: () => void) => cleanup.push(fn), delay: () => fire(timers), ready: () => fire(idle)};
}

test('background reads wait for idle time after the initial quiet period', async t => {
  const env = browser(t); let reads = 0;
  const stop = scheduleWorkspaceWarming(() => {reads++;}); env.cleanup(stop);
  assert.equal(reads, 0); await env.delay(); assert.equal(reads, 0);
  await env.ready(); assert.equal(reads, 1);
  env.document.dispatchEvent(new Event('visibilitychange')); await env.delay(); await env.ready(); assert.equal(reads, 1, 'The view warms only once');
});

for (const settings of [{saveData: true}, {effectiveType: 'slow-2g'}, {effectiveType: '2g'}, {effectiveType: '3g'}, {hidden: true}, {online: false}]) {
  test('no speculative reads while limited: ' + JSON.stringify(settings), async t => {
    const env = browser(t, settings); let reads = 0;
    const stop = scheduleWorkspaceWarming(() => {reads++;}); env.cleanup(stop);
    await env.delay(); await env.ready(); assert.equal(reads, 0);
    env.connection.saveData = false; env.connection.effectiveType = '4g'; env.document.hidden = false; env.navigator.onLine = true;
    env.connection.dispatchEvent(new Event('change')); await env.delay(); await env.ready(); assert.equal(reads, 1, 'Warming resumes only once conditions allow it');
  });
}

test('a connection change cancels queued work and stops later batches', async t => {
  const env = browser(t); let reads = 0, canContinue = () => true;
  const stop = scheduleWorkspaceWarming(allowed => {reads++; canContinue = allowed;}); env.cleanup(stop);
  await env.delay(); env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
  await env.ready(); assert.equal(reads, 0);
  env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange')); await env.delay(); await env.ready(); assert.equal(reads, 1);
  env.connection.saveData = true; assert.equal(canContinue(), false, 'Already-started work must not begin later batches on a limited connection');
});

test('unmount cancels idle work and ignores an already-queued callback', async t => {
  const env = browser(t); let reads = 0;
  const stop = scheduleWorkspaceWarming(() => {reads++;}); await env.delay();
  const late = [...env.idle.values()][0]; assert.ok(late); stop(); late(); await Promise.resolve(); await Promise.resolve();
  env.connection.dispatchEvent(new Event('change')); await env.delay(); await env.ready(); assert.equal(reads, 0);
});

test('browsers without idle callbacks still defer optional reads', async t => {
  const env = browser(t, {idle: false}); let reads = 0;
  const stop = scheduleWorkspaceWarming(() => {reads++;}); env.cleanup(stop);
  assert.equal(reads, 0); await env.delay(); assert.equal(reads, 1);
});
