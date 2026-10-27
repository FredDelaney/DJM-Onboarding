-- Add the saved field-review decision to the existing quiet Home group.
-- Preserve business admission, relevance, feedback and service boundaries.
do $home$
declare f oid:='public.platform_server_personal_home_commands(uuid,uuid,integer)'::regprocedure;
 original text;body text;old_fragment text;new_fragment text;
begin
 select prosrc into original from pg_proc where oid=f;
 if md5(original)<>'7fd36db2f038e41afe788a759272794f'
  or (select pg_get_userbyid(proowner)<>'postgres' or not prosecdef from pg_proc where oid=f)
  or has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute')
  or not has_function_privilege('service_role',f,'execute') then raise exception 'Unexpected personal Home review contract';end if;
 body:=original;
 for old_fragment,new_fragment in select * from (values
 ($match$    union all
    select p.id,null::uuid$match$,
  $replace$    union all
    select p.id,s.id,s.completed_at,'Player details suggested'::text,'A sourced player-details update is waiting for review.'::text
    from public.player_source_refreshes s join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
    where s.provider='agency_player_context_v1' and s.status='needs_review'
      and exists(select 1 from public.player_source_suggestions suggestion where suggestion.refresh_id=s.id and suggestion.player_id=p.id and suggestion.decision='pending')
    union all
    select p.id,null::uuid$replace$),
 ($match$else 'player_stats_review:'||review_id::text end$match$,
  $replace$when command_type='Player details suggested' then 'player_details_review:'||review_id::text else 'player_stats_review:'||review_id::text end$replace$),
 ($match$else 'Compare the sources, then accept, correct or reject the suggested figures.' end$match$,
  $replace$when command_type='Player details suggested' then 'Compare the sources, then choose which player details to use.' else 'Compare the sources, then accept, correct or reject the suggested figures.' end$replace$),
 ($match$else jsonb_build_object('stats_review_id',review_id) end$match$,
  $replace$when command_type='Player details suggested' then jsonb_build_object('details_review_id',review_id) else jsonb_build_object('stats_review_id',review_id) end$replace$),
 ($match$then 'Review player data' else 'Review suggested figures' end$match$,
  $replace$then 'Review player data' when command_type='Player details suggested' then 'Review player details' else 'Review suggested figures' end$replace$)
 ) changes(old_fragment,new_fragment) loop
  if length(body)-length(replace(body,old_fragment,''))<>length(old_fragment) then raise exception 'Unexpected personal review source anchor';end if;
  body:=replace(body,old_fragment,new_fragment);
 end loop;
 execute replace(pg_get_functiondef(f),original,body);
end;$home$;
