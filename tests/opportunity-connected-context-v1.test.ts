import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260929002000_redream_opportunity_connected_context_v1.sql',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const opportunities = readFileSync(
  'components/AgencyOpportunitiesWorkspace.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyOpportunitiesWorkspace.module.css',
  'utf8',
);

test(
  'Opportunities loads connected context through a tenant-resolved RPC',
  () => {
    assert.match(
      workspace,
      /redream_opportunity_connected_context/,
    );

    assert.match(
      migration,
      /private\.user_has_staff_tenant_access/,
    );

    assert.match(
      migration,
      /platform_server_opportunity_connected_context/,
    );
  },
);

test(
  'club needs and routes anchor communication to the recorded need source person',
  () => {
    assert.match(
      migration,
      /cn\.source_person_id/,
    );

    assert.match(
      migration,
      /'scope','need_source_contact'/,
    );

    assert.match(
      migration,
      /Player-route communication reflects the source contact for the underlying club need, not proof that the player was discussed/,
    );
  },
);

test(
  'deal communication uses deal source first and club-need source only as fallback',
  () => {
    assert.match(
      migration,
      /coalesce\([\s\S]*d\.source_person_id,[\s\S]*cn\.source_person_id/,
    );

    assert.match(
      migration,
      /'deal_source_contact'/,
    );
  },
);

test(
  'connected context exposes summaries but not raw message bodies',
  () => {
    assert.match(
      migration,
      /'summary',i\.summary/,
    );

    assert.doesNotMatch(
      migration,
      /'raw_text'/,
    );
  },
);

test(
  'communication and follow-up ownership distinguish active staff from stale ownership',
  () => {
    assert.match(
      migration,
      /'owner_state'/,
    );

    assert.match(
      migration,
      /'active_staff'/,
    );

    assert.match(
      migration,
      /'inactive_or_invalid_staff'/,
    );

    assert.match(
      opportunities,
      /Needs reassignment/,
    );
  },
);

test(
  'connected context is visible inside all three Opportunity modes',
  () => {
    assert.match(
      opportunities,
      /needConnected\.get/,
    );

    assert.match(
      opportunities,
      /routeConnected\.get/,
    );

    assert.match(
      opportunities,
      /dealConnected\.get/,
    );

    assert.match(
      opportunities,
      /DEAL CONTACT/,
    );

    assert.match(
      opportunities,
      /NEED SOURCE/,
    );
  },
);

test(
  'connected opportunity context stays factual and never sends externally',
  () => {
    assert.match(
      migration,
      /Connected context never sends an external message automatically/,
    );

    assert.match(
      migration,
      /Communication owner and opportunity owner remain separate recorded facts/,
    );
  },
);

test(
  'connected opportunity context remains compact on mobile',
  () => {
    assert.match(
      styles,
      /\.connectedContext/,
    );

    assert.match(
      styles,
      /@media \(max-width: 680px\)/,
    );

    assert.match(
      styles,
      /grid-column: 1 \/ -1/,
    );
  },
);
