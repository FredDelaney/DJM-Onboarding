-- Staging only. Synthetic actors and rows, always rolled back.
begin;
do $qa$
declare n integer; payload jsonb; denied boolean := false;
begin
  if exists(select 1 from platform.tenants where id in ('90920261-0000-4000-8000-000000000001','90920261-0000-4000-8000-000000000002')) then raise exception 'fixture id collision'; end if;
  insert into auth.users(id,email,aud,role) values
    ('90920261-0000-4000-8000-000000000011','visibility-11@example.invalid','authenticated','authenticated'),
    ('90920261-0000-4000-8000-000000000012','visibility-12@example.invalid','authenticated','authenticated'),
    ('90920261-0000-4000-8000-000000000015','visibility-15@example.invalid','authenticated','authenticated'),
    ('90920261-0000-4000-8000-000000000016','visibility-16@example.invalid','authenticated','authenticated'),
    ('90920261-0000-4000-8000-000000000017','visibility-17@example.invalid','authenticated','authenticated');
  insert into platform.tenants(id,slug,status) values ('90920261-0000-4000-8000-000000000001','visibility-qa-90920261','active'),('90920261-0000-4000-8000-000000000002','visibility-qa-foreign-90920261','active');
  insert into platform.tenant_branding(tenant_id,display_name,support_email) values
    ('90920261-0000-4000-8000-000000000001','Synthetic QA','visibility-qa@example.invalid'),('90920261-0000-4000-8000-000000000002','Synthetic foreign QA','visibility-qa@example.invalid');
  insert into platform.tenant_memberships(tenant_id,user_id,role,status) values
    ('90920261-0000-4000-8000-000000000001','90920261-0000-4000-8000-000000000011','owner','active'),('90920261-0000-4000-8000-000000000001','90920261-0000-4000-8000-000000000012','scout','active'),('90920261-0000-4000-8000-000000000002','90920261-0000-4000-8000-000000000015','owner','active');
  insert into public.players(id,tenant_id,user_id,first_name,last_name,verification_status,verified_at) values
    ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000001','90920261-0000-4000-8000-000000000016','Synthetic QA','One','verified',now()),
    ('90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000001',null,'Synthetic QA','Two','verified',now()),
    ('90920261-0000-4000-8000-000000000023','90920261-0000-4000-8000-000000000002',null,'Synthetic QA','Foreign','verified',now());
  insert into public.staff_player_access(staff_user_id,player_id) values ('90920261-0000-4000-8000-000000000012','90920261-0000-4000-8000-000000000021');
  insert into public.player_public_profiles(player_id,public_slug,published,display_name,contact_email,hidden_sections,hide_market_value,why_review,career_summary,primary_video_url,selected_videos,notable_experience,key_stats) values
    ('90920261-0000-4000-8000-000000000021','visibility-qa-one-90920261',true,'Approved QA Player','visibility-qa@example.invalid',array['why_review','stats','summary','career','videos','experience'],true,'SECRET_WHY','SECRET_SUMMARY','https://example.invalid/SECRET_VIDEO','[{"url":"SECRET_VIDEO"}]','["SECRET_EXPERIENCE"]','[{"label":"SECRET_STATS","value":"1"}]'),
    ('90920261-0000-4000-8000-000000000022','visibility-qa-two-90920261',true,'Approved QA Two','visibility-qa@example.invalid',array[]::text[],true,null,null,null,'[]','[]','[]'),
    ('90920261-0000-4000-8000-000000000023','visibility-qa-foreign-90920261',true,'Approved QA Foreign','visibility-qa@example.invalid',array[]::text[],true,null,null,null,'[]','[]','[]');
  insert into public.club_share_links(id,player_id,token,active,expires_at) values ('90920261-0000-4000-8000-000000000061','90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000081',true,now()+interval '1 day');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.player_documents(id,player_id,title,document_type,object_path,club_shareable) values
    ('90920261-0000-4000-8000-000000000071','90920261-0000-4000-8000-000000000021','Approved CV','cv','qa/SECRET_STORAGE_PATH',true),
    ('90920261-0000-4000-8000-000000000072','90920261-0000-4000-8000-000000000021','SECRET_PASSPORT','passport','qa/SECRET_STORAGE_PATH',true),
    ('90920261-0000-4000-8000-000000000073','90920261-0000-4000-8000-000000000021','SECRET_PADDED_VISA',' VISA ','qa/SECRET_STORAGE_PATH',true),
    ('90920261-0000-4000-8000-000000000074','90920261-0000-4000-8000-000000000021','SECRET_UNAPPROVED','cv','qa/SECRET_STORAGE_PATH',false),
    ('90920261-0000-4000-8000-000000000075','90920261-0000-4000-8000-000000000023','SECRET_FOREIGN','cv','qa/SECRET_STORAGE_PATH',true);
  execute 'set local role anon';
  begin
    perform 1 from public.player_public_profiles where player_id='90920261-0000-4000-8000-000000000021';
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'anon raw read was allowed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000016',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000016","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000023');
  if n<>1 then raise exception 'actor 16 expected 1 rows, got %',n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000012',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000012","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000023');
  if n<>1 then raise exception 'actor 12 expected 1 rows, got %',n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000011',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000011","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000023');
  if n<>2 then raise exception 'actor 11 expected 2 rows, got %',n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000015',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000015","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000023');
  if n<>1 then raise exception 'actor 15 expected 1 rows, got %',n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000017',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000017","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id in ('90920261-0000-4000-8000-000000000021','90920261-0000-4000-8000-000000000022','90920261-0000-4000-8000-000000000023');
  if n<>0 then raise exception 'actor 17 expected 0 rows, got %',n; end if;
  execute 'reset role';
  delete from public.staff_player_access where staff_user_id='90920261-0000-4000-8000-000000000012' and player_id='90920261-0000-4000-8000-000000000021';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000012',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000012","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id='90920261-0000-4000-8000-000000000021';
  if n<>0 then raise exception 'revoked scout retained access'; end if;
  execute 'reset role';
  insert into public.staff_player_access(staff_user_id,player_id) values ('90920261-0000-4000-8000-000000000012','90920261-0000-4000-8000-000000000021');
  update platform.tenant_memberships set status='suspended' where tenant_id='90920261-0000-4000-8000-000000000001' and user_id='90920261-0000-4000-8000-000000000012';
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id='90920261-0000-4000-8000-000000000021';
  if n<>0 then raise exception 'suspended scout retained access'; end if;
  execute 'reset role';
  update platform.tenant_memberships set status='active' where tenant_id='90920261-0000-4000-8000-000000000001' and user_id='90920261-0000-4000-8000-000000000012';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000011',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000011","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.player_public_profiles set headline='Approved admin edit' where player_id='90920261-0000-4000-8000-000000000021';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'admin edit failed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000012',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000012","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.player_public_profiles set headline='Unauthorised edit' where player_id='90920261-0000-4000-8000-000000000021';
  get diagnostics n=row_count;
  if n<>0 then raise exception 'actor 12 edited another raw profile'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000016',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000016","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.player_public_profiles set headline='Unauthorised edit' where player_id='90920261-0000-4000-8000-000000000021';
  get diagnostics n=row_count;
  if n<>0 then raise exception 'actor 16 edited another raw profile'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000017',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000017","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.player_public_profiles set headline='Unauthorised edit' where player_id='90920261-0000-4000-8000-000000000021';
  get diagnostics n=row_count;
  if n<>0 then raise exception 'actor 17 edited another raw profile'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000015',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000015","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.player_public_profiles set headline='Unauthorised edit' where player_id='90920261-0000-4000-8000-000000000021';
  get diagnostics n=row_count;
  if n<>0 then raise exception 'actor 15 edited another raw profile'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000011',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000011","role":"authenticated"}',true);
  payload:=public.get_club_share('90920261-0000-4000-8000-000000000081');
  if payload is null or payload->'profile'->>'display_name'<>'Approved QA Player' then raise exception 'approved RPC unavailable'; end if;
  if payload::text like '%SECRET%' then raise exception 'hidden profile or document content leaked'; end if;
  if jsonb_array_length(payload->'documents')<>1 then raise exception 'document restriction changed'; end if;
  if (payload->'profile'->'key_stats')<>'[]'::jsonb or (payload->'profile'->'career_timeline')<>'[]'::jsonb then raise exception 'hidden arrays leaked'; end if;
  if public.get_club_share('90920261-0000-4000-8000-000000000082') is not null then raise exception 'unknown token accepted'; end if;
  update public.club_share_links set active=false where id='90920261-0000-4000-8000-000000000061';
  if public.get_club_share('90920261-0000-4000-8000-000000000081') is not null then raise exception 'revoked token accepted'; end if;
  update public.club_share_links set active=true,expires_at=now()-interval '1 second' where id='90920261-0000-4000-8000-000000000061';
  if public.get_club_share('90920261-0000-4000-8000-000000000081') is not null then raise exception 'expired token accepted'; end if;
  update public.club_share_links set expires_at=now()+interval '1 day' where id='90920261-0000-4000-8000-000000000061';
  update public.player_public_profiles set published=false where player_id='90920261-0000-4000-8000-000000000021';
  if public.get_club_share('90920261-0000-4000-8000-000000000081') is not null then raise exception 'unpublished profile accepted'; end if;
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000016',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000016","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into n from public.player_public_profiles where player_id='90920261-0000-4000-8000-000000000021';
  if n<>1 then raise exception 'own-player draft lost'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','90920261-0000-4000-8000-000000000011',true);
  perform set_config('request.jwt.claims','{"sub":"90920261-0000-4000-8000-000000000011","role":"authenticated"}',true);
  update public.player_public_profiles set published=true where player_id='90920261-0000-4000-8000-000000000021';
  update public.players set verification_status='reviewing' where id='90920261-0000-4000-8000-000000000021';
  if public.get_club_share('90920261-0000-4000-8000-000000000081') is not null then raise exception 'unverified accepted'; end if;
  update public.players set verification_status='verified',verified_at=now() where id='90920261-0000-4000-8000-000000000021';
  update public.player_public_profiles set published=true where player_id='90920261-0000-4000-8000-000000000021';
  update public.players set verified_at=null where id='90920261-0000-4000-8000-000000000021';
  if public.get_club_share('90920261-0000-4000-8000-000000000081') is not null then raise exception 'missing verification timestamp accepted'; end if;
end;
$qa$;
rollback;
select jsonb_build_object('result','PASS','scope','synthetic staging records; transaction rolled back; no live HTTP customer token or tracking RPC') proof;
