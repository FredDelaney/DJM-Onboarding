create table if not exists platform.club_pitch_responses (
  share_id uuid primary key references public.club_share_links(id) on delete cascade,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  response_type text not null check (response_type in ('request_conversation','request_information','not_now','decline')),
  message text,
  responder_name text,
  responder_email text,
  identity_status text not null default 'self_asserted_unverified' check (identity_status='self_asserted_unverified'),
  first_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submission_count integer not null default 1 check (submission_count>=1)
);
create index if not exists club_pitch_responses_tenant_time_idx on platform.club_pitch_responses(tenant_id,updated_at desc);
alter table platform.club_pitch_responses enable row level security;
revoke all on table platform.club_pitch_responses from anon,authenticated;
grant all on table platform.club_pitch_responses to service_role;

create or replace function public.platform_server_pitch_response_command(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select r.share_id,r.response_type,r.message,r.responder_name,r.responder_email,r.identity_status,r.first_submitted_at,r.updated_at,r.submission_count,
         s.player_id,s.organisation_id,s.opportunity_id deal_room_id,s.sent_at,s.last_viewed_at,
         coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
         o.name club_name,d.stage deal_stage,d.status deal_status,d.next_action_text,d.next_action_at
  from platform.club_pitch_responses r
  join public.club_share_links s on s.id=r.share_id
  join public.players p on p.id=s.player_id and p.tenant_id=r.tenant_id
  left join djm_os.organisations o on o.id=s.organisation_id and o.tenant_id=r.tenant_id
  left join djm_os.deal_rooms d on d.id=s.opportunity_id and d.tenant_id=r.tenant_id
  where r.tenant_id=p_tenant_id
), ranked as (
  select b.*,row_number() over(order by b.updated_at desc) rn from base b
), payload as (
  select rn,jsonb_build_object(
    'rank',rn,'share_id',share_id,'response_type',response_type,'message',message,
    'responder',jsonb_build_object('name',responder_name,'email',responder_email,'identity_status',identity_status),
    'first_submitted_at',first_submitted_at,'updated_at',updated_at,'submission_count',submission_count,
    'player_id',player_id,'player_name',player_name,'organisation_id',organisation_id,'club_name',club_name,
    'deal_room_id',deal_room_id,'deal_stage',deal_stage,'deal_status',deal_status,'next_action_text',next_action_text,'next_action_at',next_action_at,
    'agency_review',case response_type
      when 'request_conversation' then jsonb_build_object('instruction','A share-link holder explicitly requested a conversation. Review identity/context and decide the human response.')
      when 'request_information' then jsonb_build_object('instruction','A share-link holder explicitly requested more information. Review what can be shared safely before responding.')
      when 'not_now' then jsonb_build_object('instruction','A share-link holder submitted not now. Record the commercial implication without converting it automatically into a lost deal.')
      when 'decline' then jsonb_build_object('instruction','A share-link holder submitted decline. Review whether the linked pursuit/deal should be closed or retained; DJM will not change stage automatically.')
      else null end
  ) item
  from ranked
  where rn<=greatest(1,least(coalesce(p_limit,100),500))
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',jsonb_build_object(
    'responses',(select count(*) from base),
    'conversation_requests',(select count(*) from base where response_type='request_conversation'),
    'information_requests',(select count(*) from base where response_type='request_information'),
    'not_now',(select count(*) from base where response_type='not_now'),
    'declines',(select count(*) from base where response_type='decline')
  ),
  'items',coalesce((select jsonb_agg(item order by rn) from payload),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'identity','Responder name/email are self-asserted by a holder of the share link and are not identity-verified by DJM.',
    'meaning','These are explicit responses submitted through the pitch page, which are stronger evidence than page views but still require human context.',
    'stage','DJM does not automatically win, lose, advance or close a deal based on a share response.',
    'latest','The command shows the latest current response per share. Audit history preserves prior response changes.'
  )
);
$function$;

revoke all on function public.platform_server_pitch_response_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pitch_response_command(uuid,integer) to service_role;;
