-- Supabase Auth inserts the user before applying admin app_metadata. During
-- that INSERT, verify the real invitation token against its private database
-- hash. Metadata role/kind claims never grant access; completion still checks
-- the token and grants only the recorded tenant membership.
do $repair$
declare
  v_definition text := pg_get_functiondef('private.handle_new_user()'::regprocedure);
  v_old_condition text := $old$if new.raw_app_meta_data->>'invitation_kind' = 'agency_staff' then$old$;
  v_new_condition text := $new$-- verified_staff_invite_token_at_auth_insert_v2
  if new.raw_app_meta_data->>'invitation_kind' = 'agency_staff'
     or nullif(new.raw_user_meta_data->>'staff_invite_token','') is not null then$new$;
  v_old_predicate text := $old$where i.id::text = new.raw_app_meta_data->>'staff_invite_id'
      and i.tenant_id::text = new.raw_app_meta_data->>'invited_tenant_id'$old$;
  v_new_predicate text := $new$where (
        (
          i.id::text = new.raw_app_meta_data->>'staff_invite_id'
          and i.tenant_id::text = new.raw_app_meta_data->>'invited_tenant_id'
          and new.raw_app_meta_data->>'invitation_kind' = 'agency_staff'
        )
        or (
          new.raw_user_meta_data->>'staff_invite_token' ~ '^[0-9a-fA-F]{64}$'
          and i.token_hash = pg_catalog.encode(extensions.digest(new.raw_user_meta_data->>'staff_invite_token','sha256'),'hex')
        )
      )$new$;
begin
  if position('verified_staff_invite_token_at_auth_insert_v2' in v_definition) > 0 then return; end if;
  if (length(v_definition)-length(replace(v_definition,v_old_condition,''))) <> length(v_old_condition)
     or (length(v_definition)-length(replace(v_definition,v_old_predicate,''))) <> length(v_old_predicate) then
    raise exception 'Unexpected staff signup definition; Auth INSERT repair was not applied';
  end if;
  execute replace(replace(v_definition,v_old_condition,v_new_condition),v_old_predicate,v_new_predicate);
end;
$repair$;
