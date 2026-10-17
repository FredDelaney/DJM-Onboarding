import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');

test('question context uses bounded, tenant-scoped server reads with the established staff boundary', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private; create schema platform; create schema djm_os;
      create table platform.tenants(id uuid,status text);
      create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
      create function private.user_has_staff_tenant_access(uuid,uuid) returns boolean language sql stable as $$
        select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
          where m.tenant_id=$1 and m.user_id=$2 and m.status='active' and m.role in ('owner','admin','agent','scout','operations')); $$;
      create function private.user_is_tenant_admin(uuid,uuid) returns boolean language sql stable as $$
        select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
          where m.tenant_id=$1 and m.user_id=$2 and m.status='active' and m.role in ('owner','admin')); $$;
      create table public.staff_player_access(player_id uuid,staff_user_id uuid);
      create table public.players(id uuid,tenant_id uuid,first_name text,last_name text,current_club text,
        contract_expiry date,transfermarkt_market_value numeric,next_action text,private_future_field text,archived_at timestamptz);
      create table public.career_entries(player_id uuid,club_name text,country text,league text,season_label text,
        start_date date,end_date date,appearances integer,starts integer,minutes integer,goals integer,assists integer,
        source_name text,source_url text,source_reviewed_at timestamptz,source_provider text,source_synced_at timestamptz);
      create table djm_os.scouting_prospects(id uuid,tenant_id uuid,full_name text,notes text,archived_at timestamptz,private_future_field text);
      create table djm_os.organisations(id uuid,tenant_id uuid,name text,country text,league_name text,organisation_type text,archived_at timestamptz,private_future_field text);
      create table djm_os.people(id uuid,tenant_id uuid,full_name text,person_type text,archived_at timestamptz,private_future_field text);
      create table djm_os.employments(id uuid,tenant_id uuid,person_id uuid,organisation_id uuid,role_title text,is_current boolean,started_on date,updated_at timestamptz);
      create table djm_os.interactions(id uuid,tenant_id uuid,player_id uuid,person_id uuid,organisation_id uuid,
        summary text,occurred_at timestamptz,channel text,direction text,source_type text,confidence numeric,raw_private_payload text);
      create table djm_os.tasks(id uuid,tenant_id uuid,owner_user_id uuid,player_id uuid,person_id uuid,organisation_id uuid,
        title text,status text,due_at timestamptz,created_at timestamptz,archived_at timestamptz,private_future_field text);
      create table djm_os.club_needs(id uuid,tenant_id uuid,organisation_id uuid,title text,salary_budget numeric,updated_at timestamptz,archived_at timestamptz);
      create table djm_os.deal_rooms(id uuid,tenant_id uuid,title text,expected_commission numeric,archived_at timestamptz,private_future_field text);
    `);
    const migration = readFileSync('supabase/migrations/20261017173500_redream_agent_context.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.query("insert into platform.tenants values($1,'active'),($2,'active')", [id(1), id(2)]);
    await db.query("insert into platform.tenant_memberships values($1,$2,'owner','active'),($1,$3,'scout','active'),($1,$4,'player','active'),($1,$5,'agent','ended')", [id(1), id(10), id(11), id(12), id(13)]);
    await db.query("insert into public.players values($1,$2,'Example','Player','Recorded FC','2027-06-30',500000,'Private negotiation','Never send',null),($3,$4,'Foreign','Player','Foreign FC',null,null,null,null,null),($5,$2,'Archived','Player',null,null,null,null,null,now())", [id(20), id(1), id(21), id(2), id(22)]);
    await db.query('insert into public.staff_player_access values($1,$2)', [id(20), id(11)]);
    await db.query("insert into public.career_entries(player_id,club_name,appearances,goals,source_url) values($1,'Recorded FC',10,0,'https://example.org/official-stats')", [id(20)]);
    await db.query("insert into djm_os.scouting_prospects values($1,$2,'Recruitment Example','Recorded recruitment note',null,'Never send')", [id(30), id(1)]);
    await db.query("insert into djm_os.organisations values($1,$2,'Example FC','NZ','Recorded League','club',null,'Never send'),($3,$4,'Foreign FC',null,null,'club',null,'Never send')", [id(40), id(1), id(41), id(2)]);
    await db.query("insert into djm_os.people values($1,$2,'Example Contact','contact',null,'Never send')", [id(50), id(1)]);
    await db.query("insert into djm_os.employments values($1,$2,$3,$4,'Director',true,'2026-01-01',now())", [id(51), id(1), id(50), id(40)]);
    await db.query("insert into djm_os.interactions values($1,$2,$3,$4,$5,'Reported claim, not verified',now(),'voice','inbound','reported',0.4,'Never send raw')", [id(60), id(1), id(20), id(50), id(40)]);
    await db.query("insert into djm_os.club_needs values($1,$2,$3,'Recorded midfield need',2500,now(),null)", [id(70), id(1), id(40)]);
    await db.query("insert into djm_os.deal_rooms values($1,$2,'Recorded deal',1000,null,'Never send')", [id(80), id(1)]);
    await db.query("insert into djm_os.tasks values($1,$2,$3,$4,$5,$6,'My open task','open',now(),now(),null,'Never send'),($7,$2,$8,$4,$5,$6,'Other owner secret','open',now(),now(),null,null),($9,$10,$3,null,null,null,'Other tenant secret','open',now(),now(),null,null),($11,$2,$3,$4,null,null,'Completed task','completed',now(),now(),null,null),($12,$2,$3,$4,null,null,'Archived task','open',now(),now(),now(),null)", [id(90), id(1), id(10), id(20), id(50), id(40), id(91), id(11), id(92), id(2), id(93), id(94)]);
    const context = async (kind: string, record: string | null = null, user = id(10), tenant = id(1)) =>
      (await db.query<{ result: any }>('select public.platform_server_redream_agent_context($1,$2,$3,$4) result', [tenant, user, kind, record])).rows[0].result;

    await t.test('admin receives recorded evidence with provenance and only their own tasks', async () => {
      const result = await context('player', id(20));
      assert.equal(result.player.current_club, 'Recorded FC');
      assert.equal(result.player.contract_expiry, '2027-06-30');
      assert.equal(result.player.private_future_field, undefined);
      assert.equal(result.career[0].goals, 0);
      assert.equal(result.career[0].source_url, 'https://example.org/official-stats');
      assert.equal(result.recent_interactions[0].confidence, 0.4);
      assert.equal(result.recent_interactions[0].raw_private_payload, undefined);
      assert.deepEqual(result.my_tasks.map((x: any) => x.title), ['My open task']);
    });
    await t.test('assigned staff receive football fields without contract or relationship history', async () => {
      const result = await context('player', id(20), id(11));
      assert.equal(result.player.current_club, 'Recorded FC');
      assert.equal(result.player.contract_expiry, undefined);
      assert.equal(result.player.next_action, undefined);
      assert.equal(result.player.transfermarkt_market_value, undefined);
      assert.equal(result.recent_interactions, undefined);
      assert.deepEqual(result.my_tasks.map((x: any) => x.title), ['Other owner secret']);
      assert.equal(await context('player', id(21), id(11)), null);
      assert.equal(await context('player', id(22)), null);
    });
    await t.test('club, contact and recruitment reads stay scoped and exclude unlisted fields', async () => {
      const club = await context('club', id(40));
      assert.equal(club.needs[0].salary_budget, 2500);
      assert.equal(club.club.private_future_field, undefined);
      const staffClub = await context('club', id(40), id(11));
      assert.equal(staffClub.club.name, 'Example FC');
      assert.equal(staffClub.recent_interactions, undefined);
      assert.equal(staffClub.needs, undefined);
      const contact = await context('contact', id(50));
      assert.equal(contact.employments[0].role_title, 'Director');
      assert.equal(contact.organisations[0].name, 'Example FC');
      assert.equal((await context('contact', id(50), id(11))).recent_interactions, undefined);
      assert.equal(await context('club', id(41)), null);
      const recruitment = await context('recruitment', id(30), id(11));
      assert.equal(recruitment.recruitment.notes, 'Recorded recruitment note');
      assert.equal(recruitment.recruitment.private_future_field, undefined);
    });
    await t.test('commercial records remain admin-only', async () => {
      assert.equal((await context('opportunity', id(70))).opportunity.salary_budget, 2500);
      assert.equal((await context('deal', id(80))).deal.expected_commission, 1000);
      await assert.rejects(context('opportunity', id(70), id(11)), /agency_admin_access_required/);
      await assert.rejects(context('deal', id(80), id(11)), /agency_admin_access_required/);
    });
    await t.test('older staging interaction tables still allow record reads', async () => {
      await db.exec('alter table djm_os.interactions drop column player_id');
      assert.equal((await context('player', id(20))).player.current_club, 'Recorded FC');
      assert.equal((await context('club', id(40))).recent_interactions.length, 1);
    });
    await t.test('membership, task ownership, lifecycle and result bounds are enforced inside the database', async () => {
      assert.deepEqual((await context('tasks')).tasks.map((x: any) => x.title), ['My open task']);
      for (const user of [id(12), id(13), id(99)]) await assert.rejects(context('tasks', null, user), /staff_tenant_access_required/);
      await assert.rejects(context('tasks', null, id(10), id(2)), /staff_tenant_access_required/);
      await assert.rejects(context('unknown'), /unsupported_record_kind/);
      await db.query("insert into djm_os.tasks(id,tenant_id,owner_user_id,title,status,created_at) select ('00000000-0000-0000-0000-'||lpad((1000+g)::text,12,'0'))::uuid,$1,$2,'Bounded task '||g,'open',now() from generate_series(1,30) g", [id(1), id(10)]);
      assert.equal((await context('tasks')).tasks.length, 12);
    });
    await t.test('browser roles cannot invoke the reader or its projection helper', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec('set role ' + role);
        await assert.rejects(context('tasks'), /permission denied for function/);
        await assert.rejects(db.query("select private.redream_agent_fields('{}'::jsonb,array['id'])"), /permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role');
      assert.equal((await context('tasks')).tasks.length, 12);
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});
