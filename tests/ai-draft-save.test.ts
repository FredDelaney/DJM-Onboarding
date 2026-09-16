import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { saveAiDraft } from '../lib/ai-draft-save.ts';

const draft = {
  id: 'one-capture-id',
  workspaceSlug: 'northstar',
  blob: new Blob(['voice']),
};

test('storage failure still permits a successful online upload', async () => {
  const result = await saveAiDraft(draft, {
    online: () => true,
    saveLocal: async () => {
      throw Error('quota');
    },
    upload: async received => {
      assert.equal(received, draft);
    },
  });

  assert.equal(result.state, 'uploaded');
});

test('failed upload is safe to queue only after local persistence succeeds', async () => {
  const result = await saveAiDraft(draft, {
    online: () => true,
    saveLocal: async () => {},
    upload: async () => {
      throw Error('network');
    },
  });

  assert.equal(result.state, 'queued');
});

test('combined failure retains the exact voice draft for a same-ID retry', async () => {
  const options = {
    online: () => true,
    saveLocal: async () => {
      throw Error('quota');
    },
    upload: async () => {
      throw Error('network');
    },
  };

  assert.equal(
    (await saveAiDraft(draft, options)).state,
    'unsaved',
  );

  const retry = await saveAiDraft(draft, {
    ...options,
    upload: async received => {
      assert.equal(received.id, 'one-capture-id');
      assert.equal(received.workspaceSlug, 'northstar');
      assert.equal(await received.blob.text(), 'voice');
    },
  });

  assert.equal(retry.state, 'uploaded');
});

test('stale offline browser hint never blocks a reachable upload', async () => {
  let uploadAttempted = false;

  const result = await saveAiDraft(draft, {
    online: () => false,
    saveLocal: async () => {},
    upload: async received => {
      uploadAttempted = true;
      assert.equal(received.id, draft.id);
    },
  });

  assert.equal(uploadAttempted, true);
  assert.equal(result.state, 'uploaded');
});

test('real upload failure remains safely queued even when browser reports offline', async () => {
  let uploadAttempted = false;

  const result = await saveAiDraft(draft, {
    online: () => false,
    saveLocal: async () => {},
    upload: async () => {
      uploadAttempted = true;
      throw Error('network');
    },
  });

  assert.equal(uploadAttempted, true);
  assert.equal(result.state, 'queued');
});

test('offline hint cannot claim a draft is saved when both persistence paths fail', async () => {
  const result = await saveAiDraft(draft, {
    online: () => false,
    saveLocal: async () => {
      throw Error('quota');
    },
    upload: async () => {
      throw Error('network');
    },
  });

  assert.equal(result.state, 'unsaved');
});

test('background queue retry is not hard-gated by navigator.onLine', () => {
  const source = readFileSync(
    new URL('../components/AiCapture.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(
    source.includes(
      "if (typeof navigator !== 'undefined' && !navigator.onLine) return;",
    ),
    false,
  );

  assert.equal(
    source.includes(
      'flushAiQueue(listPendingAiCaptures, (item) => uploadPending(item, false), () => navigator.onLine)',
    ),
    false,
  );
});
