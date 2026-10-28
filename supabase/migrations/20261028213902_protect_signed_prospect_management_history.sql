begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- A prospect can retain either canonical representation link. Preserve both.
do $patch$
declare spec record;fn regprocedure;body text;definition text;
begin
 for spec in select * from (values
  ('public.redream_entity_delete(text,uuid,boolean)','c28961d7f0b5b84a0566a95f713b8e77',
   ' return public.djm_delete_entity(p_entity_type,p_entity_id,p_confirm);',
   E' if p_entity_type=''recruitment_target'' and exists(select 1 from djm_os.scouting_prospects where id=p_entity_id and (linked_player_id is not null or signed_player_id is not null)) then\n  raise exception ''This player is linked to representation history. Archive the record instead.'' using errcode=''22023'';\n end if;\n return public.djm_delete_entity(p_entity_type,p_entity_id,p_confirm);'),
  ('public.redream_entity_action_preview(text,uuid)','f1b453418a4caffb3d8e1037026bec0f',
   'and not (p_entity_type=''recruitment_target'' and nullif(v_raw->>''linked_player_id'','''') is not null)',
   'and not (p_entity_type=''recruitment_target'' and (nullif(v_raw->>''linked_player_id'','''') is not null or exists(select 1 from djm_os.scouting_prospects where id=p_entity_id and tenant_id=v_tenant and signed_player_id is not null)))')
 ) x(signature,expected,old_text,new_text) loop
  fn:=to_regprocedure(spec.signature);
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid=fn;
  if fn is null or md5(body) is distinct from spec.expected or (length(body)-length(replace(body,spec.old_text,'')))<>length(spec.old_text) then
   raise exception 'Unreviewed representation guard %',spec.signature;
  end if;
  execute replace(definition,spec.old_text,spec.new_text);
 end loop;
end $patch$;
notify pgrst,'reload schema';
commit;
