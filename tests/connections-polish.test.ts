import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const drawer = readFileSync(
  'components/AgencyConnectionsDrawer.tsx',
  'utf8',
);
const messaging = readFileSync(
  'components/AgencyMessagingConnections.tsx',
  'utf8',
);
const metaConnect = readFileSync(
  'supabase/functions/redream-meta-connect/index.ts',
  'utf8',
);
const css = readFileSync(
  'components/AgencyConnectionsDrawer.module.css',
  'utf8',
);
const pdf = readFileSync(
  'components/ClubCvPdf.tsx',
  'utf8',
);

test('messaging connections explain requirements in plain English', () => {
  assert.match(messaging, /Requires WhatsApp Business/);
  assert.match(messaging, /Requires a Business or Creator account/);
  assert.match(messaging, /Choose what ReDream/);
  assert.match(messaging, /Opening /);
});

test('Instagram callback errors become useful guidance', () => {
  assert.match(drawer, /connection_reason/);
  assert.match(drawer, /Instagram needs a Business or Creator account/);
  assert.match(drawer, /Instagram needs access to your professional inbox/);
  assert.match(drawer, /Instagram connection cancelled/);
});

test('connected messaging accounts do not show a redundant reconnect action', () => {
  assert.match(
    messaging,
    /ready\[[\s\S]*provider\.key[\s\S]*health !==[\s\S]*'connected'/,
  );
});

test('connections stay compact and mobile friendly', () => {
  assert.match(css, /ReDream connections polish 2026-10-17/);
  assert.match(css, /\.messagingProvider > \.primary/);
  assert.match(css, /min-height: 50px/);
});

test('club PDF keeps the verified two-page safeguards', () => {
  assert.match(pdf, /\.slice\(0, 5\)/);
  assert.match(pdf, /Recent career record\./);
  assert.match(pdf, /primaryVideo && !hidden\(profile, 'videos'\)/);
  assert.match(pdf, /PERFORMANCE DETAIL/);
  assert.match(pdf, /CONTACT \{agencyShortName\.toUpperCase\(\)\}/);
});


test('WhatsApp starts Meta directly from the user tap', () => {
  const load = messaging.slice(
    messaging.indexOf('const load ='),
    messaging.indexOf('useEffect(() => {'),
  );
  const connect = messaging.slice(
    messaging.indexOf('const connectWhatsApp ='),
    messaging.indexOf('const connect ='),
  );

  assert.match(messaging, /type WhatsAppConfig/);
  assert.match(metaConnect, /action === "whatsapp_config"/);
  assert.match(load, /action:\s*'whatsapp_config'/);
  assert.match(load, /await loadFacebookSdk/);
  assert.match(
    connect,
    /await whatsappSignup\(\s*window\.FB,\s*whatsappConfig\.config_id/,
  );
  assert.doesNotMatch(
    connect.slice(0, connect.indexOf('await whatsappSignup(')),
    /await platformInvoke/,
  );
});

test('WhatsApp login is invoked before any async wait can lose the mobile tap', () => {
  const signupStart = messaging.indexOf('function whatsappSignup(');
  const signupEnd = messaging.indexOf('export default function AgencyMessagingConnections', signupStart);
  const signup = messaging.slice(signupStart, signupEnd);

  assert.match(signup, /sdk\.login\(/);
  assert.doesNotMatch(signup, /await loadFacebookSdk/);
  assert.match(signup, /return Promise\.all/);
});
