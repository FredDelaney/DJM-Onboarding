alter table public.player_requests drop constraint if exists player_requests_request_type_check;
alter table public.player_requests add constraint player_requests_request_type_check check (request_type in ('action','information','document','video','checkin','message','signal'));

drop policy if exists "requests view" on public.player_requests;
create policy "requests view" on public.player_requests
for select to authenticated
using (
  private.is_admin()
  or (request_type not in ('message','signal') and private.can_view_sensitive_player(player_id))
);

drop policy if exists "requests update" on public.player_requests;
create policy "requests update" on public.player_requests
for update to authenticated
using (
  private.is_admin()
  or (request_type not in ('message','signal') and private.can_view_sensitive_player(player_id))
)
with check (
  private.is_admin()
  or (request_type not in ('message','signal') and private.can_view_sensitive_player(player_id))
);

create or replace function private.surface_checkin_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text;
  v_message text;
  v_existing uuid;
begin
  if nullif(trim(coalesce(new.support_request,'')),'') is not null then
    v_title := 'Check-in: player needs DJM';
    v_message := trim(new.support_request);
  elsif new.club_situation_changed then
    v_title := 'Check-in: club situation changed';
    v_message := nullif(trim(coalesce(new.club_situation_notes,'')),'');
  elsif new.availability_status in ('unavailable','limited') then
    v_title := 'Check-in: availability changed';
    v_message := 'Player marked availability as ' || new.availability_status;
  elsif new.fitness_status in ('injured','managing') then
    v_title := 'Check-in: fitness update';
    v_message := 'Player marked fitness as ' || replace(new.fitness_status,'_',' ');
  else
    return new;
  end if;

  select id into v_existing
  from public.player_requests
  where player_id=new.player_id
    and request_type='signal'
    and status='open'
    and title=v_title
    and created_at >= now()-interval '7 days'
  order by created_at desc limit 1;

  if v_existing is null then
    insert into public.player_requests(player_id,title,message,request_type,status,created_by)
    values (new.player_id,v_title,v_message,'signal','open',null);
  else
    update public.player_requests set message=v_message,updated_at=now() where id=v_existing;
  end if;
  return new;
end;
$$;
