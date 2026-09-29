import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929030000_redream_connected_identity_recovery_v1.sql',
  'utf8',
);

const emailGuardMigration = readFileSync(
  'supabase/migrations/20260929052000_redream_provider_contact_suggestion_email_guard_v1.sql',
  'utf8',
);

const providerSync = readFileSync(
  'supabase/functions/redream-provider-sync/index.ts',
  'utf8',
);

const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);

const resolverStyles = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.module.css',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test(
  'provider identity suggestions are unique exact matches only',
  () => {
    assert.match(
      migration,
      /when em\.match_count=1 then 'exact_email'/,
    );
    assert.match(
      migration,
      /when nm\.match_count=1 then 'exact_name'/,
    );
    assert.doesNotMatch(
      migration,
      /similarity\(|levenshtein|fuzzy/i,
    );
  },
);

test(
  'provider suggestions only surface contacts with an email identity',
  () => {
    assert.match(
      emailGuardMigration,
      /lower\(trim\(coalesce\(s\.email,''\)\)\)[\s\S]*is not null/,
    );
    assert.match(
      emailGuardMigration,
      /create or replace function private\.redream_provider_contact_suggestion_rows/,
    );
  },
);

test(
  'provider suggestions never resolve to players',
  () => {
    assert.match(
      migration,
      /coalesce\(p\.person_type,'contact'\)<>'player'/,
    );
  },
);

test(
  'duplicate provider rows collapse to one canonical Network suggestion',
  () => {
    assert.match(
      migration,
      /partition by[\s\S]*r\.provider[\s\S]*r\.matched_person_id::text/,
    );
    assert.match(
      migration,
      /row_rank=1/,
    );
  },
);

test(
  'already confirmed equivalent provider identities stop resurfacing',
  () => {
    assert.match(
      migration,
      /not exists\([\s\S]*provider_contact_sources linked_source/,
    );
    assert.match(
      migration,
      /linked_source\.person_id=d\.matched_person_id/,
    );
  },
);

test(
  'suggestion server contract is service-only and browser wrapper stays tenant resolved',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_provider_contact_suggestions[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*redream_provider_contact_suggestions[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /private\.redream_request_tenant\(\)/,
    );
  },
);

test(
  'legacy email recovery only reopens now-resolvable receipts with no capture',
  () => {
    assert.match(
      migration,
      /redream_provider_contact_person_for_email/,
    );
    assert.match(
      migration,
      /r\.capture_id is null/,
    );
    assert.match(
      migration,
      /r\.person_id is null[\s\S]*r\.person_id=v_person_id/,
    );
    assert.doesNotMatch(
      migration,
      /delete from djm_os\.captures/i,
    );
  },
);

test(
  'legacy email recovery is service-only and audited',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*platform_server_provider_email_reopen_unresolved[\s\S]*authenticated/,
    );
    assert.match(
      migration,
      /platform\.provider\.email\.identity_recovered/,
    );
  },
);

test(
  'provider sync reopens unresolved receipts before normal email commit',
  () => {
    const recovery = providerSync.indexOf(
      '"platform_server_provider_email_reopen_unresolved"',
    );
    const commit = providerSync.indexOf(
      '"platform_server_provider_email_commit"',
    );

    assert.ok(recovery >= 0);
    assert.ok(commit > recovery);
    assert.match(
      providerSync,
      /emails_reopened:/,
    );
  },
);

test(
  'Home loads provider identity suggestions beside Connected Work',
  () => {
    assert.match(
      workspace,
      /redream_provider_contact_suggestions/,
    );
    assert.match(
      workspace,
      /provider_identity_suggestions/,
    );
    assert.match(
      workspace,
      /identityResolutionCount/,
    );
    assert.match(
      workspace,
      /Resolve identities/,
    );
  },
);

test(
  'identity resolver loads both selected chats and safe provider suggestions',
  () => {
    assert.match(
      resolver,
      /redream_messaging_threads/,
    );
    assert.match(
      resolver,
      /redream_provider_contact_suggestions/,
    );
    assert.match(
      resolver,
      /providerSuggestions/,
    );
  },
);

test(
  'selected chat usernames remain explicit human identity decisions',
  () => {
    assert.match(
      resolver,
      /Choose the right identity/,
    );
    assert.match(
      resolver,
      /redream_messaging_thread_bind_contact/,
    );
    assert.doesNotMatch(
      resolver,
      /useEffect[\s\S]{0,400}redream_messaging_thread_bind_(?:contact|player)/,
    );
  },
);

test(
  'provider identity link is always explicitly confirmed by the agent',
  () => {
    assert.match(
      resolver,
      /redream_provider_contact_bind/,
    );
    assert.match(
      resolver,
      /p_person_id:[\s\S]*suggestion\.suggested_person_id/,
    );
    assert.match(
      resolver,
      /className=\{styles\.confirmProvider\}[\s\S]*bindProviderSuggestion\(suggestion\)[\s\S]*Confirm/,
    );
    assert.match(
      resolver,
      /never applies an identity suggestion[\s\S]*automatically/,
    );
  },
);

test(
  'confirmed provider identity immediately requests provider resync',
  () => {
    const bind = resolver.indexOf(
      "'redream_provider_contact_bind'",
    );
    const sync = resolver.indexOf(
      "'redream-provider-sync'",
    );

    assert.ok(bind >= 0);
    assert.ok(sync > bind);
    assert.match(
      resolver,
      /workspace_slug: workspaceSlug/,
    );
  },
);

test(
  'provider sync failure does not erase a successful identity link',
  () => {
    assert.match(
      resolver,
      /The identity is saved, but the provider refresh did not complete/,
    );
    assert.match(
      resolver,
      /setProviderSuggestions[\s\S]*syncWarning/,
    );
  },
);

test(
  'provider identity suggestions never auto-create a person or send externally',
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
      /send_message|send_email|whatsapp_send|instagram_send/i,
    );
    assert.match(
      resolver,
      /Nothing here sends an external message/,
    );
  },
);

test(
  'provider suggestions show source identity, canonical destination and match basis',
  () => {
    assert.match(
      resolver,
      /EXACT EMAIL/,
    );
    assert.match(
      resolver,
      /EXACT NAME/,
    );
    assert.match(
      resolver,
      /suggested_person_name/,
    );
    assert.match(
      resolver,
      /suggested_organisation_name/,
    );
  },
);

test(
  'identity resolver remains mobile and safe-area aware',
  () => {
    assert.match(
      resolverStyles,
      /@media \(max-width: 680px\)/,
    );
    assert.match(
      resolverStyles,
      /env\(safe-area-inset-bottom\)/,
    );
    assert.match(
      resolverStyles,
      /\.providerSuggestion/,
    );
  },
);
