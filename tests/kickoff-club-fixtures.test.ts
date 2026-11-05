import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {kickoffClient, matchKickoffTeam, normaliseKickoffFixture} from '../supabase/functions/_shared/football-data/kickoff-fixtures.ts';
import {readAgencyDashboardSnapshot} from '../supabase/functions/_shared/agency-dashboard-snapshot.ts';
import {normaliseCalendarEvents, filterCalendarEvents, isOverdue, todayProjection} from '../lib/calendar/events.ts';
import {parseCalendarPreferences} from '../lib/calendar/preferences.ts';

const logo = 'https://cdn.kickoffapi.com/images/teams/42.png';
const example = {
  id: 'fx_derby', date: '2026-11-05T00:30:00+01:00', status: {short: 'NS'},
  home: {id: 'tm_home', name: 'Harbour FC', logo},
  away: {id: 'tm_away', name: 'Riverside', logo: 'https://cdn.kickoffapi.com.attacker.example/images/teams/49.png'},
};
const fixture = normaliseKickoffFixture(example, 'tm_home', ['Fixture source']);
const ids = Array.from({length: 7}, (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`);
const [tenant, other, owner, staff, harbour, riverside, outsider] = ids;

test('Unique exact team and country, UTC kickoff, provider-specific logos and credit', () => {
  const home = {...example.home, country: 'England'};
  assert.equal(matchKickoffTeam([home, {...home, id: 'tm_overseas', country: 'Australia'}], 'harbour fc', 'england'), 'tm_home');
  assert.equal(matchKickoffTeam([home, {...home, id: 'tm_reserves'}], 'harbour fc', 'england'), null);
  assert.equal(matchKickoffTeam([home], 'harbour', 'england'), null);
  assert.equal(fixture.kickoff_at, '2026-11-04T23:30:00.000Z');
  assert.equal(fixture.home_logo, logo);
  assert.equal(fixture.away_logo, null);
  assert.deepEqual(fixture.attribution, ['Fixture source']);
  assert.throws(() => normaliseKickoffFixture(example, 'tm_unrelated', []), /invalid_fixture/);
  assert.throws(() => normaliseKickoffFixture({...example, date: '2026-11-05T00:30:00'}, 'tm_home', []), /invalid_fixture/);
});

test('Provider follows cursors and rejects incomplete team schedules without returning partial data', async () => {
  let calls = 0;
  const provider = kickoffClient('synthetic-key', async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.kickoffapi.com');
    assert.equal(url.searchParams.get('team'), 'tm_home');
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('x-api-key'), 'synthetic-key');
    calls += 1;
    if (calls === 1) return Response.json({data: [example], meta: {nextCursor: '1'}});
    assert.equal(url.searchParams.get('cursor'), '1');
    return new Response(null, {status: 429});
  });
  await assert.rejects(provider.fixtures('tm_home', '2026-11-04', '2026-11-30'), /provider_429/);
  assert.equal(calls, 2);
});

test('Dashboard combines the club schedule with a same-match appearance without duplicating it', async () => {
  const players = [{id: harbour, primary_staff_user_id: owner, first_name: 'Test', last_name: 'Player'}];
  const client = {
    from(table: string) {
      const query = {select: () => query, eq: () => query, is: () => query, in: () => query,
        limit: async () => ({data: table === 'players' ? players : [], error: null})};
      return query;
    },
    async rpc(name: string) {
      if (name === 'platform_server_kickoff_fixtures') return {data: {
        items: [{...fixture, players: [{id: harbour, name: 'Test Player'}, {id: outsider, name: 'Hidden Player'}]}],
        coverage: {eligible: 2, fresh: 1},
      }, error: null};
      if (name === 'platform_server_dashboard_sources') return {data: {fixture_links: [{...fixture, fixture_id: outsider, player_id: harbour}], requests: [], tasks: []}, error: null};
      return {data: [], error: null};
    },
  };
  const snapshot = await readAgencyDashboardSnapshot({
    client, tenantId: tenant, userId: owner, role: 'owner', scope: 'agency',
    localDate: '2026-11-05', timeZone: 'Europe/Rome', basePath: '/workspace/test',
  });
  assert.equal(snapshot.fixturesToday, 1);
  assert.equal(snapshot.fixtures[0].homeLogo, logo);
  assert.deepEqual(snapshot.fixtures[0].relatedPlayerNames, ['Test Player']);
  assert.equal(snapshot.fixtures[0].href, '/workspace/test?view=calendar&date=2026-11-05');
});

test('Calendar fixture layer preserves the original kickoff and stays out of task totals', () => {
  const [event] = normaliseCalendarEvents({clubFixtures: {items: [{...fixture, players: [{name: 'Test Player'}]}]}}, {}, []);
  assert.equal(event.kind, 'fixture');
  assert.equal(event.dateAt, fixture.kickoff_at);
  assert.equal(event.fixture?.homeLogo, logo);
  assert.equal(isOverdue(event, new Date('2026-11-06T09:00:00Z')), false);
  assert.equal(todayProjection([event], new Date(fixture.kickoff_at)).dueToday.length, 0);
  assert.equal(filterCalendarEvents([event], parseCalendarPreferences(null)).length, 1);
  assert.equal(filterCalendarEvents([event], parseCalendarPreferences('{"layers":{"fixtures":false}}')).length, 0);
});

test('Actual migration scopes signed club schedules, deduplicates, expires and ignores old writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema platform; create schema djm_os; create schema private; create schema auth;
      create schema cron; create schema vault;
      create table vault.secrets(name text, secret text);
      create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(secret text, name text, description text) returns uuid language sql
        as 'insert into vault.secrets values (name, secret) returning gen_random_uuid()';
      create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';
      create function auth.uid() returns uuid language sql as 'select current_setting(''test.actor'')::uuid';
      create function private.redream_request_tenant() returns uuid language sql as 'select current_setting(''test.tenant'')::uuid';
      create table platform.tenants(id uuid primary key, slug text, status text);
      create table platform.tenant_memberships(tenant_id uuid, user_id uuid, role text, status text);
      create table public.players(id uuid, tenant_id uuid, first_name text, last_name text, preferred_name text, archived_at timestamptz,
        current_club text, current_country text, agency_status text, football_status text, primary_staff_user_id uuid);
      create table public.staff_player_access(player_id uuid, staff_user_id uuid);
      insert into platform.tenants values ('${tenant}','main','active'), ('${other}','other','active');
      insert into platform.tenant_memberships values ('${tenant}','${owner}','owner','active'), ('${tenant}','${staff}','agent','active');
      insert into public.players values
        ('${harbour}','${tenant}','Harbour','Player',null,null,'Harbour FC','England','signed','active','${staff}'),
        ('${riverside}','${tenant}','Riverside','Player',null,null,'Riverside','England','signed','loan','${owner}'),
        ('${outsider}','${other}','Hidden','Player',null,null,'Harbour FC','England','signed','active','${staff}'),
        (gen_random_uuid(),'${tenant}','Prospect','Player',null,null,'Harbour FC','England','prospect','active','${staff}');
    `);
    await db.exec(readFileSync('supabase/migrations/20261105101551_add_kickoffapi_club_fixtures.sql', 'utf8'));
    const date = new Date();
    date.setUTCHours(23, 30, 0, 0);
    const utcDay = date.toISOString().slice(0, 10);
    const localDay = new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
    const after = new Date(date.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const upcoming = {...fixture, kickoff_at: date.toISOString()};
    const save = (club: string, team: string, rows: unknown[], offset = 0) => db.query(
      `select public.platform_server_kickoff_save($1, $2, 'england', $3, now() + ($4::int * interval '1 hour'), $5::jsonb)`,
      [tenant, club, team, offset, JSON.stringify(rows)],
    );
    const dashboard = (id: string, scope: string, target = tenant) => db.query<{result: any}>(
      "select public.platform_server_kickoff_fixtures($1, $2, $3, $4, $5, 'Europe/Rome') as result",
      [target, id, scope, localDay, after],
    ).then(({rows}) => rows[0].result);
    await db.exec('set role service_role');
    const targets = await db.query<{targets: any[]}>("select public.platform_server_kickoff_targets('main') as targets");
    assert.deepEqual(targets.rows[0].targets.map(row => row.club_key), ['harbour fc','riverside']);
    assert.equal(targets.rows[0].targets[0].country_name, 'England');
    await save('harbour fc', 'tm_home', [upcoming]);
    await save('riverside', 'tm_away', [upcoming]);
    await save('harbour fc', 'tm_home', [], -1);
    const agency = await dashboard(owner, 'agency');
    assert.equal(agency.items.length, 1);
    assert.deepEqual(agency.items[0].players.map((player: any) => player.id), [harbour, riverside]);
    assert.deepEqual((await dashboard(staff, 'me')).items[0].players.map((player: any) => player.id), [harbour]);
    await assert.rejects(dashboard(staff, 'agency'), /fixture_access_denied/);
    await assert.rejects(dashboard(staff, 'me', other), /fixture_access_denied/);
    const previous = await db.query<{result: any}>(
      "select public.platform_server_kickoff_fixtures($1, $2, 'agency', $3, $4, 'Europe/Rome') as result", [tenant, owner, utcDay, localDay],
    );
    assert.equal(previous.rows[0].result.items.length, 0);
    await db.exec(`reset role; set test.actor to '${staff}'; set test.tenant to '${tenant}'; set role authenticated`);
    const calendar = await db.query<{result: any}>("select public.redream_calendar_club_fixtures($1,$2,'Europe/Rome') as result", [localDay, after]);
    assert.deepEqual(calendar.rows[0].result.items[0].players.map((player: any) => player.id), [harbour]);
    await assert.rejects(dashboard(staff, 'me'), /permission denied/);
    await assert.rejects(db.query('select public.platform_server_kickoff_cron_secret()'), /permission denied/);
    await db.exec(`reset role; update public.players set current_club = 'New Club' where id = '${harbour}'`);
    assert.equal((await dashboard(staff, 'me')).items.length, 0);
    await save('riverside', 'tm_away', [{...upcoming, status: 'PST'}], 1);
    assert.equal((await dashboard(owner, 'agency')).items.length, 0);
    await db.exec("update djm_os.kickoff_club_fixture_cache set checked_at = now() - interval '37 hours'");
    assert.equal((await dashboard(owner, 'agency')).coverage.fresh, 0);
  } finally {
    await db.close();
  }
});
