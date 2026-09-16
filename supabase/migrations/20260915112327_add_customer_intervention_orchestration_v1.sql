create table if not exists platform.customer_intervention_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  intervention_key text not null,
  intervention_fingerprint text not null,
  event_type text not null check (event_type in ('contacted','note','follow_up')),
  channel text check (channel is null or channel in ('email','whatsapp','call','meeting','link','other')),
  note text check (note is null or char_length(note)<=2000),
  follow_up_at timestamptz,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_intervention_events_tenant_created_idx
  on platform.customer_intervention_events(tenant_id,created_at desc);
create index if not exists customer_intervention_events_fingerprint_idx
  on platform.customer_intervention_events(tenant_id,intervention_fingerprint,created_at desc);
create index if not exists customer_intervention_events_actor_idx
  on platform.customer_intervention_events(actor_user_id);

alter table platform.customer_intervention_events enable row level security;
revoke all on platform.customer_intervention_events from public,anon,authenticated,service_role;

create or replace function public.platform_server_customer_intervention_orchestration(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_intervention jsonb;
  v_key text;
  v_priority integer;
  v_fingerprint text;
  v_contact_count integer:=0;
  v_event_count integer:=0;
  v_last_contact_at timestamptz;
  v_last_event_at timestamptz;
  v_follow_up_at timestamptz;
  v_last_note text;
  v_playbook jsonb;
  v_available boolean:=false;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then return null; end if;

  v_intervention:=public.platform_server_customer_intervention(p_tenant_id);
  v_key:=coalesce(v_intervention->>'key','monitor_customer');
  v_priority:=coalesce((v_intervention->>'priority')::int,100);
  v_available:=v_priority<100 and v_key not in ('monitor_internal','monitor_customer');
  v_fingerprint:=pg_catalog.md5(pg_catalog.concat_ws('|',
    p_tenant_id::text,
    v_key,
    coalesce(v_intervention->>'responsible_party',''),
    coalesce(v_intervention->>'impact',''),
    coalesce(v_intervention->>'why',''),
    coalesce(v_intervention->>'operator_action','')
  ));

  select
    count(*)::int,
    count(*) filter(where e.event_type='contacted')::int,
    max(e.created_at),
    max(e.created_at) filter(where e.event_type='contacted')
  into v_event_count,v_contact_count,v_last_event_at,v_last_contact_at
  from platform.customer_intervention_events e
  where e.tenant_id=p_tenant_id and e.intervention_fingerprint=v_fingerprint;

  select e.follow_up_at into v_follow_up_at
  from platform.customer_intervention_events e
  where e.tenant_id=p_tenant_id
    and e.intervention_fingerprint=v_fingerprint
    and e.follow_up_at is not null
  order by e.created_at desc
  limit 1;

  select e.note into v_last_note
  from platform.customer_intervention_events e
  where e.tenant_id=p_tenant_id
    and e.intervention_fingerprint=v_fingerprint
    and nullif(pg_catalog.btrim(e.note),'') is not null
  order by e.created_at desc
  limit 1;

  v_playbook:=case v_key
    when 'resolve_customer_issue' then pg_catalog.jsonb_build_object(
      'goal','Restore a stable customer experience before asking the agency to continue activation.',
      'success_evidence','No major or critical customer incident remains unresolved.',
      'quick_action','incident',
      'steps',pg_catalog.jsonb_build_array('Confirm the incident owner and current customer impact.','Resolve or contain the issue and verify the affected workflow.','Only then resume onboarding or commercial follow-up.'),
      'customer_message_template','We are resolving the issue affecting your workspace before asking you to continue. We will confirm once the affected workflow is stable.'
    )
    when 'rescue_trial' then pg_catalog.jsonb_build_object(
      'goal','Protect a near-expiry trial by removing the single biggest blocker and reviewing real value.',
      'success_evidence','The main blocker is removed and a clear conversion or extension decision is recorded.',
      'quick_action','trial_rescue',
      'steps',pg_catalog.jsonb_build_array('Review launch readiness and first-value evidence before contacting the owner.','Remove the highest-impact blocker with the owner.','Make a deliberate convert, extend or stop decision based on observed value.'),
      'customer_message_template','Before your trial ends, let us review what is already working, remove the main blocker and confirm whether the workspace is delivering enough value to continue.'
    )
    when 'owner_access' then pg_catalog.jsonb_build_object(
      'goal','Get the accountable agency owner securely into the workspace.',
      'success_evidence','At least one active owner membership exists for the agency.',
      'quick_action','owner_invite',
      'steps',pg_catalog.jsonb_build_array('Confirm the correct owner email.','Generate or resend the secure owner invitation.','If the invite was opened but not accepted, contact the owner and remove the exact activation blocker.'),
      'customer_message_template','Your agency workspace is ready for owner activation. Please use the secure invitation link we sent. If you opened it and hit any issue, tell us where it stopped and we will remove the blocker.'
    )
    when 'owner_activation' then pg_catalog.jsonb_build_object(
      'goal','Get the accountable agency owner securely into the workspace.',
      'success_evidence','At least one active owner membership exists for the agency.',
      'quick_action','owner_invite',
      'steps',pg_catalog.jsonb_build_array('Confirm the correct owner email.','Generate or resend the secure owner invitation.','If the invite was opened but not accepted, contact the owner and remove the exact activation blocker.'),
      'customer_message_template','Your agency workspace is ready for owner activation. Please use the secure invitation link we sent. If you opened it and hit any issue, tell us where it stopped and we will remove the blocker.'
    )
    when 'brand_identity' then pg_catalog.jsonb_build_object(
      'goal','Make every customer-facing surface unmistakably belong to the agency.',
      'success_evidence','Agency display name, portal name, valid colours and support contact are configured.',
      'quick_action','branding',
      'steps',pg_catalog.jsonb_build_array('Confirm the agency-facing name and portal identity.','Set the approved colours, logo assets and support contact.','Preview the owner and player activation surfaces before launch.'),
      'customer_message_template',null
    )
    when 'privacy_profile' then pg_catalog.jsonb_build_object(
      'goal','Separate the agency legal identity from DJM and make player activation safe.',
      'success_evidence','Controller identity and a current effective player-facing privacy notice are configured for the tenant.',
      'quick_action','privacy',
      'steps',pg_catalog.jsonb_build_array('Ask the agency for its approved controller identity and privacy contact.','Record the published privacy notice URL and immutable notice version.','Verify player invite preflight becomes privacy-ready before launch.'),
      'customer_message_template','To activate player access, we need the agency-approved privacy details for your workspace: controller name, privacy contact if used, published privacy notice URL and current notice version. ReDream records what you provide; it does not draft or approve the legal notice.'
    )
    when 'workspace_route' then pg_catalog.jsonb_build_object(
      'goal','Give the agency a verified workspace address it can confidently share.',
      'success_evidence','A verified primary tenant hostname is active.',
      'quick_action','domain',
      'steps',pg_catalog.jsonb_build_array('Confirm the intended hostname.','Complete DNS and platform verification.','Make the verified hostname primary and test sign-in plus invitation routing.'),
      'customer_message_template',null
    )
    when 'first_player' then pg_catalog.jsonb_build_object(
      'goal','Put one real player into the workspace so the agency sees working value immediately.',
      'success_evidence','At least one real player record exists in the tenant.',
      'quick_action','assisted_import',
      'steps',pg_catalog.jsonb_build_array('Choose one representative real player rather than dummy data.','Load the minimum useful player record and verify the agency can work with it.','Use that record to prove the next live workflow before wider migration.'),
      'customer_message_template','To get working value quickly, let us load one real player into the workspace first. We can verify the workflow together before importing the wider roster.'
    )
    when 'load_roster' then pg_catalog.jsonb_build_object(
      'goal','Put one real player into the workspace so the agency sees working value immediately.',
      'success_evidence','At least one real player record exists in the tenant.',
      'quick_action','assisted_import',
      'steps',pg_catalog.jsonb_build_array('Choose one representative real player rather than dummy data.','Load the minimum useful player record and verify the agency can work with it.','Use that record to prove the next live workflow before wider migration.'),
      'customer_message_template','To get working value quickly, let us load one real player into the workspace first. We can verify the workflow together before importing the wider roster.'
    )
    when 'add_club_relationship' then pg_catalog.jsonb_build_object(
      'goal','Connect the roster to one real club relationship the agency already uses.',
      'success_evidence','At least one tenant-scoped club relationship exists.',
      'quick_action','agency_guidance',
      'steps',pg_catalog.jsonb_build_array('Pick one current club contact the owner actually speaks with.','Add the relationship with enough context to make follow-up useful.','Use it in the next live need, pitch or opportunity.'),
      'customer_message_template','Let us add one real club relationship you actively use. That gives us a live example for contacts, needs and follow-up rather than training on dummy data.'
    )
    when 'create_live_opportunity' then pg_catalog.jsonb_build_object(
      'goal','Prove the agency workflow on a commercially relevant live situation.',
      'success_evidence','At least one player opportunity or active club need exists.',
      'quick_action','agency_guidance',
      'steps',pg_catalog.jsonb_build_array('Choose a current club requirement or player opportunity.','Capture the real requirement, relationship and next action.','Use the workflow through at least one genuine follow-up.'),
      'customer_message_template','Let us capture one live club need or player opportunity you are already working on. That lets us prove the workflow on something commercially relevant.'
    )
    when 'complete_first_action' then pg_catalog.jsonb_build_object(
      'goal','Close the loop on one real agency action instead of only loading data.',
      'success_evidence','At least one tenant action is completed in the operating workflow.',
      'quick_action','agency_guidance',
      'steps',pg_catalog.jsonb_build_array('Choose the next action already attached to live work.','Complete it inside the workspace.','Confirm the resulting relationship, opportunity or player state is updated.'),
      'customer_message_template','The workspace already has live data. The next proof point is simple: complete one real follow-up inside it so the full operating loop is visible.'
    )
    when 'invite_team' then pg_catalog.jsonb_build_object(
      'goal','Move the agency from founder-only usage to a repeatable team workflow.',
      'success_evidence','More than one active non-player staff membership exists.',
      'quick_action','team',
      'steps',pg_catalog.jsonb_build_array('Choose the second staff member who will genuinely use the workspace.','Give them only the role and access they need.','Have them complete one real piece of agency work.'),
      'customer_message_template','The core workflow is working. The next useful step is to bring in one teammate who will genuinely use it, rather than inviting the whole agency at once.'
    )
    when 'use_intelligence' then pg_catalog.jsonb_build_object(
      'goal','Demonstrate one useful intelligence workflow without making AI the product.',
      'success_evidence','At least one tenant AI or intelligence usage event is recorded.',
      'quick_action','agency_guidance',
      'steps',pg_catalog.jsonb_build_array('Choose a real piece of agency work that benefits from assisted capture or analysis.','Use the intelligence feature on that work.','Confirm the output changed or accelerated an actual agency action.'),
      'customer_message_template','Your core workflow is already active. Now use the intelligence layer once on real work so we can judge whether it genuinely saves time or improves follow-up.'
    )
    when 'convert_trial' then pg_catalog.jsonb_build_object(
      'goal','Convert while the agency can see its own working value in the product.',
      'success_evidence','A deliberate commercial continuation decision is recorded and the customer is moved to the appropriate paid stage.',
      'quick_action','trial_conversion',
      'steps',pg_catalog.jsonb_build_array('Review first-value evidence and the workflows the owner actually used.','Tie the plan recommendation to the agency operating model, not feature quantity.','Agree the commercial continuation and update the customer lifecycle.'),
      'customer_message_template','Your workspace has reached first working value. Let us review the live workflow and agree the right plan for continuing.'
    )
    when 'move_to_live' then pg_catalog.jsonb_build_object(
      'goal','Move a genuinely ready and activated agency into live operation.',
      'success_evidence','The customer lifecycle is live after launch gates, first value and commercial setup are confirmed.',
      'quick_action','move_to_live',
      'steps',pg_catalog.jsonb_build_array('Confirm launch readiness is complete.','Confirm the owner has reached first working value and commercial setup is agreed.','Move the lifecycle to live and schedule the first operating review.'),
      'customer_message_template','Your workspace is ready and the core workflow is active. We can now move from setup into normal live operation and agree the first review point.'
    )
    when 'expansion_review' then pg_catalog.jsonb_build_object(
      'goal','Expand only where observed usage and operating needs justify more value.',
      'success_evidence','A documented expansion decision is tied to real capacity, workflow or service needs.',
      'quick_action','expansion_review',
      'steps',pg_catalog.jsonb_build_array('Review capacity, active workflows and recurring friction.','Identify one higher-value workflow or limit that matters to the customer.','Only propose expansion where the evidence supports it.'),
      'customer_message_template','Your workspace is operating well. I would like to review where the team is getting the most value and whether any additional workflow or capacity would materially help.'
    )
    else pg_catalog.jsonb_build_object(
      'goal','Remove the next recorded blocker without adding process for its own sake.',
      'success_evidence','The current evidence-derived intervention is no longer the next blocker.',
      'quick_action','review',
      'steps',pg_catalog.jsonb_build_array('Review the recorded blocker and owner.','Take the smallest action that can change the underlying evidence.','Refresh the customer state and move to the next real intervention.'),
      'customer_message_template',null
    )
  end;

  return pg_catalog.jsonb_build_object(
    'available',v_available,
    'intervention',v_intervention,
    'fingerprint',v_fingerprint,
    'playbook',v_playbook,
    'tracking',pg_catalog.jsonb_build_object(
      'event_count',v_event_count,
      'contact_count',v_contact_count,
      'last_event_at',v_last_event_at,
      'last_contact_at',v_last_contact_at,
      'follow_up_at',v_follow_up_at,
      'follow_up_due',(v_follow_up_at is not null and v_follow_up_at<=pg_catalog.now()),
      'last_note',v_last_note
    ),
    'truth_contract',pg_catalog.jsonb_build_object(
      'resolution','An intervention is never manually marked resolved. It stops being current only when the underlying customer evidence changes.',
      'contact','A contact event means an operator explicitly recorded that outreach happened. ReDream does not infer outreach from page views.',
      'legal','Privacy playbooks record agency-supplied legal identity and notice details. ReDream does not draft or approve legal wording.'
    )
  );
end;
$function$;

create or replace function public.platform_server_operator_record_intervention_event(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_channel text default null,
  p_note text default null,
  p_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event_type text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_event_type,'')));
  v_channel text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_channel,''))),'');
  v_note text:=nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
  v_current jsonb;
  v_intervention jsonb;
  v_fingerprint text;
  v_key text;
  v_event_id uuid;
begin
  if not exists(select 1 from platform.platform_admins where user_id=p_actor_user_id and status='active') then
    raise exception 'platform_operator_access_required';
  end if;
  if not exists(select 1 from platform.tenants where id=p_tenant_id) then raise exception 'tenant_not_found'; end if;
  if v_event_type not in ('contacted','note','follow_up') then raise exception 'invalid_intervention_event_type'; end if;
  if v_channel is not null and v_channel not in ('email','whatsapp','call','meeting','link','other') then raise exception 'invalid_intervention_channel'; end if;
  if v_note is not null and char_length(v_note)>2000 then raise exception 'intervention_note_too_long'; end if;
  if v_event_type='contacted' and v_channel is null then raise exception 'contact_channel_required'; end if;
  if v_event_type='follow_up' and p_follow_up_at is null then raise exception 'follow_up_at_required'; end if;
  if p_follow_up_at is not null and p_follow_up_at<pg_catalog.now()-interval '5 minutes' then raise exception 'follow_up_at_must_be_current_or_future'; end if;

  v_current:=public.platform_server_customer_intervention_orchestration(p_tenant_id);
  if not coalesce((v_current->>'available')::boolean,false) then raise exception 'no_active_customer_intervention'; end if;
  v_intervention:=v_current->'intervention';
  v_fingerprint:=v_current->>'fingerprint';
  v_key:=v_intervention->>'key';

  insert into platform.customer_intervention_events(
    tenant_id,intervention_key,intervention_fingerprint,event_type,channel,note,follow_up_at,actor_user_id,metadata
  ) values (
    p_tenant_id,v_key,v_fingerprint,v_event_type,v_channel,v_note,p_follow_up_at,p_actor_user_id,
    pg_catalog.jsonb_build_object('impact',v_intervention->>'impact','responsible_party',v_intervention->>'responsible_party')
  ) returning id into v_event_id;

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  ) values (
    p_tenant_id,p_actor_user_id,'user','platform.customer_intervention.event_recorded','customer_intervention',v_event_id::text,
    pg_catalog.jsonb_build_object('event_type',v_event_type,'channel',v_channel,'follow_up_at',p_follow_up_at,'intervention_key',v_key),
    pg_catalog.jsonb_build_object('source','platform_ops','intervention_fingerprint',v_fingerprint)
  );

  return public.platform_server_customer_intervention_orchestration(p_tenant_id);
end;
$function$;

create or replace function public.platform_server_operator_customer_detail(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when exists(select 1 from platform.tenants t0 where t0.id=p_tenant_id) then
    pg_catalog.jsonb_build_object(
      'tenant',(select to_jsonb(x) from (select t.id,t.slug,t.tenant_type,t.status,t.legal_name,t.metadata,t.created_at,t.updated_at from platform.tenants t where t.id=p_tenant_id) x),
      'branding',(select to_jsonb(x) from (select b.* from platform.tenant_branding b where b.tenant_id=p_tenant_id) x),
      'lifecycle',(select to_jsonb(x) from (select l.* from platform.tenant_customer_lifecycle l where l.tenant_id=p_tenant_id) x),
      'plan',(select to_jsonb(x) from (select a.plan_key,a.status,a.billing_mode,a.effective_from,a.effective_until,a.configuration from platform.tenant_plan_assignments a where a.tenant_id=p_tenant_id and a.status in ('trialing','active') order by a.effective_from desc limit 1) x),
      'activation_journey',public.platform_server_customer_activation(p_tenant_id),
      'go_live_readiness',public.platform_server_customer_go_live_readiness(p_tenant_id),
      'operator_intervention',public.platform_server_customer_intervention(p_tenant_id),
      'intervention_orchestration',public.platform_server_customer_intervention_orchestration(p_tenant_id),
      'privacy_readiness',public.platform_server_tenant_privacy_readiness(p_tenant_id),
      'domains',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.created_at) from (select d.id,d.hostname,d.domain_type,d.status,d.is_primary,d.verified_at,d.created_at from platform.tenant_domains d where d.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'owner_invites',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select i.id,i.email,case when i.status='pending' and i.expires_at<=pg_catalog.now() then 'expired' else i.status end status,i.expires_at,i.first_sent_at,i.last_sent_at,i.send_count,i.first_opened_at,i.last_opened_at,i.open_count,i.accepted_by,i.accepted_at,i.revoked_at,i.created_by,i.created_at from platform.tenant_owner_invites i where i.tenant_id=p_tenant_id order by i.created_at desc limit 20) x),'[]'::jsonb),
      'onboarding_tasks',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.sort_order) from (select o.task_key,o.category,o.title,o.description,o.status,o.required,o.sort_order,o.blocked_reason,o.completed_at from platform.tenant_onboarding_tasks o where o.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'memberships',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.joined_at) from (select m.user_id,m.role,m.status,m.is_primary,m.joined_at from platform.tenant_memberships m where m.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'feature_overrides',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.feature_key) from (select e.feature_key,e.enabled,e.source,e.configuration,e.valid_from,e.valid_until,e.updated_at from platform.tenant_entitlements e where e.tenant_id=p_tenant_id) x),'[]'::jsonb),
      'audit',coalesce((select pg_catalog.jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select a.id,a.actor_user_id,a.actor_kind,a.action,a.entity_type,a.entity_id,a.after_state,a.metadata,a.occurred_at from platform.audit_events a where a.tenant_id=p_tenant_id order by a.occurred_at desc limit 50) x),'[]'::jsonb)
    )
  else null end;
$function$;

revoke all on function public.platform_server_customer_intervention_orchestration(uuid) from public,anon,authenticated;
revoke all on function public.platform_server_operator_record_intervention_event(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_operator_customer_detail(uuid) from public,anon,authenticated;

grant execute on function public.platform_server_customer_intervention_orchestration(uuid) to service_role;
grant execute on function public.platform_server_operator_record_intervention_event(uuid,uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
