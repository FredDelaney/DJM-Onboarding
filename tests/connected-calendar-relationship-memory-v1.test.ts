import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  test,
} from 'node:test';

const migration =
  readFileSync(
    'supabase/migrations/20260928210000_redream_connected_calendar_relationship_memory_v1.sql',
    'utf8',
  );

const component =
  readFileSync(
    'components/AgencyRelationshipMemory.tsx',
    'utf8',
  );

test(
  'relationship memory includes upcoming and recent linked calendar events',
  () => {
    assert.match(
      migration,
      /upcoming_meetings/,
    );

    assert.match(
      migration,
      /recent_calendar_events/,
    );

    assert.match(
      migration,
      /person_id = p_person_id/,
    );

    assert.match(
      migration,
      /status = 'scheduled'/,
    );

    assert.match(
      migration,
      /status <> 'cancelled'/,
    );
  },
);

test(
  'calendar does not redefine meaningful relationship recency',
  () => {
    const meaningfulSection =
      migration.slice(
        migration.indexOf('select max(x.occurred_at)'),
        migration.indexOf('v_state := case'),
      );

    assert.doesNotMatch(
      meaningfulSection,
      /djm_os\.meetings/,
    );
  },
);

test(
  'calendar truth contract does not claim attendance',
  () => {
    assert.match(
      migration,
      /A past calendar event does not prove that the meeting happened or that anyone attended/,
    );
  },
);

test(
  'relationship memory UI shows one compact Calendar block',
  () => {
    assert.match(
      component,
      /title="Calendar"/,
    );

    assert.match(
      component,
      /Upcoming/,
    );

    assert.match(
      component,
      /Calendar history/,
    );

    assert.match(
      component,
      /No linked calendar events are recorded/,
    );
  },
);
