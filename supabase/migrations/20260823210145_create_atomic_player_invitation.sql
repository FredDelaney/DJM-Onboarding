create or replace function public.create_player_invitation(invite_email text, player_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_email text := lower(trim(invite_email));
  v_name text := trim(coalesce(player_name,''));
  v_first text;
  v_last text;
  v_player_id uuid;
  v_token uuid;
  v_existing_user uuid;
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid player email is required';
  end if;

  select p.user_id, p.id into v_existing_user, v_player_id
  from public.players p
  join public.player_private pr on pr.player_id=p.id
  where lower(pr.personal_email)=v_email
  order by p.created_at desc
  limit 1;

  if v_existing_user is not null then
    raise exception 'This player already has an account';
  end if;

  select pi.token, pi.player_id into v_token, v_player_id
  from public.player_invites pi
  where lower(pi.email)=v_email and pi.status='pending' and pi.expires_at>now()
  order by pi.created_at desc
  limit 1;

  if v_token is not null then
    return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',true);
  end if;

  if v_player_id is null then
    v_first := nullif(split_part(v_name,' ',1),'');
    v_last := nullif(trim(substr(v_name,length(coalesce(v_first,''))+1)),'');
    insert into public.players(first_name,last_name,preferred_name,onboarding_status,agency_priority)
    values (v_first,v_last,coalesce(v_first,split_part(v_email,'@',1)),'not_started','normal')
    returning id into v_player_id;
    insert into public.player_private(player_id,personal_email)
    values (v_player_id,v_email);
    insert into public.player_cv_settings(player_id) values (v_player_id)
    on conflict (player_id) do nothing;
  end if;

  insert into public.player_invites(email,player_id,invited_by)
  values (v_email,v_player_id,auth.uid())
  returning token into v_token;

  return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',false);
end;
$$;
revoke all on function public.create_player_invitation(text,text) from public, anon;
grant execute on function public.create_player_invitation(text,text) to authenticated;
