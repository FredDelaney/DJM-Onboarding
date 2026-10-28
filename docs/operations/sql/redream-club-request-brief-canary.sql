-- Staging ltvmopvarlnidiozvpow only. Synthetic invited identities, no external send.
-- All records, memberships, events and audits are rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $canary$
declare ta uuid:=gen_random_uuid();tb uuid:=gen_random_uuid();u uuid:=gen_random_uuid();invite uuid:=gen_random_uuid();
 email text;result jsonb;reopened jsonb;listed jsonb;need uuid;version timestamptz;denied boolean;staff_role text;counts integer;
begin
 insert into platform.tenants(id,slug,status,metadata) values(ta,'qa-club-brief-'||ta,'active','{"synthetic":true}'),(tb,'qa-club-brief-'||tb,'active','{"synthetic":true}');
 email:='qa-club-brief-'||u||'@example.test';
 insert into platform.tenant_staff_invites(id,tenant_id,email,role,token_hash,expires_at,metadata) values(invite,ta,email,'agent',md5(invite::text)||md5(u::text),now()+interval '1 hour','{"synthetic":true}');
 insert into auth.users(id,email,role,aud,raw_app_meta_data,raw_user_meta_data) values(u,email,'authenticated','authenticated',jsonb_build_object('invitation_kind','agency_staff','staff_invite_id',invite,'invited_tenant_id',ta),'{"full_name":"Club Brief Canary"}');
 insert into platform.tenant_memberships(tenant_id,user_id,role,status) values(ta,u,'owner','active');
 if exists(select 1 from djm_os.team_members where user_id=u) then raise exception 'Global staff dependency';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-club-brief-'||ta)::text,true);
 set local role service_role;
 result:=public.platform_server_agency_create_club_need_brief(ta,u,jsonb_build_object('club_name','[QA rollback] Example FC','position','Striker','notes','Original €5,000 monthly striker request, 12 months plus optional 12.','brief',jsonb_build_object('salary_budget','5000','currency','EUR','salary_period','monthly','contract_months',12,'contract_guaranteed',true,'option_months',12,'transfer_type','free_agent','availability_notes','Join within two weeks','source_status','reported')));
 need:=(result->>'club_need_id')::uuid;
 reopened:=public.platform_server_workspace_need_record(ta,u,need);
 listed:=public.platform_server_demand_control_fast(ta,100);
 reset role;
 if result->>'brief_version'<>'1' or reopened#>>'{item,need,salary_budget}'<>'5000' or reopened#>>'{item,need,option_months}'<>'12' or reopened#>>'{item,need,source_status}'<>'reported' or reopened#>'{item,need,salary_tax_basis}'<>'null'::jsonb or listed#>>'{items,0,need,contract_months}'<>'12' then raise exception 'Create/reopen/list projection mismatch';end if;
 if (select confirmed_at from djm_os.club_needs where id=need) is not null then raise exception 'Reported request became verified';end if;
 version:=(reopened#>>'{item,need,updated_at}')::timestamptz;
 set local role authenticated;
 result:=public.redream_club_need_patch(need,version,'{"salary_budget":"5500","option_months":"6","profile_notes":"Corrected brief","expires_at":"2099-06-30"}');
 reset role;
 if result->>'brief_version'<>'1' or (select raw_request from djm_os.club_needs where id=need) not like 'Original%' or (select option_months from djm_os.club_needs where id=need)<>6 or (select salary_budget from djm_os.club_needs where id=need)<>5500 or (select expires_at::date from djm_os.club_needs where id=need)<>'2099-06-30'::date then raise exception 'Edit lost source or conditions';end if;
 -- Use a deliberately stale timestamp to avoid treating transaction-stable now() as a new release token.
 set local role authenticated;
 denied:=false;begin perform public.redream_club_need_patch(need,version-interval '1 second','{"salary_budget":"1"}');exception when others then denied:=true;end;
 if not denied then raise exception 'Stale edit admitted';end if;
 reset role;
 for staff_role in select unnest(array['agent','operations','scout','player']) loop
  update platform.tenant_memberships set role=staff_role where tenant_id=ta and user_id=u;
  set local role authenticated;
  denied:=false;begin perform public.redream_club_need_patch(need,version,'{"salary_budget":"1"}');exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Wrong role admitted: %',staff_role;end if;
  reset role;
 end loop;
 update platform.tenant_memberships set role='owner' where tenant_id=ta and user_id=u;
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-club-brief-'||tb)::text,true);
 set local role authenticated;
 denied:=false;begin perform public.redream_club_need_patch(need,version,'{"salary_budget":"1"}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-workspace browser edit admitted';end if;
 reset role;
 select count(*) into counts from djm_os.club_needs where tenant_id=ta;
 set local role service_role;
 denied:=false;begin perform public.platform_server_agency_create_club_need_brief(tb,u,'{"club_name":"Foreign FC","position":"Striker"}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign agency create admitted';end if;
 denied:=false;begin perform public.platform_server_agency_create_club_need_brief(ta,u,'{"club_name":"Invalid FC","position":"Striker","brief":{"salary_budget":"-1"}}');exception when others then denied:=true;end;
 if not denied then raise exception 'Invalid financial value admitted';end if;
 reset role;
 if (select count(*) from djm_os.club_needs where tenant_id=ta)<>counts or exists(select 1 from djm_os.organisations where tenant_id=ta and name='Invalid FC') then raise exception 'Rejected request left partial records';end if;
end $canary$;
select 'Club request create/list/reopen/edit and role canary passed; rolling back' result;
rollback;
