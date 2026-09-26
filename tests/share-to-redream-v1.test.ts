import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

import {
  readReDreamShare,
} from '../lib/redream-share.ts';

test(
  'shared title text and link become one reviewable Tell ReDream draft',
  () => {
    const params =
      new URLSearchParams({
        share_title:
          'Club update',
        share_text:
          'Spoke with the sporting director. Follow up Monday.',
        share_url:
          'https://example.com/player/10',
      });

    const shared =
      readReDreamShare(
        params,
      );

    assert.equal(
      shared.hasContent,
      true,
    );
    assert.match(
      shared.content,
      /Club update/,
    );
    assert.match(
      shared.content,
      /Follow up Monday/,
    );
    assert.match(
      shared.content,
      /https:\/\/example\.com\/player\/10/,
    );
  },
);

test(
  'share payload rejects unsafe URL schemes and clamps oversized text',
  () => {
    const params =
      new URLSearchParams({
        share_text:
          'x'.repeat(8000),
        share_url:
          'javascript:alert(1)',
      });

    const shared =
      readReDreamShare(
        params,
      );

    assert.equal(
      shared.url,
      '',
    );
    assert.equal(
      shared.text.length,
      5000,
    );
    assert.ok(
      shared.content.length <=
        7000,
    );
  },
);

test(
  'workspace PWA registers a text and link share target without silent mutation',
  () => {
    const manifest =
      readFileSync(
        'app/workspace-manifest.webmanifest/route.ts',
        'utf8',
      );

    assert.match(
      manifest,
      /share_target/,
    );
    assert.match(
      manifest,
      /action: '\/share-to-redream'/,
    );
    assert.match(
      manifest,
      /method: 'GET'/,
    );
    assert.match(
      manifest,
      /title: 'share_title'/,
    );
    assert.match(
      manifest,
      /text: 'share_text'/,
    );
    assert.match(
      manifest,
      /url: 'share_url'/,
    );
  },
);

test(
  'share receiver resolves the host tenant before opening Capture',
  () => {
    const route =
      readFileSync(
        'app/share-to-redream/route.ts',
        'utf8',
      );

    assert.match(
      route,
      /resolveTenantRuntime/,
    );
    assert.match(
      route,
      /runtime\.resolved/,
    );
    assert.match(
      route,
      /encodeURIComponent\(runtime\.slug\)/,
    );
    assert.match(
      route,
      /Response\.redirect/,
    );
    assert.match(
      route,
      /303/,
    );
  },
);

test(
  'shared content is prefilled into the existing capture engine for review',
  () => {
    const full =
      readFileSync(
        'components/AiFullPage.tsx',
        'utf8',
      );
    const capture =
      readFileSync(
        'components/AiCapture.tsx',
        'utf8',
      );

    assert.match(
      full,
      /readReDreamShare/,
    );
    assert.match(
      full,
      /capture_origin/,
    );
    assert.match(
      full,
      /'share_target'/,
    );
    assert.match(
      full,
      /initialText=/,
    );

    assert.match(
      capture,
      /initialText = ''/,
    );
    assert.match(
      capture,
      /setMode\('text'\)/,
    );
    assert.match(
      capture,
      /setText\(sharedText\)/,
    );

    assert.doesNotMatch(
      full,
      /\.from\(/,
    );
    assert.doesNotMatch(
      full,
      /supabase\./,
    );
  },
);
