import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const styles = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

const homeStart = workspace.indexOf('function Home(');
const homeEnd = workspace.indexOf(
  'function Players(',
  homeStart,
);
const home = workspace.slice(homeStart, homeEnd);

test(
  'Home headline counts the unified human decision queue',
  () => {
    const countIndex = home.indexOf('const needsYouCount =');
    const priorityIndex = home.indexOf('priority.length', countIndex);
    const meetingIndex = home.indexOf(
      'meetingAftercareItems.length',
      countIndex,
    );
    const identityIndex = home.indexOf(
      'identityResolutionCount > 0',
      countIndex,
    );

    assert.ok(countIndex >= 0);
    assert.ok(priorityIndex > countIndex);
    assert.ok(meetingIndex > priorityIndex);
    assert.ok(identityIndex > meetingIndex);
    assert.ok(home.includes('{needsYouCount'));
    assert.ok(home.includes('things need'));
  },
);

test(
  'meeting outcomes and connected identity confirmation live in Needs you',
  () => {
    const needsIndex = home.indexOf('What needs your attention');
    const meetingIndex = home.indexOf('MEETING FOLLOW-UP');
    const identityIndex = home.indexOf('<span>IDENTITY</span>');
    const handledIndex = home.indexOf('REDREAM HANDLED');

    assert.ok(needsIndex >= 0);
    assert.ok(meetingIndex > needsIndex);
    assert.ok(identityIndex > needsIndex);
    assert.ok(handledIndex > meetingIndex);
    assert.ok(handledIndex > identityIndex);
    assert.ok(home.includes('Record outcome'));
    assert.ok(home.includes('Resolve identities'));
  },
);

test(
  'ReDream handled is activity context rather than a second urgent queue',
  () => {
    const start = home.indexOf('REDREAM HANDLED');
    const end = home.indexOf('AGENCY PULSE', start);
    const handled = home.slice(start, end);

    assert.ok(start >= 0);
    assert.ok(end > start);
    assert.ok(handled.includes('What changed around you'));
    assert.ok(
      handled.includes('recentConnected.slice(0, 3).map'),
    );
    assert.ok(
      handled.includes('connectedMeetings.slice(0, 2).map'),
    );
    assert.equal(handled.includes('MEETING FOLLOW-UP'), false);
    assert.equal(handled.includes('Resolve identities'), false);
  },
);

test(
  'Today stays intentionally small',
  () => {
    const todayIndex = home.indexOf('<p className={styles.eyebrow}>TODAY</p>');
    const handledIndex = home.indexOf('REDREAM HANDLED', todayIndex);
    const today = home.slice(todayIndex, handledIndex);

    assert.ok(todayIndex >= 0);
    assert.ok(today.includes('.slice(0, 3)'));
    assert.ok(today.includes('href="?view=calendar"'));
  },
);

test(
  'Players Opportunities and Business collapse into one compact agency pulse',
  () => {
    assert.ok(home.includes('AGENCY PULSE'));
    assert.ok(home.includes('homePulseGrid'));
    assert.ok(home.includes('href="?view=players"'));
    assert.ok(home.includes('href="?view=opportunities"'));
    assert.ok(home.includes('href="?view=business"'));
    assert.equal(home.includes('OPPORTUNITIES MOVING'), false);
    assert.equal(home.includes('PLAYERS NEEDING ATTENTION'), false);
    assert.equal(home.includes('homeSupportGrid'), false);
    assert.equal(home.includes('homeBusinessStrip'), false);
  },
);

test(
  'Home pulse is compact and one-column on phones',
  () => {
    const pulseGrid = styles.indexOf('.homePulseGrid {');
    const pulseCard = styles.indexOf('.homePulseCard {');
    const mobilePulse = styles.lastIndexOf('.homePulseGrid {');
    const mobile = styles.lastIndexOf(
      '@media (max-width: 680px)',
      mobilePulse,
    );

    assert.ok(pulseGrid >= 0);
    assert.ok(
      styles
        .slice(pulseGrid, pulseGrid + 220)
        .includes('repeat(auto-fit, minmax(220px, 1fr))'),
    );
    assert.ok(pulseCard >= 0);
    assert.ok(
      styles
        .slice(pulseCard, pulseCard + 240)
        .includes('min-height: 72px'),
    );
    assert.ok(mobile >= 0);
    assert.ok(mobilePulse > mobile);
    assert.ok(
      styles
        .slice(mobilePulse, mobilePulse + 140)
        .includes('grid-template-columns: 1fr'),
    );
  },
);
