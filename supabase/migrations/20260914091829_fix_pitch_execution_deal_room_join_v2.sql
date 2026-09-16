create or replace function public.platform_server_pitch_execution_command(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with base as (
  select
    s.id share_id,s.player_id,s.opportunity_id deal_room_id,s.organisation_id,s.pitch_status,s.active,s.expires_at,s.view_count,s.last_viewed_at,s.sent_at,s.created_at,s.revoked_at,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    o.name club_name,
    d.stage deal_stage,d.status deal_status,d.next_action_text,d.next_action_at,d.pitch_status deal_pitch_status,
    case
      when not s.active or s.revoked_at is not null then 'revoked'
      when s.expires_at is not null and s.expires_at<now() then 'expired'
      when s.sent_at is null then 'draft_or_ready_not_confirmed_sent'
      when coalesce(s.view_count,0)=0 or s.last_viewed_at is null then 'sent_no_recorded_open'
      when d.id is not null and d.next_action_at is null then 'opened_no_recorded_deal_next_action'
      when d.id is not null and d.next_action_at is not null then 'opened_with_recorded_deal_next_action'
      else 'opened_no_linked_deal'
    end execution_state
  from public.club_share_links s
  join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
  left join djm_os.organisations o on o.id=s.organisation_id and o.tenant_id=p_tenant_id
  left join djm_os.deal_rooms d on d.id=s.opportunity_id and d.tenant_id=p_tenant_id
), ranked as (
  select b.*,row_number() over(order by
    case execution_state when 'opened_no_recorded_deal_next_action' then 1 when 'opened_no_linked_deal' then 2 when 'sent_no_recorded_open' then 3 when 'draft_or_ready_not_confirmed_sent' then 4 when 'opened_with_recorded_deal_next_action' then 5 when 'expired' then 6 else 7 end,
    coalesce(last_viewed_at,sent_at,created_at) desc
  ) rn
  from base b
), summary as (
  select
    count(*)::int total_shares,
    count(*) filter(where sent_at is not null)::int sent_shares,
    count(*) filter(where coalesce(view_count,0)>0)::int shares_with_recorded_open,
    count(*) filter(where execution_state='opened_no_recorded_deal_next_action')::int opened_without_deal_next_action,
    count(*) filter(where execution_state='sent_no_recorded_open')::int sent_no_recorded_open,
    count(*) filter(where execution_state='draft_or_ready_not_confirmed_sent')::int not_confirmed_sent
  from base
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',(select to_jsonb(summary) from summary),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'rank',rn,'share_id',share_id,'player_id',player_id,'player_name',player_name,'organisation_id',organisation_id,'club_name',club_name,
    'deal_room_id',deal_room_id,'deal_stage',deal_stage,'deal_status',deal_status,'pitch_status',pitch_status,'deal_pitch_status',deal_pitch_status,
    'execution_state',execution_state,'sent_at',sent_at,'view_count',view_count,'last_viewed_at',last_viewed_at,'next_action_text',next_action_text,'next_action_at',next_action_at,'expires_at',expires_at,
    'recommended_review',case
      when execution_state='opened_no_recorded_deal_next_action' then jsonb_build_object('api_action','deal_war_room','deal_room_id',deal_room_id,'instruction','The pitch was opened and the linked deal has no recorded next action. Decide the next move; the open itself is not evidence of interest.')
      when execution_state='opened_no_linked_deal' then jsonb_build_object('instruction','The pitch was opened but is not linked to a deal room. Decide whether this should become a tracked pursuit/deal before further follow-up.')
      when execution_state='sent_no_recorded_open' then jsonb_build_object('instruction','No open has been recorded. Follow the human-recorded deal next-action date if one exists; DJM does not invent a reminder.')
      when execution_state='draft_or_ready_not_confirmed_sent' then jsonb_build_object('instruction','The share has not been human-confirmed as sent. Do not treat it as external outreach yet.')
      else null end
  ) order by rn) from ranked where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'opens','A recorded open means the share URL was viewed. It is not evidence of club interest, intent, decision-maker identity or transfer probability.',
    'views','Repeated views can come from the same person, forwarding, previews or automated systems; DJM does not treat view_count as unique people.',
    'sent','A pitch is treated as sent only when sent_at was explicitly recorded. Creating or publishing a link is not the same as contacting a club.',
    'follow_up','DJM does not invent a pitch follow-up deadline. The linked deal next_action_at remains the authoritative recorded operating date.',
    'conversion','The command is execution telemetry, not a claim that pitches caused later deal outcomes.'
  )
);
$function$;

revoke all on function public.platform_server_pitch_execution_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pitch_execution_command(uuid,integer) to service_role;;
