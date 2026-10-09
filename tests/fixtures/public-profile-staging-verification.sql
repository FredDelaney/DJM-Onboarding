begin;
do $qa$
declare
 t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid();
 own_user uuid:=gen_random_uuid(); admin_user uuid:=gen_random_uuid(); scout_user uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); share_id uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
 actor uuid; n integer; expected integer; denied boolean:=false; data jsonb;
begin
 insert into auth.users(id) values(own_user),(admin_user),(scout_user);
 insert into platform.tenants(id,slug,status) values(t1,'visibility-qa-'||t1::text,'active'),(t2,'visibility-qa-'||t2::text,'active');
 insert into platform.tenant_branding(tenant_id,display_name,support_email) values(t1,'Synthetic QA','qa@example.invalid'),(t2,'Synthetic foreign','qa@example.invalid');
 insert into platform.tenant_memberships(tenant_id,user_id,role) values(t1,admin_user,'owner'),(t1,scout_user,'scout');
 insert into public.players(id,tenant_id,user_id,first_name,last_name,verification_status,verified_at)
 values(p1,t1,own_user,'Synthetic','One','verified',now()),(p2,t2,null,'Synthetic','Foreign','verified',now());
 insert into public.staff_player_access(staff_user_id,player_id) values(scout_user,p1);
 insert into public.player_public_profiles(player_id,public_slug,published,display_name,contact_email,hidden_sections,why_review)
 values(p1,'visibility-qa-'||p1::text,true,'Approved QA Player','qa@example.invalid',array['why_review'],'SECRET_WHY'),
 (p2,'visibility-qa-'||p2::text,true,'Approved foreign QA','qa@example.invalid',array[]::text[],null);
 execute 'set local role anon';
 begin perform 1 from public.player_public_profiles where player_id=p1; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'anonymous raw read allowed'; end if;
 execute 'reset role';
 foreach actor in array array[own_user,admin_user,scout_user,gen_random_uuid()] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  expected:=case when actor in (own_user,admin_user,scout_user) then 1 else 0 end;
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in(p1,p2);
  if n<>expected then raise exception 'actor visibility mismatch % versus %',n,expected; end if;
  execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 update public.player_public_profiles set headline='Approved admin edit' where player_id=p1;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'admin edit denied'; end if;
 execute 'reset role';
 insert into public.club_share_links(id,player_id,token,expires_at) values(share_id,p1,token,now()+interval '1 day');
 data:=public.get_club_share(token);
 if data is null or data->'profile'->>'display_name'<>'Approved QA Player' or data::text like '%SECRET_WHY%' then raise exception 'public SQL projection failed'; end if;

 -- Existing assignment/membership gates must take effect immediately.
 update public.staff_player_access set staff_user_id=admin_user where staff_user_id=scout_user and player_id=p1;
 perform set_config('request.jwt.claim.sub',scout_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',scout_user,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.player_public_profiles where player_id=p1;
 if n<>0 then raise exception 'revoked scout retained access'; end if;
 execute 'reset role';
 update public.staff_player_access set staff_user_id=scout_user where staff_user_id=admin_user and player_id=p1;
 update platform.tenant_memberships set status='suspended' where tenant_id=t1 and user_id=scout_user;
 execute 'set local role authenticated';
 select count(*) into n from public.player_public_profiles where player_id=p1;
 if n<>0 then raise exception 'suspended scout retained access'; end if;
 update public.player_public_profiles set headline='Unauthorised edit' where player_id=p1;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'scout edited raw profile'; end if;
 execute 'reset role';
 update platform.tenant_memberships set status='active' where tenant_id=t1 and user_id=scout_user;
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user,'role','authenticated')::text,true);
 insert into public.player_documents(player_id,title,document_type,object_path,club_shareable)
 values(p1,'Approved CV','cv','qa/synthetic-cv',true),(p1,'SECRET_SENSITIVE',' VISA ','qa/synthetic-visa',true),
 (p1,'SECRET_UNAPPROVED','cv','qa/synthetic-unapproved',false),(p2,'SECRET_FOREIGN','cv','qa/synthetic-foreign',false);
 data:=public.get_club_share(token);
 if jsonb_array_length(data->'documents')<>1 or data::text like '%SECRET%' then raise exception 'document restriction failed'; end if;
 update public.club_share_links set active=false where id=share_id;
 if public.get_club_share(token) is not null then raise exception 'revoked token accepted'; end if;
 update public.club_share_links set active=true,expires_at=now()-interval '1 second' where id=share_id;
 if public.get_club_share(token) is not null then raise exception 'expired token accepted'; end if;
 update public.club_share_links set expires_at=now()+interval '1 day' where id=share_id;
 update public.player_public_profiles set published=false where player_id=p1;
 if public.get_club_share(token) is not null then raise exception 'unpublished profile accepted'; end if;
 perform set_config('request.jwt.claim.sub',own_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.player_public_profiles where player_id=p1;
 if n<>1 then raise exception 'own draft unreadable'; end if;
 update public.player_public_profiles set headline='Unauthorised player edit' where player_id=p1;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'own-player wrote admin snapshot'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user,'role','authenticated')::text,true);
 update public.player_public_profiles set published=true where player_id=p1;
 update public.players set verification_status='reviewing' where id=p1;
 if public.get_club_share(token) is not null then raise exception 'unverified profile accepted'; end if;
 update public.players set verification_status='verified',verified_at=now() where id=p1;
 update public.player_public_profiles set published=true where player_id=p1;
 update public.players set verified_at=null where id=p1;
 if public.get_club_share(token) is not null then raise exception 'missing verification timestamp accepted'; end if;
end;
$qa$;
rollback;
select 'PASS: hosted actor/assignment/membership/write policies, token eligibility, public redaction and document limits; synthetic fixtures rolled back' proof;