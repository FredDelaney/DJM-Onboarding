-- Run only against ReDream staging project ltvmopvarlnidiozvpow.
-- Synthetic records only; every insert/update/audit is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $canary$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ua uuid; ub uuid;
 pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
 obs uuid[]; extra uuid:=gen_random_uuid(); n integer; r jsonb; before_sources text; before_other jsonb;
begin
 if exists(select 1 from djm_os.change_observations where status='pending' and confidence<0.95)
 then raise exception 'Canary requires an isolated pending queue'; end if;
 select user_id into ua from platform.tenant_memberships where status='active' and role='owner' order by created_at limit 1;
 ub:=gen_random_uuid(); -- Denied caller only; do not create an auth account.
 if ua is null then raise exception 'Canary requires an existing staging owner'; end if;
 insert into platform.tenants(id,slug,status,metadata) values
 (a,'qa-programme-'||a,'active','{"synthetic":true}'),(b,'qa-programme-'||b,'active','{"synthetic":true}');
 insert into platform.tenant_memberships(tenant_id,user_id,role,status) values(a,ua,'owner','active'),(b,ua,'owner','ended');
 insert into platform.tenant_branding(tenant_id,display_name,portal_name,primary_color,accent_color,support_email)
 values(a,'Canary Agency A','Canary Portal A','#112233','#AABBCC','qa-a@example.test'),
 (b,'Canary Agency B','Canary Portal B','#223344','#BBCCDD','qa-b@example.test');
 insert into djm_os.people(id,tenant_id,full_name) values(pa,a,'Synthetic Contact'),(pb,b,'Synthetic Contact');
 insert into djm_os.scouting_prospects(id,tenant_id,full_name) values(sa,a,'Synthetic Prospect'),(sb,b,'Synthetic Prospect');
 with inserted as (
 insert into djm_os.change_observations(entity_type,entity_id,change_type,observed_value,confidence)
 values('person',pa,'club_changed','{"club":"Synthetic FC"}',0.8),('person',pb,'club_changed','{"club":"Synthetic FC"}',0.8),
 ('prospect',sa,'club_changed','{"club":"Synthetic FC"}',0.8),('prospect',sb,'club_changed','{"club":"Synthetic FC"}',0.8),
 ('prospect',gen_random_uuid(),'club_changed','{}',0.8) returning id
 ) select array_agg(id) into obs from inserted;
 select md5(jsonb_agg(to_jsonb(c) order by id)::text) into before_sources from djm_os.change_observations c where id=any(obs);
 perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
 set local role service_role;
 r:=djm_os.queue_change_review_items();
 if r<>jsonb_build_object('review_items',4,'skipped_unresolved',1,'busy',false) then raise exception 'Queue canary result %',r; end if;
 r:=djm_os.queue_change_review_items();
 if r<>jsonb_build_object('review_items',0,'skipped_unresolved',1,'busy',false) then raise exception 'Duplicate queue canary %',r; end if;
 reset role;
 if (select count(*) from djm_os.review_items where payload->>'change_observation_id'=any(obs::text[]) and tenant_id=a)<>2
 or (select count(*) from djm_os.review_items where payload->>'change_observation_id'=any(obs::text[]) and tenant_id=b)<>2
 then raise exception 'Queue routed a review to the wrong tenant'; end if;
 if before_sources is distinct from (select md5(jsonb_agg(to_jsonb(c) order by id)::text) from djm_os.change_observations c where id=any(obs))
 then raise exception 'Queue rewrote source observations'; end if;
 perform set_config('request.jwt.claim.sub',ua::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from djm_os.change_observations where id=any(obs);
 if n<>2 then raise exception 'Agency A observation boundary failed: %',n; end if;
 insert into djm_os.change_observations(id,entity_type,entity_id,change_type,observed_value) values(extra,'person',pa,'club_changed','{}');
 update djm_os.change_observations set observed_value='{"club":"Approved test"}' where id=extra;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Own observation update failed'; end if;
 begin
  update djm_os.change_observations set entity_id=pb where id=extra;
  raise exception 'Cross-tenant observation reassignment was accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into djm_os.change_observations(entity_type,entity_id,change_type,observed_value) values('person',pb,'club_changed','{}');
  raise exception 'Cross-tenant observation insert was accepted';
 exception when insufficient_privilege then null; end;
 delete from djm_os.change_observations where id=extra;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Own observation deletion failed'; end if;
 begin
  perform djm_os.queue_change_review_items(); raise exception 'Browser executed the server queue';
 exception when insufficient_privilege then null; end;
 begin
  perform public.platform_server_owner_update_branding(a,ua,'Browser','Browser','#112233','#AABBCC','browser@example.test');
  raise exception 'Browser executed the server branding writer';
 exception when insufficient_privilege then null; end;
 reset role;
 -- One real staging owner suffices: move only synthetic memberships between
 -- fixtures, and remove global-team status inside this rolled-back transaction.
 update platform.tenant_memberships set status='ended' where tenant_id=a and user_id=ua;
 update platform.tenant_memberships set status='active' where tenant_id=b and user_id=ua;
 update djm_os.team_members set is_active=false where user_id=ua;
 set local role authenticated;
 select count(*) into n from djm_os.change_observations where id=any(obs);
 if n<>2 then raise exception 'Independent agency B observation boundary failed: %',n; end if;
 reset role;
 update platform.tenant_memberships set role='player' where tenant_id=b and user_id=ua;
 set local role authenticated;
 select count(*) into n from djm_os.change_observations where id=any(obs);
 if n<>0 then raise exception 'A player received operational observations'; end if;
 reset role;
 update platform.tenant_memberships set role='owner',status='ended' where tenant_id=b and user_id=ua;
 set local role authenticated;
 select count(*) into n from djm_os.change_observations where id=any(obs);
 if n<>0 then raise exception 'Revoked staff received observations'; end if;
 reset role;
 update platform.tenant_memberships set status='active' where tenant_id=a and user_id=ua;
 select to_jsonb(x) into before_other from platform.tenant_branding x where tenant_id=b;
 set local role service_role;
 r:=public.platform_server_owner_update_branding(a,ua,' Updated Canary ',' Updated Portal ','#123abc','#45def0',' QA@EXAMPLE.TEST ');
 if r->>'display_name'<>'Updated Canary' or r->>'primary_color'<>'#123ABC' or r->>'support_email'<>'qa@example.test'
 then raise exception 'Owner branding normalization failed'; end if;
 begin
  perform public.platform_server_owner_update_branding(a,ub,'Wrong owner','Wrong owner','#123ABC','#45DEF0','qa@example.test');
  raise exception 'Cross-agency branding was accepted';
 exception when raise_exception then if sqlerrm<>'tenant_owner_access_required' then raise; end if; end;
 reset role;
 if before_other is distinct from (select to_jsonb(x) from platform.tenant_branding x where tenant_id=b)
 then raise exception 'Branding changed another agency'; end if;
 if (select count(*) from platform.audit_events where tenant_id=a and action='platform.owner.branding_updated')<>1
 then raise exception 'Branding audit event is missing or duplicated'; end if;
end;
$canary$;
rollback;
select 'PASS: two-agency queue routing, repeat call, unknown subject retention, unchanged evidence, RLS CRUD/foreign-write denial, independent staff, player/ended-membership denial, server-only queue/branding, owner branding/audit and rollback' as acceptance;
