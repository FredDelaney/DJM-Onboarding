import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(
  'supabase/migrations/20261013200134_player_profile_versions_and_source_refs_v1.sql',
  'utf8',
);
const tenant = '10000000-0000-4000-8000-000000000001';
const otherTenant = '10000000-0000-4000-8000-000000000002';
const player = '20000000-0000-4000-8000-000000000001';
const club = '30000000-0000-4000-8000-000000000001';
const otherClub = '30000000-0000-4000-8000-000000000002';
const user = '40000000-0000-4000-8000-000000000001';
const version = '50000000-0000-4000-8000-000000000001';
const versionToken = '60000000-0000-4000-8000-000000000001';
const legacyToken = '60000000-0000-4000-8000-000000000002';
const deal = '90000000-0000-4000-8000-000000000001';
const need = 'a0000000-0000-4000-8000-000000000001';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema platform; create schema djm_os;
    create table auth.users(id uuid primary key);
    create table platform.tenants(id uuid primary key);
    create table platform.tenant_branding(
      tenant_id uuid primary key, display_name text, short_name text, portal_name text,
      logo_asset text, compact_logo_asset text, light_logo_asset text,
      primary_color text, secondary_color text, accent_color text,
      support_email text, website_url text, phone text
    );
    create table public.players(
      id uuid primary key, tenant_id uuid not null, updated_at timestamptz not null default now(),
      verification_status text, verified_at timestamptz
    );
    create table public.player_videos(id uuid primary key, player_id uuid not null);
    create table public.player_cv_settings(player_id uuid primary key);
    create table djm_os.organisations(
      id uuid primary key, tenant_id uuid not null, name text, league_name text
    );
    create table djm_os.people(id uuid primary key, tenant_id uuid not null);
    create table djm_os.deal_rooms(
      id uuid primary key, tenant_id uuid not null, player_id uuid,
      organisation_id uuid not null, club_need_id uuid, title text
    );
    create table djm_os.club_needs(
      id uuid primary key, tenant_id uuid not null, organisation_id uuid not null,
      title text, position text, profile_notes text, status text,
      confirmed_at timestamptz, expires_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table djm_os.tell_djm_permissions(
      tenant_id uuid not null, user_id uuid not null,
      is_enabled boolean not null, permission_scope text not null
    );
    create table djm_os.tell_djm_settings(id integer primary key, is_live boolean not null);
    create function private.user_has_staff_tenant_access(uuid,uuid)
      returns boolean language sql as $$ select true $$;
    create table public.player_public_profiles(
      player_id uuid primary key, published boolean not null, display_name text,
      headline text, primary_position text, secondary_positions text[],
      preferred_foot text, age_display text, height_display text, nationalities text[],
      current_status text, current_club text, key_stats jsonb, why_review text,
      career_summary text, profile_photo_path text, hero_image_path text,
      primary_video_url text, transfermarkt_url text, wyscout_url text, stats_url text,
      career_timeline jsonb, selected_videos jsonb, notable_experience jsonb,
      market_value_display text, market_value_source_url text, hidden_sections text[],
      hide_market_value boolean, contact_email text, verified_at timestamptz
    );
    create table public.club_share_links(
      id uuid primary key, token uuid not null,
      player_id uuid not null references public.players(id) on delete cascade,
      active boolean not null default true, expires_at timestamptz,
      pitch_message text,
      organisation_id uuid references djm_os.organisations(id) on delete set null,
      source_person_id uuid references djm_os.people(id) on delete set null,
      opportunity_id uuid references djm_os.deal_rooms(id) on delete set null
    );
    create table public.player_documents(
      id uuid primary key, player_id uuid not null, title text, document_type text,
      club_shareable boolean, created_at timestamptz
    );
    create function public.track_club_share_view(uuid) returns boolean
      language sql as $$ select true $$;
  `);
  await db.exec(migration);
  await db.query('insert into auth.users(id) values ($1)', [user]);
  await db.query("insert into djm_os.tell_djm_settings(id,is_live) values (1,true)");
  await db.query("insert into djm_os.tell_djm_permissions(tenant_id,user_id,is_enabled,permission_scope) values ($1,$2,true,'full')", [tenant, user]);
  await db.query('insert into platform.tenants(id) values ($1),($2)', [tenant, otherTenant]);
  await db.query(
    "insert into public.players(id,tenant_id,verification_status,verified_at) values ($1,$2,'verified',now())",
    [player, tenant],
  );
  await db.query(
    "insert into djm_os.organisations(id,tenant_id,name,league_name) values ($1,$3,'Club A','Top Division'),($2,$3,'Club B',null)",
    [club, otherClub, tenant],
  );
  await db.query(
    "insert into djm_os.club_needs(id,tenant_id,organisation_id,title,position,profile_notes,status,confirmed_at) values ($1,$2,$3,'Needs a striker','ST','Private budget note','active',now())",
    [need, tenant, club],
  );
  await db.query(
    "insert into djm_os.deal_rooms(id,tenant_id,player_id,organisation_id,club_need_id,title) values ($1,$2,$3,$4,$5,'Summer move')",
    [deal, tenant, player, club, need],
  );
  await db.query(
    "insert into public.player_public_profiles(player_id,published,display_name,primary_position,key_stats) values ($1,true,'General profile','ST','[]')",
    [player],
  );
  await db.query(
    `insert into public.player_profile_versions(
      id,tenant_id,player_id,profile_kind,organisation_id,status,presentation,
      stat_sources,master_player_updated_at,master_data_fingerprint,
      created_by,approved_by,approved_at
    ) values (
      $1,$2,$3,'club',$4,'approved',$5::jsonb,$6::jsonb,now(),'player-revision-1',$7,$7,now()
    )`,
    [
      version, tenant, player, club,
      JSON.stringify({
        display_name: 'Club profile', primary_position: 'ST',
        key_stats: [{ label: 'Goals', value: '7' }],
      }),
      JSON.stringify([{ source_ref: 'career-entry-id:goals' }]), user,
    ],
  );
  await db.query(
    'insert into public.club_share_links(id,token,player_id,organisation_id,profile_version_id) values (gen_random_uuid(),$1,$2,$3,$4)',
    [versionToken, player, club, version],
  );
  await db.query(
    'insert into public.club_share_links(id,token,player_id,organisation_id) values (gen_random_uuid(),$1,$2,$3)',
    [legacyToken, player, club],
  );
});

after(async () => { await db.close(); });

test('versioned links keep approved presentation while old links use General', async () => {
  const first = (await db.query<{ data: any }>(
    'select public.get_club_share($1) as data', [versionToken],
  )).rows[0].data;
  assert.equal(first.profile.display_name, 'Club profile');
  assert.deepEqual(first.profile.key_stats, [{ label: 'Goals', value: '7' }]);
  assert.equal(first.profile.stat_sources, undefined);
  assert.equal(first.profile.master_data_fingerprint, undefined);

  await db.query("update public.player_public_profiles set display_name='General changed' where player_id=$1", [player]);
  const versioned = (await db.query<{ data: any }>(
    'select public.get_club_share($1) as data', [versionToken],
  )).rows[0].data;
  const legacy = (await db.query<{ data: any }>(
    'select public.get_club_share($1) as data', [legacyToken],
  )).rows[0].data;
  assert.equal(versioned.profile.display_name, 'Club profile');
  assert.equal(legacy.profile.display_name, 'General changed');
});

test('approved versions and sent target bindings cannot be changed', async () => {
  await assert.rejects(db.query(
    "update public.player_profile_versions set presentation='{}' where id=$1", [version],
  ), /approved_player_profile_version_is_immutable/);
  await assert.rejects(db.query(
    'update public.club_share_links set organisation_id=$1 where token=$2',
    [otherClub, versionToken],
  ), /shared_player_profile_target_is_immutable/);
});

test('approved statistics need source references and cannot carry private payload keys', async () => {
  const base = [tenant, player, club, user];
  await assert.rejects(db.query(
    `insert into public.player_profile_versions(
      tenant_id,player_id,profile_kind,organisation_id,status,presentation,
      master_player_updated_at,master_data_fingerprint,created_by,approved_by,approved_at
    ) values ($1,$2,'club',$3,'approved',$5::jsonb,now(),'revision',$4,$4,now())`,
    [...base, JSON.stringify({
      display_name: 'Player', primary_position: 'ST',
      key_stats: [{ label: 'Goals', value: '7' }],
    })],
  ), /player_profile_stat_sources_required/);
  await assert.rejects(db.query(
    `insert into public.player_profile_versions(
      tenant_id,player_id,profile_kind,organisation_id,presentation,
      master_player_updated_at,master_data_fingerprint,created_by
    ) values ($1,$2,'club',$3,$5::jsonb,now(),'revision',$4)`,
    [...base, JSON.stringify({
      display_name: 'Player', primary_position: 'ST',
      key_stats: [{ label: 'Goals', value: '7', internal_note: 'Do not share' }],
    })],
  ), /invalid_player_profile_stat/);
});

test('cross-tenant and wrong-club versions cannot be attached', async () => {
  await assert.rejects(db.query(
    `insert into public.player_profile_versions(
      tenant_id,player_id,profile_kind,organisation_id,master_player_updated_at,
      master_data_fingerprint,created_by
    ) values ($1,$2,'club',$3,now(),'bad-revision',$4)`,
    [otherTenant, player, club, user],
  ), /player_profile_version_tenant_mismatch/);
  await assert.rejects(db.query(
    'insert into public.club_share_links(id,token,player_id,organisation_id,profile_version_id) values (gen_random_uuid(),gen_random_uuid(),$1,$2,$3)',
    [player, otherClub, version],
  ), /shared_player_profile_club_mismatch/);
});

test('draft stat references and featured video remain tied to source records', async () => {
  const ownVideo = '70000000-0000-4000-8000-000000000001';
  const otherVideo = '70000000-0000-4000-8000-000000000002';
  await db.query(
    'insert into public.player_videos(id,player_id) values ($1,$3),($2,gen_random_uuid())',
    [ownVideo, otherVideo, player],
  );
  await db.query(
    'insert into public.player_cv_settings(player_id,selected_stat_refs,selected_video_id) values ($1,$2::jsonb,$3)',
    [player, JSON.stringify(['80000000-0000-4000-8000-000000000001:goals']), ownVideo],
  );
  await assert.rejects(db.query(
    'update public.player_cv_settings set selected_video_id=$1 where player_id=$2',
    [otherVideo, player],
  ), /selected_video_must_belong_to_player/);
  await assert.rejects(db.query(
    'update public.player_cv_settings set selected_stat_refs=$1::jsonb where player_id=$2',
    [JSON.stringify(['invented metric']), player],
  ), /invalid_selected_stat_ref/);
});

test('club preparation context uses only linked confirmed need and rejects wrong tenant', async () => {
  const context = (await db.query<{ data: any }>(
    'select public.platform_server_player_profile_club_context($1,$2,$3,$4) as data',
    [tenant, player, club, deal],
  )).rows[0].data;
  assert.equal(context.organisation.name, 'Club A');
  assert.equal(context.organisation.league_name, 'Top Division');
  assert.equal(context.deal.title, 'Summer move');
  assert.equal(context.club_need.position, 'ST');
  assert.equal(JSON.stringify(context).includes('Private budget note'), false);
  await db.query("update djm_os.club_needs set expires_at=now()-interval '1 day' where id=$1", [need]);
  const stale = (await db.query<{ data: any }>(
    'select public.platform_server_player_profile_club_context($1,$2,$3,$4) as data',
    [tenant, player, club, deal],
  )).rows[0].data;
  assert.equal(stale.club_need, null);
  await db.query('update djm_os.club_needs set expires_at=null where id=$1', [need]);
  await assert.rejects(db.query(
    'select public.platform_server_player_profile_club_context($1,$2,$3,$4)',
    [otherTenant, player, club, deal],
  ), /player_not_found_in_tenant/);
  await assert.rejects(db.query(
    'select public.platform_server_player_profile_club_context($1,$2,$3,$4)',
    [tenant, player, otherClub, deal],
  ), /opportunity_not_found_for_player_and_club/);
});

test('only service role can read version rows or call raw share RPCs', async () => {
  const privileges = (await db.query<{
    anon_table: boolean; anon_share: boolean; anon_track: boolean;
    anon_context: boolean; anon_ai: boolean; service_share: boolean; service_context: boolean;
  }>(`select
    has_table_privilege('anon','public.player_profile_versions','SELECT') as anon_table,
    has_function_privilege('anon','public.get_club_share(uuid)','EXECUTE') as anon_share,
    has_function_privilege('anon','public.track_club_share_view(uuid)','EXECUTE') as anon_track,
    has_function_privilege('anon','public.platform_server_player_profile_club_context(uuid,uuid,uuid,uuid)','EXECUTE') as anon_context,
    has_function_privilege('anon','public.platform_server_player_profile_ai_access(uuid,uuid)','EXECUTE') as anon_ai,
    has_function_privilege('service_role','public.get_club_share(uuid)','EXECUTE') as service_share,
    has_function_privilege('service_role','public.platform_server_player_profile_club_context(uuid,uuid,uuid,uuid)','EXECUTE') as service_context`)).rows[0];
  assert.equal(privileges.anon_table, false);
  assert.equal(privileges.anon_share, false);
  assert.equal(privileges.anon_track, false);
  assert.equal(privileges.anon_context, false);
  assert.equal(privileges.anon_ai, false);
  assert.equal(privileges.service_share, true);
  assert.equal(privileges.service_context, true);
  const rls = (await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid='public.player_profile_versions'::regclass",
  )).rows[0].relrowsecurity;
  assert.equal(rls, true);
});

test('profile AI access follows enabled full-scope tenant permission', async () => {
  const read = async (scopeTenant: string) => (await db.query<{ allowed: boolean }>(
    'select public.platform_server_player_profile_ai_access($1,$2) as allowed',
    [scopeTenant, user],
  )).rows[0].allowed;
  assert.equal(await read(tenant), true);
  assert.equal(await read(otherTenant), false);
  await db.query("update djm_os.tell_djm_permissions set is_enabled=false where tenant_id=$1", [tenant]);
  assert.equal(await read(tenant), false);
  await db.query("update djm_os.tell_djm_permissions set is_enabled=true where tenant_id=$1", [tenant]);
});

test('deleting the target club invalidates its versioned link without exposing General', async () => {
  await db.query('delete from djm_os.organisations where id=$1', [club]);
  const result = (await db.query<{ data: any }>(
    'select public.get_club_share($1) as data', [versionToken],
  )).rows[0].data;
  assert.equal(result, null);
});
