import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260928234500_redream_shared_deal_owner_visibility_v1.sql',
  'utf8',
);

const chip = readFileSync(
  'components/AgencyOwnershipChip.tsx',
  'utf8',
);

const chipStyles = readFileSync(
  'components/AgencyOwnershipChip.module.css',
  'utf8',
);

const operating = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const network = readFileSync(
  'components/AgencyNetworkWorkspace.tsx',
  'utf8',
);
test(
  'shared deal portfolio exposes canonical active staff ownership',
  () => {
    assert.match(
      migration,
      /'owner_user_id'/,
    );
    assert.match(
      migration,
      /'owner_name'/,
    );
    assert.match(
      migration,
      /'owner_role_title'/,
    );
    assert.match(
      migration,
      /'owner_state'/,
    );
    assert.match(
      migration,
      /membership\.role in \([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'agent'[\s\S]*'operations'[\s\S]*'scout'/,
    );
  },
);

test(
  'deal ownership distinguishes unassigned from stale staff ownership',
  () => {
    assert.match(
      migration,
      /'unassigned'/,
    );
    assert.match(
      migration,
      /'inactive_or_invalid_staff'/,
    );
    assert.match(
      migration,
      /'active_staff'/,
    );
    assert.match(
      operating,
      /Needs reassignment/,
    );
  },
);
test(
  'one shared ownership chip is used in Opportunities and Network',
  () => {
    assert.match(
      operating,
      /AgencyOwnershipChip/,
    );
    assert.match(
      operating,
      /label="Deal owner"/,
    );
    assert.match(
      network,
      /AgencyOwnershipChip/,
    );
    assert.match(
      network,
      /label="Relationship owner"/,
    );
  },
);

test(
  'ownership gaps remain visible rather than silently disappearing',
  () => {
    assert.match(
      chip,
      /emptyText = 'Unassigned'/,
    );
    assert.match(
      chip,
      /missing \|\| attention/,
    );
    assert.match(
      chipStyles,
      /\.attention/,
    );
  },
);
test(
  'ownership remains factual rather than a performance judgement',
  () => {
    assert.match(
      migration,
      /It is not a performance score/,
    );
    assert.doesNotMatch(
      chip,
      /performance|rank|score/i,
    );
  },
);

test(
  'ownership chip stays compact and mobile safe',
  () => {
    assert.match(
      chipStyles,
      /width: fit-content/,
    );
    assert.match(
      chipStyles,
      /max-width: 100%/,
    );
    assert.match(
      chipStyles,
      /text-overflow: ellipsis/,
    );
  },
);
