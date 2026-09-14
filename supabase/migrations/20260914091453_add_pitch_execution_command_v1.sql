create or replace function public.platform_server_pitch_execution_command(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select
    s.id share_id,s.player_id,s.opportunity_id,s.organisation_id,s.pitch_status,s.active,s.expires_at,s.view_count,s.last_viewed_at,s.sent_at,s.created_at,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    o.name club_name,
    po.stage opportunity_stage,po.last_contacted_at,po.next_action,po.next_action_due,
    case
      when not s.active or s.revoked_at is not null then 'revoked'
      when s.expires_at is not null and s.expires_at<now() then 'expired'
      when s.sent_at is null then 'draft_not_sent'
      when coalesce(s.view_count,0)=0 or s.last_viewed_at is null then 'sent_no_recorded_open'
      when po.last_contacted_at is null or po.last_contacted_at<s.last_viewed_at then 'opened_since_last_recorded_contact'
      else 'contact_recorded_after_last_open'
    end execution_state
  from public.club_share_links s
  join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
  left join djm_os.organisations o on o.id=s.organisation_id and o.tenant_id=p_tenant_id
  left join public.player_opportunities po on po.id=s.opportunity_id and po.tenant_id=p_tenant_id
), ranked as (
  select b.*,row_number() over(order by
    case execution_state when 'opened_since_last_recorded_contact' then 1 when 'sent_no_recorded_open' then 2 when 'draft_not_sent' then 3 when 'contact_recorded_after_last_open' then 4 when 'expired' then 5 else 6 end,
    coalesce(last_viewed_at,sent_at,created_at) desc
  ) rn
  from base b
), summary as (
  select
    count(*)::int total_shares,
    count(*) filter(where sent_at is not null)::int sent_shares,
    count(*) filter(where coalesce(view_count,0)>0)::int shares_with_recorded_open,
    count(*) filter(where execution_state='opened_since_last_recorded_contact')::int opened_since_last_recorded_contact,
    count(*) filter(where execution_state='sent_no_recorded_open')::int sent_no_recorded_open,
    count(*) filter(where execution_state='draft_not_sent')::int drafts_not_sent
  from base
)
select jsonb_build_object(
  'available',true,
  'tenant_id',p_tenant_id,
  'generated_at',now(),
  'summary',(select to_jsonb(summary) from summary),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'rank',rn,
    'share_id',share_id,
    'player_id',player_id,
    'player_name',player_name,
    'organisation_id',organisation_id,
    'club_name',club_name,
    'opportunity_id',opportunity_id,
    'opportunity_stage',opportunity_stage,
    'pitch_status',pitch_status,
    'execution_state',execution_state,
    'sent_at',sent_at,
    'view_count',view_count,
    'last_viewed_at',last_viewed_at,
    'last_contacted_at',last_contacted_at,
    'next_action',next_action,
    'next_action_due',next_action_due,
    'expires_at',expires_at,
    'recommended_review',case
      when execution_state='opened_since_last_recorded_contact' then jsonb_build_object('instruction','Review whether a human follow-up is appropriate. A recorded open is not evidence of sporting interest.')
      when execution_state='sent_no_recorded_open' then jsonb_build_object('instruction','Keep the pitch visible in the execution queue. Use the recorded opportunity next-action date if one exists; DJM does not invent a follow-up deadline.')
      when execution_state='draft_not_sent' then jsonb_build_object('instruction','Review the pitch package and send only when the agent decides it is ready.')
      else null end
  ) order by rn) from ranked where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'opens','A recorded open means the share URL was viewed. It is not evidence of club interest, intent, decision-maker identity or transfer probability.',
    'views','Repeated views can come from the same person, forwarding, previews or automated systems; DJM does not treat view_count as unique people.',
    'follow_up','DJM does not invent a pitch follow-up deadline. Where an opportunity next_action_due exists, that recorded date remains authoritative.',
    'conversion','The command is execution telemetry, not a claim that pitches caused later deal outcomes.'
  )
);
$function$;

revoke all on function public.platform_server_pitch_execution_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pitch_execution_command(uuid,integer) to service_role;;
