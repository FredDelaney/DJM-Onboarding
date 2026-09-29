import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929070113_redream_connected_chat_contact_create_v1.sql',
  'utf8',
);

const resolver = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyConnectedIdentityResolverDrawer.module.css',
  'utf8',
);

test(
  'create-and-bind is one authenticated tenant-scoped operation',
  () => {
    assert.match(
      migration,
      /redream_messaging_thread_create_contact_and_bind/,
    );
    assert.match(
      migration,
      /v_tenant uuid:=private\.redream_request_tenant\(\)/,
    );
    assert.match(
      migration,
      /v_user uuid:=auth\.uid\(\)/,
    );
    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );
  },
);
test(
  'only the signed-in agents selected unresolved thread can be mutated',
  () => {
    assert.match(
      migration,
      /t\.tenant_id=v_tenant/,
    );
    assert.match(
      migration,
      /t\.user_id=v_user/,
    );
    assert.match(
      migration,
      /t\.is_selected=true/,
    );
    assert.match(
      migration,
      /v_thread\.bound_person_id is not null[\s\S]*v_thread\.bound_player_id is not null/,
    );
    assert.match(
      migration,
      /thread_identity_already_resolved/,
    );
  },
);

test(
  'same-name creation is serialised and fails toward the existing-person picker',
  () => {
    assert.match(
      migration,
      /pg_advisory_xact_lock/,
    );
    assert.match(
      migration,
      /lower\(trim\(p\.full_name\)\)=lower\(v_name\)/,
    );
    assert.match(
      migration,
      /network_person_already_exists/,
    );
    assert.match(
      resolver,
      /setSearch\(existingName\)/,
    );
    assert.match(
      resolver,
      /Choose that existing person instead of creating a duplicate/,
    );
  },
);
test(
  'new contact does not invent relationship strength',
  () => {
    assert.match(
      migration,
      /insert into djm_os\.relationships/,
    );
    assert.match(
      migration,
      /v_person_id,[\s\S]*null,[\s\S]*now\(\)/,
    );
    assert.doesNotMatch(
      migration,
      /v_person_id,[\s\S]*20,[\s\S]*now\(\)/,
    );
  },
);

test(
  'instagram handle is copied only when the selected label is a valid handle',
  () => {
    assert.match(
      migration,
      /v_provider='instagram'/,
    );
    assert.match(
      migration,
      /\^\[a-z0-9\._\]\{1,30\}\$/,
    );
    assert.match(
      migration,
      /https:\/\/www\.instagram\.com\//,
    );
    assert.match(
      migration,
      /v_instagram_handle:=null/,
    );
  },
);

test(
  'role requires a club so canonical employment data is not silently dropped',
  () => {
    assert.match(
      migration,
      /v_role_title is not null and v_club_name is null/,
    );
    assert.match(
      migration,
      /club_required_for_role/,
    );
    assert.match(
      resolver,
      /newContact\.club_name\.trim\(\) \? \(/,
    );
  },
);
test(
  'create and bind writes both contact and messaging provenance',
  () => {
    assert.match(
      migration,
      /'CONTACT_CREATED'/,
    );
    assert.match(
      migration,
      /'MESSAGING_THREAD_CONTACT_BOUND'/,
    );
    assert.match(
      migration,
      /'created_from_thread',true/,
    );
    assert.match(
      migration,
      /'external_action',false/,
    );
  },
);

test(
  'browser access is explicit and anonymous access is revoked',
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*from[\s\S]*public,[\s\S]*anon/,
    );
    assert.match(
      migration,
      /grant execute on function[\s\S]*to authenticated/,
    );
  },
);

test(
  'identity resolver creates and binds without leaving the workflow',
  () => {
    assert.match(
      resolver,
      /redream_messaging_thread_create_contact_and_bind/,
    );
    assert.match(
      resolver,
      /Create person and link this chat/,
    );
    assert.match(
      resolver,
      /Create and link/,
    );
    assert.match(
      resolver,
      /Open full Network/,
    );
  },
);

test(
  'inline contact creation is explicit and never sends externally',
  () => {
    assert.match(
      resolver,
      /Full name \*/,
    );
    assert.match(
      resolver,
      /Nothing is sent externally/,
    );
    assert.doesNotMatch(
      resolver,
      /send_message|send_email|instagram_send|whatsapp_send/i,
    );
  },
);

test(
  'inline create form is safe on iPhone',
  () => {
    assert.match(
      styles,
      /\.createContactForm input[\s\S]*font-size: 16px/,
    );
    assert.match(
      styles,
      /\.createContactConfirm[\s\S]*min-height: 44px/,
    );
  },
);
