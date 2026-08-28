create or replace function djm_os.refresh_review_inbox()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_caps int:=0; v_claims int:=0;
begin
  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,capture_id,confidence,payload,status)
  select c.submitted_by,'capture_review',
         case when c.capture_type='image' then 'Review screenshot capture' when c.capture_type='audio' then 'Review voice capture' else 'Review captured item' end,
         coalesce(c.error_message,'Automatic extraction needs confirmation before it becomes trusted data.'),
         c.person_id,c.organisation_id,c.id,c.confidence,c.extracted_json,'open'
  from djm_os.captures c
  where c.status='needs_review'
  on conflict(capture_id,review_type) do nothing;
  get diagnostics v_caps=row_count;

  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,player_id,claim_id,confidence,payload,status)
  select coalesce(
           i.team_member_id,
           (select tm.user_id from djm_os.team_members tm where tm.is_active=true order by tm.created_at asc limit 1)
         ),
         'claim_review','Verify extracted intelligence',
         cl.claim_type||coalesce(': '||cl.claim_key,''),
         cl.person_id,cl.organisation_id,cl.player_id,cl.id,cl.confidence,cl.value_json,'open'
  from djm_os.claims cl
  left join djm_os.interactions i on i.id=cl.interaction_id
  where coalesce(cl.confidence,0)<0.8 and cl.last_verified_at is null
  on conflict(claim_id,review_type) do nothing;
  get diagnostics v_claims=row_count;

  return jsonb_build_object('captures_added',v_caps,'claims_added',v_claims);
end;
$function$;
