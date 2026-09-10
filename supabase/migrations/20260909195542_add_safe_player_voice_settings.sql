create or replace function public.djm_player_voice_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.user_id = auth.uid()
  ) then
    raise exception 'Player account required';
  end if;

  select jsonb_build_object(
    'enabled', coalesce(s.is_live, false),
    'max_audio_seconds', coalesce(s.max_audio_seconds, 240)
  )
  into v_result
  from djm_os.tell_djm_settings s
  where s.id = 1;

  return coalesce(v_result, jsonb_build_object('enabled', false, 'max_audio_seconds', 240));
end;
$$;

revoke all on function public.djm_player_voice_settings() from public;
grant execute on function public.djm_player_voice_settings() to authenticated;
