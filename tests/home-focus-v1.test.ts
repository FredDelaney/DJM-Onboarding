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
const homeEnd = workspace.indexOf('function Players(', homeStart);
const home = workspace.slice(homeStart, homeEnd);

test('Home headline counts only real daily agent decisions', () => {
  const countIndex = home.indexOf('const needsYouCount =');
  const countBlock = home.slice(countIndex, countIndex + 180);

  assert.ok(countIndex >= 0);
  assert.ok(countBlock.includes('priority.length'));
  assert.ok(countBlock.includes('meetingAftercareItems.length'));
  assert.equal(countBlock.includes('identityResolution'), false);
  assert.ok(home.includes('{needsYouCount'));
  assert.ok(home.includes('things need'));
});

test('Needs you shows only three actions until the agent asks for more', () => {
  assert.match(home, /priority\.slice\(0, 3\)/);
  assert.match(home, /3 - visiblePriority\.length/);
  assert.match(home, /meetingAftercareItems\.slice\(0, remainingAttentionSlots\)/);
  assert.match(home, /needsYouCount > 3/);
  assert.match(home, /<h2>Needs attention<\/h2>/);
  assert.match(home, /actionFor\(command\)/);
  assert.match(home, /Record outcome/);
  assert.doesNotMatch(home, /Resolve identities/);
});

test('Today means today, not the next ninety days', () => {
  assert.match(home, /const todayKey = localDayKey\(new Date\(\)\)/);
  assert.match(
    home,
    /\.filter\(\(item: any\) => localDayKey\(item\?\.deadline_at\) === todayKey\)/,
  );
  assert.match(home, /calendar_kind: 'meeting'/);
  assert.match(home, /calendar_kind: 'deadline'/);
  assert.match(home, /calendar_kind: 'birthday'/);
  assert.match(home, /dayItems[\s\S]*\.slice\(0, 3\)/);
  assert.match(home, /href=\{`\$\{basePath\}\?view=calendar`\}/);
  assert.match(home, /Nothing else today/);
});

test('ReDream handled is a quiet proof strip rather than another work feed', () => {
  assert.match(home, /Recently handled by ReDream/);
  assert.match(home, /styles\.handledStrip/);
  assert.match(home, /recent conversation/);
  assert.match(home, /replyInteractionId/);
  assert.match(home, /recentConnected\.slice\(0, 3\)\.map/);
  assert.match(home, /homeConversationHref\(basePath, item\)/);
  assert.doesNotMatch(home, /connectedMeetings\.slice\(0, 2\)\.map/);
  assert.match(home, /replyInteractionId/);
  assert.match(home, /Prepare reply/);
  assert.doesNotMatch(home, /What changed around you/);
});

test('Home does not duplicate Players Opportunities or Business dashboards', () => {
  assert.doesNotMatch(home, /AGENCY PULSE/);
  assert.doesNotMatch(home, /homePulse/);
  assert.doesNotMatch(home, /playerService/);
  assert.doesNotMatch(home, /opportunityMoves/);
  assert.doesNotMatch(home, /ownerBusiness/);
  assert.doesNotMatch(home, /href="\?view=players"/);
  assert.doesNotMatch(home, /href="\?view=opportunities"/);
  assert.doesNotMatch(home, /href="\?view=business"/);
});

test('Home stays clean and phone-safe', () => {
  assert.match(styles, /\.homeOverviewGrid\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 980px\)[\s\S]*\.homeOverviewGrid[\s\S]*grid-template-columns: 1fr/,
  );
  assert.match(styles, /\.handledStrip\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 680px\)[\s\S]*\.handledStrip[\s\S]*grid-template-columns: 30px minmax\(0, 1fr\)/,
  );
  assert.doesNotMatch(styles, /\.homePulseGrid\s*\{/);
});
