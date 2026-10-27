import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const id = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
test('agency work brief reads actual record and responsibility boundaries', async (t) => {
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
        club_need_id uuid,title text,status text,due_at timestamptz,created_at timestamptz,archived_at timestamptz,private_future_field text);
      create table djm_os.club_needs(id uuid,tenant_id uuid,organisation_id uuid,title text,salary_budget numeric,updated_at timestamptz,archived_at timestamptz);
      create table djm_os.deal_rooms(id uuid,tenant_id uuid,title text,expected_commission numeric,status text,player_id uuid,source_person_id uuid,organisation_id uuid,prospect_id uuid,primary_blocker text,next_decision text,next_action_at timestamptz,archived_at timestamptz,private_future_field text);
    `);

    await db.exec(`
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function private.tell_request_tenant() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
 create function private.calendar_staff_tenant(uuid) returns uuid language plpgsql stable as $$begin
 if not private.user_has_staff_tenant_access($1,auth.uid()) then raise exception 'staff_tenant_access_required';end if;return $1;end;$$;
 create table public.profiles(id uuid,display_name text);
 create table public.notification_preferences(user_id uuid,timezone text);
 create table platform.calendar_tasks(id uuid,tenant_id uuid,owner_user_id uuid,title text,status text,due_at timestamptz,due_on date,archived_at timestamptz,responsible_user_ids uuid[]);
 create table platform.work_responsibilities(tenant_id uuid,work_kind text,work_id uuid,responsible_user_ids uuid[]);
 create function private.calendar_task_dto(platform.calendar_tasks) returns jsonb language sql stable as $$select jsonb_build_object('owner_user_id',$1.owner_user_id,'due_on',$1.due_on)$$;
 create function private.calendar_staff_active(uuid,uuid) returns boolean language sql stable as $$select private.user_has_staff_tenant_access($1,$2)$$;
 -- Search boundary has independent coverage. This narrow fixture supplies authorised and foreign matches to prove revalidation.
 create function public.platform_server_workspace_search(uuid,uuid,text,integer) returns jsonb language sql stable as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('kind','player','id',p.id,'title',concat_ws(' ',p.first_name,p.last_name))),'[]'),'has_more',$3='truncated') from public.players p where p.first_name ilike '%'||$3||'%' or $3='truncated' $$;
 `);
    const shared = readFileSync(
      'supabase/migrations/20261012075754_agency_reminder_responsibility_v1.sql',
      'utf8',
    );
    // Load the existing implementations, excluding unrelated write APIs and schema.
    await db.exec(
      shared.slice(
        shared.indexOf('create function private.responsibility_work'),
        shared.indexOf('create function public.redream_work_responsibility_v1'),
      ),
    );
    await db.exec(
      shared.slice(
        shared.indexOf('create function public.redream_assigned_work_v1'),
        shared.indexOf('revoke all on function private.responsibility_work'),
      ),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20261017173500_redream_agent_context.sql',
        'utf8',
      ),
    );
    const migration = readFileSync(
      'supabase/migrations/20261021045858_agency_work_brief.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.query(
      "insert into platform.tenants values($1,'active'),($2,'active')",
      [id(1), id(2)],
    );
    await db.query(
      "insert into platform.tenant_memberships values($1,$2,'owner','active'),($1,$3,'scout','active'),($1,$4,'player','active'),($1,$5,'agent','ended')",
      [id(1), id(10), id(11), id(12), id(13)],
    );
    await db.query(
      "insert into public.profiles values($1,'Agency Owner'),($2,'Assigned Scout')",
      [id(10), id(11)],
    );
    await db.query(
      "insert into public.notification_preferences values($1,'Europe/Rome')",
      [id(10)],
    );
    await db.query(
      "insert into public.players(id,tenant_id,first_name,last_name,private_future_field) values($1,$2,'Dylan','Example','Never expose'),($3,$4,'Dylan','Foreign','Never expose'),($5,$2,'Dylan','Second',null),($6,$2,'Unassigned','Player',null)",
      [id(20), id(1), id(21), id(2), id(22), id(23)],
    );
    await db.query('insert into public.staff_player_access values($1,$2)', [
      id(20),
      id(11),
    ]);
    await db.query(
      "insert into djm_os.scouting_prospects(id,tenant_id,full_name,notes) values($1,$2,'New Prospect','Recorded recruitment conversation')",
      [id(35), id(1)],
    );
    await db.query(
      "insert into djm_os.people(id,tenant_id,full_name,person_type) values($1,$2,'James Example','contact')",
      [id(30), id(1)],
    );
    await db.query(
      "insert into djm_os.interactions(id,tenant_id,player_id,person_id,summary,occurred_at,source_type,confidence,raw_private_payload) values($1,$2,$3,$4,'Reported agreement: request club feedback',now(),'reported',0.4,'Hidden raw prompt')",
      [id(40), id(1), id(20), id(30)],
    );
    await db.query(
      "insert into djm_os.deal_rooms(id,tenant_id,title,player_id,status,primary_blocker,next_decision,expected_commission,private_future_field) values($1,$2,'Example move',$3,'active','Waiting for club feedback','Confirm next conversation',9000,'Never expose')",
      [id(50), id(1), id(20)],
    );
    await db.query(
      "insert into djm_os.tasks(id,tenant_id,owner_user_id,player_id,title,status,due_at) values($1,$2,$3,$4,'Owned linked work','open',now()-interval '1 day'),($5,$2,$6,$4,'Shared linked work','open',null),($7,$2,$6,$4,'Private colleague task','open',null),($8,$9,$3,$4,'Foreign task','open',null),($10,$2,$3,$4,'Completed task','completed',null)",
      [
        id(60),
        id(1),
        id(10),
        id(20),
        id(61),
        id(11),
        id(62),
        id(63),
        id(2),
        id(64),
      ],
    );
    await db.query(
      "insert into platform.calendar_tasks values($1,$2,$3,'Owned personal reminder','open',null,(now() at time zone 'Europe/Rome')::date,null,array[$3,$4]::uuid[]),($5,$2,$4,'Colleague personal reminder','open',null,null,null,array[$4]::uuid[])",
      [id(70), id(1), id(10), id(11), id(71)],
    );
    await db.query(
      "insert into platform.work_responsibilities values($1,'task',$2,array[$3,$4]::uuid[]),($1,'task',$5,array[$3,$4]::uuid[])",
      [id(1), id(60), id(10), id(11), id(61)],
    );
    const brief = async (
      kind: string | null = null,
      record: string | null = null,
      search: string | null = null,
      user: string | null = id(10),
      tenant = id(1),
    ) => {
      await db.query(
        "select set_config('test.user',$1,false),set_config('test.tenant',$2,false)",
        [user || '', tenant],
      );
      return (
        await db.query<{ result: any }>(
          'select public.redream_agency_work_brief_v1($1,$2,$3) result',
          [kind, record, search],
        )
      ).rows[0].result;
    };
    await t.test(
      'owned and shared work deduplicate without losing people or due dates',
      async () => {
        const b = await brief('player', id(20));
        assert.deepEqual(
          b.tasks.map((x: any) => x.title),
          ['Owned linked work', 'Shared linked work'],
        );
        assert.equal(b.tasks[0].overdue, true);
        assert.equal(b.tasks[0].shared, true);
        assert.equal(b.tasks[0].people.length, 2);
        assert.equal(b.tasks[1].owner_name, 'Assigned Scout');
        assert.equal(b.notes[0].confidence, 0.4);
        assert.equal(b.notes[0].source_type, 'reported');
        assert.equal(b.blockers[0].blocker, 'Waiting for club feedback');
        assert.doesNotMatch(
          JSON.stringify(b),
          /Never expose|Hidden raw|expected_commission|Foreign task|Private colleague|personal reminder|Completed task/,
        );
      },
    );
    await t.test(
      'global work includes only own or explicitly shared calendar tasks; date-only today is not overdue',
      async () => {
        const b = await brief();
        assert.equal(b.record, null);
        const calendar = b.tasks.find((x: any) => x.id === id(70));
        assert.ok(calendar);
        assert.equal(calendar.overdue, false);
        assert.equal(calendar.shared, true);
        assert.equal(b.tasks.filter((x: any) => x.id === id(70)).length, 1);
        assert.doesNotMatch(JSON.stringify(b), /Colleague personal reminder/);
      },
    );
    await t.test(
      'contact notes are recorded context and assigned staff do not receive internal notes or blockers',
      async () => {
        assert.equal(
          (await brief('recruitment', id(35))).notes[0].summary,
          'Recorded recruitment conversation',
        );
        assert.equal((await brief('contact', id(30))).notes.length, 1);
        const b = await brief('player', id(20), null, id(11));
        assert.equal(b.notes_visible, false);
        assert.deepEqual(b.notes, []);
        assert.deepEqual(b.blockers, []);
        assert.doesNotMatch(
          JSON.stringify(b),
          /Reported agreement|Waiting for club feedback/,
        );
      },
    );
    await t.test(
      'foreign, inaccessible and unauthenticated requests fail closed',
      async () => {
        for (const record of [id(21), id(23)])
          await assert.rejects(
            brief('player', record, null, id(11)),
            /record_access_denied/,
          );
        for (const user of [null, id(12), id(13), id(99)])
          await assert.rejects(
            brief(null, null, null, user),
            /staff_tenant_access_required/,
          );
        await assert.rejects(
          brief(null, null, null, id(10), id(2)),
          /staff_tenant_access_required/,
        );
      },
    );
    await t.test(
      'ambiguity and truncated search require explicit selection; foreign matches never escape',
      async () => {
        assert.equal((await brief(null, null, '')).mode, 'choose');
        const b = await brief(null, null, 'Dylan');
        assert.equal(b.mode, 'choose');
        assert.equal(b.candidates.length, 2);
        assert.ok(b.candidates.every((x: any) => x.id !== id(21)));
        assert.equal(b.tasks, undefined);
        const single = await brief(null, null, 'Dylan', id(11));
        assert.equal(single.record.id, id(20));
        assert.equal((await brief(null, null, 'truncated')).mode, 'choose');
        assert.equal((await brief(null, null, 'Nobody')).candidates.length, 0);
      },
    );
    await t.test(
      'a failing dependency is an error, never a fabricated empty work list',
      async () => {
        await db.exec(
          'alter table platform.work_responsibilities rename to responsibility_unavailable',
        );
        await assert.rejects(brief(), /does not exist/);
        await db.exec(
          'alter table platform.responsibility_unavailable rename to work_responsibilities',
        );
      },
    );
    await t.test(
      'larger selections are bounded and explicitly marked; future private columns are not exposed',
      async () => {
        await db.query(
          "insert into djm_os.tasks(id,tenant_id,owner_user_id,title,status) select ('00000000-0000-4000-8000-'||lpad((1000+g)::text,12,'0'))::uuid,$1,$2,'Bounded task '||g,'open' from generate_series(1,60) g",
          [id(1), id(10)],
        );
        const b = await brief();
        assert.equal(b.tasks.length, 40);
        assert.equal(b.limited, true);
      },
    );
    await t.test(
      'only authenticated callers can execute and cannot supply an actor or tenant argument',
      async () => {
        const grants = (
          await db.query<{ anon: boolean; authenticated: boolean }>(
            "select has_function_privilege('anon','public.redream_agency_work_brief_v1(text,uuid,text)','execute') anon,has_function_privilege('authenticated','public.redream_agency_work_brief_v1(text,uuid,text)','execute') authenticated",
          )
        ).rows[0];
        assert.deepEqual(grants, { anon: false, authenticated: true });
        await db.exec('set role authenticated');
        assert.equal((await brief()).mode, 'brief');
        await db.exec('reset role');
        await db.exec('set role anon');
        await assert.rejects(
          db.query('select public.redream_agency_work_brief_v1()'),
          /permission denied/,
        );
        await db.exec('reset role');
        assert.doesNotMatch(
          migration.slice(0, migration.indexOf('returns jsonb')),
          /p_user_id|p_tenant_id/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
