import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.module.css',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test(
  'Home opens a focused connected identity resolver instead of account settings',
  () => {
    assert.match(
      workspace,
      /connectedIdentityResolverOpen/,
    );

    assert.match(
      workspace,
      /onResolveConnectedIdentity/,
    );

    assert.match(
      workspace,
      /AgencyConnectedIdentityResolverDrawer/,
    );

    assert.match(
      workspace,
      /setConnectionsOpen\(true\)/,
    );
  },
);

test(
  'resolver reads only personal messaging threads and shared Network contacts through existing RPCs',
  () => {
    assert.match(
      resolver,
      /redream_messaging_threads/,
    );

    assert.match(
      resolver,
      /p_provider: 'instagram'/,
    );

    assert.match(
      resolver,
      /p_provider: 'whatsapp'/,
    );

    assert.match(
      resolver,
      /redream_autopilot_relationships/,
    );

    assert.match(
      resolver,
      /p_contact_limit: 500/,
    );
  },
);

test(
  'resolver shows only selected chats that still need a canonical identity',
  () => {
    assert.match(
      resolver,
      /thread\.is_selected[\s\S]*!thread\.bound_person_id/,
    );
  },
);

test(
  'linking is explicit and reuses the guarded thread bind RPC',
  () => {
    assert.match(
      resolver,
      /redream_messaging_thread_bind_contact/,
    );

    assert.match(
      resolver,
      /p_external_thread_id:[\s\S]*activeThread\.external_thread_id/,
    );

    assert.match(
      resolver,
      /p_person_id: contact\.person_id/,
    );
  },
);

test(
  'resolver never auto-creates identity or sends an external message',
  () => {
    assert.match(
      resolver,
      /never applies an identity suggestion automatically/,
    );

    assert.match(
      resolver,
      /new Network[\s\S]*created only when you choose Create and link/,
    );

    assert.doesNotMatch(
      resolver,
      /send_message|send_email|instagram_send|whatsapp_send/i,
    );

    assert.match(
      resolver,
      /Nothing here sends an external message/,
    );
  },
);

test(
  'successful links refresh canonical Home data',
  () => {
    assert.match(
      workspace,
      /onResolved=\{async \(\) => \{[\s\S]*await loadView\(\)/,
    );
  },
);

test(
  'resolver provides inline creation and a full Network fallback when no contact matches',
  () => {
    assert.match(
      resolver,
      /No existing Network person matches this search/,
    );

    assert.match(
      resolver,
      /Create person and link this chat/,
    );

    assert.match(
      resolver,
      /Open full Network/,
    );

    assert.match(
      workspace,
      /networkHref=\{\x60\$\{basePath\}\?view=network\x60\}/,
    );
  },
);

test(
  'resolver is safe-area aware and mobile-first',
  () => {
    assert.match(
      styles,
      /env\(safe-area-inset-bottom\)/,
    );

    assert.match(
      styles,
      /@media \(max-width: 680px\)/,
    );

    assert.match(
      styles,
      /88dvh/,
    );
  },
);
