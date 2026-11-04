import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readPitchHistory} from '../lib/club-pitch-history.ts';

const db = new PGlite();
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [tenant, otherTenant, owner, staff, player, otherPlayer, club, otherClub,
  need, secondNeed, foreignNeed, match, secondMatch, foreignMatch, share, draft,
  foreignShare, wrongDeal, command] = Array.from({length: 19}, (_, i) => id(i + 1));
const migration = readFileSync('supabase/migrations/20261104142417_exact_club_request_pitch_history.sql', 'utf8');
const historyFn = 'public.platform_server_club_request_pitch_history(uuid,uuid,text,uuid)';
const replyFn = 'public.platform_server_record_club_pitch_staff_reply(uuid,uuid,uuid,uuid,uuid,text,text,text)';
const scalar = async (sql: string, params: unknown[] = []) =>
  (await db.query<{result: any}>(`select ${sql} as result`, params)).rows[0].result;
const history = async (scope: 'request'|'player'|'match', scopeId: string, actor = owner) =>
  readPitchHistory({history: await scalar('public.platform_server_club_request_pitch_history($1,$2,$3,$4)', [tenant, actor, scope, scopeId])}, scope, scopeId);
const record = (needId = need, shareId = share, note = 'Director requested the full match.', actor = owner) =>
  scalar('public.platform_server_record_club_pitch_staff_reply($1,$2,$3,$4,$5,$6,$7,$8)',
    [tenant, actor, needId, shareId, command, 'request_information', 'phone', note]);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema platform; create schema private; create schema djm_os;
    create table platform.tenants(id uuid primary key, status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text,primary key(tenant_id,user_id));
    create table djm_os.team_members(user_id uuid primary key,display_name text);
    create table public.players(id uuid primary key, tenant_id uuid, preferred_name text, first_name text, last_name text);
    create table djm_os.organisations(id uuid primary key, tenant_id uuid, name text, archived_at timestamptz);
    create table djm_os.club_needs(id uuid primary key, tenant_id uuid, organisation_id uuid, title text, archived_at timestamptz);
    create table djm_os.player_matches(id uuid primary key, tenant_id uuid, club_need_id uuid, player_id uuid);
    create table djm_os.deal_rooms(id uuid primary key, tenant_id uuid, club_need_id uuid, player_id uuid, organisation_id uuid, owner_user_id uuid, next_action_text text, next_action_at timestamptz);
    create table public.club_share_links(id uuid primary key, player_id uuid, organisation_id uuid, opportunity_id uuid, pitch_status text, active boolean, created_at timestamptz default now(), sent_at timestamptz, expires_at timestamptz, revoked_at timestamptz, view_count integer, last_viewed_at timestamptz, token text);
    create table platform.club_pitch_contexts(share_id uuid primary key references public.club_share_links(id),tenant_id uuid,player_match_id uuid,club_need_id uuid);
    create table platform.club_pitch_responses(share_id uuid primary key,tenant_id uuid,response_type text,message text,updated_at timestamptz,responder_name text,responder_email text,identity_status text);
    create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql stable as $$
      select exists(select 1 from platform.tenant_memberships m join platform.tenants a on a.id=m.tenant_id
        where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in ('owner','admin') and a.status='active')
    $$;
    insert into platform.tenants values ('${tenant}','active'),('${otherTenant}','active');
    insert into platform.tenant_memberships values ('${tenant}','${owner}','active','owner'),('${tenant}','${staff}','active','agent');
    insert into public.players values ('${player}','${tenant}',null,'Example','Player'),('${otherPlayer}','${otherTenant}',null,'Foreign','Player');
    insert into djm_os.organisations(id,tenant_id,name) values ('${club}','${tenant}','Example FC'),('${otherClub}','${otherTenant}','Foreign FC');
    insert into djm_os.club_needs(id,tenant_id,organisation_id,title) values
      ('${need}','${tenant}','${club}','Centre back'),('${secondNeed}','${tenant}','${club}','Full back'),('${foreignNeed}','${otherTenant}','${otherClub}','Forward');
    insert into djm_os.player_matches values
      ('${match}','${tenant}','${need}','${player}'),('${secondMatch}','${tenant}','${secondNeed}','${player}'),('${foreignMatch}','${otherTenant}','${foreignNeed}','${otherPlayer}');
    insert into djm_os.deal_rooms(id,tenant_id,club_need_id,player_id,organisation_id)
      values ('${wrongDeal}','${tenant}','${secondNeed}','${player}','${club}');
    insert into public.club_share_links(id,player_id,organisation_id,pitch_status,active,sent_at,token,opportunity_id) values
      ('${share}','${player}','${club}','sent',true,now(),'private-token','${wrongDeal}'),
      ('${draft}','${player}','${club}','draft',false,null,'another-token',null),
      ('${foreignShare}','${otherPlayer}','${otherClub}','sent',true,now(),'foreign-token',null);
    insert into platform.club_pitch_contexts values
      ('${share}','${tenant}','${match}','${need}'),('${draft}','${tenant}','${secondMatch}','${secondNeed}'),('${foreignShare}','${otherTenant}','${foreignMatch}','${foreignNeed}');
    insert into platform.club_pitch_responses values ('${share}','${tenant}','not_now','Check next window.',now(),'Club contact','private@example.test','self_asserted_unverified');
  `);
  await db.exec(migration);
});
after(() => db.close());

test('exact request and match history separate two pitches to the same club for the same player', async () => {
  const request = (await history('request', need)).items;
  assert.deepEqual(request.map(pitch => pitch.share_id), [share]);
  assert.deepEqual((await history('match', secondMatch)).items.map(pitch => pitch.share_id), [draft]);
  assert.deepEqual(new Set((await history('player', player)).items.map(pitch => pitch.share_id)), new Set([share, draft]));
  assert.deepEqual((await history('request', foreignNeed)).items, []);
  assert.deepEqual((await history('player', otherPlayer)).items, []);
  assert.equal(request[0].opportunity_id, null, 'A deal from another request must not attach to this pitch');
  assert.doesNotMatch(JSON.stringify(request), /private-token|private@example\.test/);
  assert.throws(() => readPitchHistory({history: {scope:'request', scope_id:secondNeed, items:request}}, 'request', secondNeed));
});

test('only the service RPC can reach history and it rechecks active owner/admin membership', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar("has_table_privilege($1,'platform.club_pitch_staff_replies','INSERT')", [role]), false);
    for (const signature of [historyFn, replyFn]) {
      assert.equal(await scalar("has_function_privilege($1,$2,'EXECUTE')", [role, signature]), role === 'service_role');
    }
  }
  await assert.rejects(history('request', need, staff), {code:'42501'});
  await assert.rejects(record(need, share, 'Cannot log as staff', staff), {code:'42501'});
});

test('staff replies require a recorded send, replay once and preserve the recipient response', async () => {
  await assert.rejects(record(secondNeed, draft), {code:'22023'});
  await assert.rejects(record(secondNeed, share), {code:'22023'});
  await assert.rejects(record(foreignNeed, foreignShare), {code:'22023'});
  const receipt = await record();
  assert.deepEqual(await record(), receipt);
  await assert.rejects(record(need, share, 'Different note with same command.'), {code:'40001'});
  assert.equal(await scalar('(select count(*) from platform.club_pitch_staff_replies)'), 1);
  for (const [scope, scopeId] of [['request', need], ['player', player]] as const) {
    const pitch = (await history(scope, scopeId)).items.find(item => item.share_id === share);
    assert.equal(pitch?.staff_reply?.channel, 'phone');
    assert.equal(pitch?.staff_reply?.message, 'Director requested the full match.');
    assert.equal(pitch?.link_reply?.message, 'Check next window.');
  }
});
