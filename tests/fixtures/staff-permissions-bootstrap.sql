
create schema auth;create schema platform;create schema private;create schema djm_os;
create role anon;create role authenticated;create role service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table platform.tenants(id uuid primary key,slug text,status text);
create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text,is_primary boolean default true);
create table djm_os.team_members(user_id uuid,is_active boolean,display_name text);
create table public.players(id uuid primary key default gen_random_uuid(),tenant_id uuid,user_id uuid,first_name text,last_name text,preferred_name text,
  primary_position text,current_club text,current_country text,contract_expiry date,transfermarkt_url text,football_status text default 'active',
  onboarding_status text,verification_status text,primary_staff_user_id uuid,archived_at timestamptz,updated_at timestamptz default now(),
  date_of_birth date,nationalities text[],preferred_foot text,secondary_positions text[],wyscout_url text,stats_url text,instagram_url text,
  agency_priority text,next_action text,next_action_due date,review_required_at timestamptz,review_reason text);
create table public.staff_player_access(staff_user_id uuid,player_id uuid,can_edit boolean,primary key(staff_user_id,player_id));
create table public.player_requests(id uuid primary key,player_id uuid,assigned_to_user_id uuid,status text,updated_at timestamptz);
create table djm_os.player_market_facts(player_id uuid primary key,salary_expectation text);
create table djm_os.player_evidence(id uuid primary key default gen_random_uuid(),player_id uuid,value_json jsonb);
create table djm_os.player_performance_snapshots(id uuid primary key default gen_random_uuid(),player_id uuid,value_json jsonb);
create table djm_os.deal_rooms(id uuid primary key,tenant_id uuid,title text,owner_user_id uuid,expected_commission numeric,status text,
  player_id uuid,organisation_id uuid,club_need_id uuid,next_action_at timestamptz,next_action_text text,updated_at timestamptz,archived_at timestamptz);
create table djm_os.club_needs(id uuid primary key,tenant_id uuid,salary_budget numeric,organisation_id uuid,title text,position text,archived_at timestamptz);
create table djm_os.organisations(id uuid primary key,tenant_id uuid,name text,country text,city text,league_name text,website_url text,
  organisation_type text,archived_at timestamptz,updated_at timestamptz default now());
create table djm_os.people(id uuid primary key,tenant_id uuid,full_name text,preferred_name text,country text,city text,photo_url text,linkedin_url text,person_type text,archived_at timestamptz);
create table djm_os.employments(id uuid primary key,tenant_id uuid,person_id uuid,organisation_id uuid,role_title text,department text,is_current boolean,started_on date,updated_at timestamptz,last_verified_at timestamptz,source_url text);
create table djm_os.contact_methods(id uuid primary key,tenant_id uuid,person_id uuid,channel text,value text,is_primary boolean,is_verified boolean,updated_at timestamptz,last_verified_at timestamptz);
create table djm_os.interactions(id uuid primary key default gen_random_uuid(),tenant_id uuid,team_member_id uuid,person_id uuid,occurred_at timestamptz,channel text,summary text,organisation_id uuid,direction text,source_type text,raw_text text,confidence numeric,created_at timestamptz default now());
create table djm_os.tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,title text,task_type text,owner_user_id uuid,person_id uuid,organisation_id uuid,
  player_id uuid,interaction_id uuid,club_need_id uuid,due_at timestamptz,status text,priority smallint,source text,created_at timestamptz,
  completed_at timestamptz,updated_at timestamptz,source_message_id uuid);
create table djm_os.meetings(id uuid primary key,tenant_id uuid,owner_user_id uuid,title text,starts_at timestamptz,ends_at timestamptz,timezone text,
  provider text,meeting_url text,status text,person_id uuid,organisation_id uuid);
create table platform.agency_action_proposals(id uuid primary key default gen_random_uuid(),tenant_id uuid,command_id text,command_type text,
  action_type text,target_type text,target_id uuid,risk_level text,approval_mode text,status text,title text,rationale text,proposed_payload jsonb,
  requested_by uuid,idempotency_key text,expires_at timestamptz default now()+interval '30 minutes',updated_at timestamptz default now(),
  result_target_type text,result_target_id uuid,verification_json jsonb,undo_supported boolean,approved_by uuid,
  created_at timestamptz default now(),applied_at timestamptz,undone_at timestamptz,error_message text);
create unique index proposal_retry on platform.agency_action_proposals(tenant_id,idempotency_key) where status in ('proposed','needs_input','applied');
create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,after_state jsonb,metadata jsonb);
create table djm_os.events(person_id uuid,organisation_id uuid,interaction_id uuid,tenant_id uuid,event_type text,actor_user_id uuid,player_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
create table platform.agency_command_feedback(tenant_id uuid,actor_user_id uuid,command_id text,feedback_type text,snoozed_until timestamptz,created_at timestamptz);
create table platform.tenant_branding(tenant_id uuid,display_name text);
create table djm_os.scouting_prospects(id uuid primary key,tenant_id uuid,full_name text,linked_player_id uuid,signed_player_id uuid,signed_at timestamptz,recruitment_stage text,
  date_of_birth date,nationality text,preferred_foot text,primary_position text,secondary_positions text[],current_club text,current_country text,
  contract_expiry date,transfermarkt_url text,wyscout_url text,stats_url text,instagram_url text,next_action_at timestamptz,updated_at timestamptz);
create table djm_os.football_intelligence_subjects(id uuid primary key,player_id uuid,prospect_id uuid);
create table djm_os.messaging_threads(id uuid primary key,tenant_id uuid,user_id uuid,provider text,external_thread_id text,participant_label text,
  bound_person_id uuid,bound_organisation_id uuid,bound_player_id uuid,bound_at timestamptz,bound_by uuid,updated_at timestamptz);
insert into platform.tenants values('00000000-0000-4000-8000-000000000001','agency','active'),('00000000-0000-4000-8000-000000000002','foreign','active');
insert into platform.tenant_memberships(tenant_id,user_id,status,role) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','active','owner'),('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','active','scout'),
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013','active','agent'),('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000014','active','operations'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011','active','scout'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000015','active','owner');
insert into djm_os.team_members values('00000000-0000-4000-8000-000000000011',true,'Owner'),('00000000-0000-4000-8000-000000000012',true,'Scout'),('00000000-0000-4000-8000-000000000013',true,'Agent'),('00000000-0000-4000-8000-000000000014',true,'Reader');
insert into public.players(id,tenant_id,first_name,last_name,current_club,primary_staff_user_id) values
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','Assigned','Football','Recorded FC','00000000-0000-4000-8000-000000000013'),
  ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','Unassigned','Football','Other FC','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000002','Foreign','Football','Foreign FC','00000000-0000-4000-8000-000000000015');
insert into public.staff_player_access values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000021',false),('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000021',true),('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000021',false);
insert into djm_os.player_market_facts values('00000000-0000-4000-8000-000000000021','SECRET_OWN'),('00000000-0000-4000-8000-000000000023','SECRET_FOREIGN');
insert into djm_os.player_evidence(player_id,value_json) values('00000000-0000-4000-8000-000000000021','{"apps":14}'),('00000000-0000-4000-8000-000000000022','{"apps":12}'),('00000000-0000-4000-8000-000000000023','{"apps":9}');
insert into djm_os.player_performance_snapshots(player_id,value_json) select player_id,value_json from djm_os.player_evidence;
insert into djm_os.deal_rooms(id,tenant_id,expected_commission,status) values('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000001',100,'active'),('00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000002',200,'active');
insert into djm_os.club_needs(id,tenant_id,salary_budget) values('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000001',100),('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000002',200);
insert into djm_os.organisations(id,tenant_id,name,country,organisation_type) values('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000001','Recorded Club','NZ','club'),('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000002','FOREIGN_CLUB','NZ','club');
insert into djm_os.people(id,tenant_id,full_name) values('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000001','Recorded Contact'),('00000000-0000-4000-8000-000000000052','00000000-0000-4000-8000-000000000002','FOREIGN_CONTACT');
insert into djm_os.employments(id,tenant_id,person_id,organisation_id,role_title,is_current) values('00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000041','Coach',true);
insert into djm_os.tasks(id,tenant_id,title,owner_user_id,person_id,status,due_at) values
  ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','Own follow-up','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000051','open',now()),
  ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001','SECRET_OTHER_TASK','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000051','open',now());
insert into djm_os.meetings values('00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013','Own meeting',now()+interval '1 hour',now()+interval '2 hours','UTC','manual','https://meeting.example.test','scheduled','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000041');
insert into djm_os.meetings values('00000000-0000-4000-8000-000000000062','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','SECRET_OTHER_MEETING',now()+interval '1 hour',now()+interval '2 hours','UTC','manual',null,'scheduled','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000041');
insert into djm_os.messaging_threads(id,tenant_id,user_id,provider,external_thread_id) values('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013','instagram','own-thread');
insert into djm_os.scouting_prospects(id,tenant_id,full_name,recruitment_stage,primary_position) values('00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000001','New Footballer','signed','CM');

create table djm_os.person_external_profiles(id uuid primary key,tenant_id uuid,person_id uuid,provider text,profile_url text,external_id text,is_primary boolean,is_verified boolean,updated_at timestamptz,last_verified_at timestamptz);
insert into djm_os.contact_methods(id,tenant_id,person_id,channel,value,is_primary,is_verified) values('00000000-0000-4000-8000-000000000094','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051','email','contact@example.test',true,true);
insert into djm_os.person_external_profiles(id,tenant_id,person_id,provider,profile_url,is_primary,is_verified) values('00000000-0000-4000-8000-000000000095','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051','transfermarkt','https://www.transfermarkt.com/contact',true,true);

create table djm_os.relationships(tenant_id uuid,team_member_id uuid,person_id uuid,strength_score smallint,access_score smallint,trust_score smallint,
  relationship_notes text,first_known_at timestamptz,last_meaningful_at timestamptz,updated_at timestamptz,unique(team_member_id,person_id));
insert into djm_os.relationships(tenant_id,team_member_id,person_id,relationship_notes) values(
'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000051','SECRET_OTHER_ROUTE');
insert into djm_os.people(id,tenant_id,full_name,person_type) values('00000000-0000-4000-8000-000000000053','00000000-0000-4000-8000-000000000001','SHADOW_PLAYER','player');
