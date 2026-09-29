import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const files = [
  'components/AgencyActionDrawer.module.css',
  'components/AgencyClubAccountDrawer.module.css',
  'components/AgencyConnectionsDrawer.module.css',
  'components/AgencyContactIntelligenceDrawer.module.css',
  'components/AgencyCreateDrawer.module.css',
  'components/AgencyDealCloseoutDrawer.module.css',
  'components/AgencyEntityIntelligenceDrawer.module.css',
  'components/AgencyMemoryDrawer.module.css',
  'components/AgencyNegotiationCommandRoom.module.css',
  'components/AgencyNetworkWorkspace.module.css',
  'components/AgencyOperatingWorkspace.module.css',
  'components/AgencyOpportunitiesWorkspace.module.css',
  'components/AgencyPlayerProfile.module.css',
  'components/AgencyPlayerServiceReviewDrawer.module.css',
  'components/AgencyPlayersWorkspace.module.css',
  'components/AgencyPursuitRoom.module.css',
  'components/AgencyRelationshipActions.module.css',
  'components/AgencyRosterMigrationPanel.module.css',
  'components/AgencyTeamHandoffDrawer.module.css',
  'components/AiCapture.module.css',
  'components/ConnectionsPanel.module.css',
];

const css = Object.fromEntries(
  files.map((file) => [file, readFileSync(file, 'utf8')]),
);
test(
  'mobile polish v2 covers every major interactive agency surface',
  () => {
    for (const file of files) {
      assert.match(
        css[file],
        /Mobile product polish v2/,
        file,
      );
    }
  },
);

test(
  'high-risk mobile text inputs use 16px to prevent iOS zoom',
  () => {
    const checks = [
      ['components/AgencyConnectionsDrawer.module.css', /threadContactSelect[\s\S]*font-size: 16px/],
      ['components/AgencyNetworkWorkspace.module.css', /search input[\s\S]*font-size: 16px/],
      ['components/AgencyOpportunitiesWorkspace.module.css', /search input[\s\S]*font-size: 16px/],
      ['components/AgencyPlayerProfile.module.css', /form input[\s\S]*font-size: 16px/],
      ['components/AgencyPlayersWorkspace.module.css', /interactionForm textarea[\s\S]*font-size: 16px/],
      ['components/AgencyTeamHandoffDrawer.module.css', /note textarea[\s\S]*font-size: 16px/],
      ['components/AiCapture.module.css', /textPanel textarea[\s\S]*font-size: 16px/],
      ['components/ConnectionsPanel.module.css', /timezoneRow input[\s\S]*font-size: 16px/],
    ] as const;

    for (const [file, pattern] of checks) {
      assert.match(css[file], pattern, file);
    }
  },
);
test(
  'key mobile controls meet the 44px touch-target baseline',
  () => {
    const combined = files.map((file) => css[file]).join('\n');

    assert.match(
      combined,
      /min-height: 44px/,
    );

    assert.match(
      css['components/AgencyOperatingWorkspace.module.css'],
      /compactButton,[\s\S]*primaryButton,[\s\S]*secondaryButton,[\s\S]*refresh[\s\S]*min-height: 44px/,
    );

    assert.match(
      css['components/AgencyPlayersWorkspace.module.css'],
      /sectionTab,[\s\S]*playerTabActive[\s\S]*min-height: 44px/,
    );
  },
);

test(
  'mobile drawers keep safe-area spacing where chrome can overlap content',
  () => {
    const drawerFiles = [
      'components/AgencyActionDrawer.module.css',
      'components/AgencyContactIntelligenceDrawer.module.css',
      'components/AgencyCreateDrawer.module.css',
      'components/AgencyDealCloseoutDrawer.module.css',
      'components/AgencyEntityIntelligenceDrawer.module.css',
      'components/AgencyMemoryDrawer.module.css',
      'components/AgencyNegotiationCommandRoom.module.css',
      'components/AgencyPlayerServiceReviewDrawer.module.css',
      'components/AgencyPursuitRoom.module.css',
    ];

    for (const file of drawerFiles) {
      assert.match(
        css[file],
        /safe-area-inset-(top|bottom)/,
        file,
      );
    }
  },
);
