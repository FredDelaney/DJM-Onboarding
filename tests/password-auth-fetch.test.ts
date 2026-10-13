import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordAuthFetch, authEntryErrorMessage } from '../lib/password-auth-fetch.ts';

test('a stalled password request is aborted instead of leaving sign-in pending', async () => {
  let aborted = false;
  const transport: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(init.signal?.reason); });
  });
  await assert.rejects(createPasswordAuthFetch(transport, 15)('https://example.test/auth/v1/token?grant_type=password', {method:'POST'}), /took too long/);
  assert.equal(aborted, true);
});

test('a successful password response keeps its status, headers and body', async () => {
  const transport: typeof fetch = async () => new Response('{"ok":true}', {status:200,headers:{'content-type':'application/json'}});
  const response = await createPasswordAuthFetch(transport)('https://example.test/auth/v1/token?grant_type=password', {method:'POST'});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/json');
  assert.deepEqual(await response.json(),{ok:true});
});

test('refresh, passkeys and application reads keep their existing transport', async () => {
  const response = new Response('{}');
  const transport: typeof fetch = async () => response;
  for (const path of ['/auth/v1/token?grant_type=refresh_token','/auth/v1/passkeys/authenticate','/rest/v1/players']) {
    assert.equal(await createPasswordAuthFetch(transport, 15)('https://example.test'+path),response);
  }
});

test('connection failures explain recovery while credential and membership errors remain specific', () => {
  for (const error of [new TypeError('Load failed'),new TypeError('Failed to fetch'),{name:'AuthRetryableFetchError',message:'fetch failed'}, {status:502,message:'Bad Gateway'}]) {
    assert.match(authEntryErrorMessage(error), /connection.*try again/i);
  }
  assert.equal(authEntryErrorMessage(new Error('Invalid login credentials')),'Invalid login credentials');
  assert.equal(authEntryErrorMessage(new Error('No linked workspace is available.')),'No linked workspace is available.');
});
