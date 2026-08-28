create or replace function private.queue_admin_inbound_notification()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare player_name text;
begin
  if new.request_type not in ('message','signal') then return new; end if;
  select coalesce(preferred_name,trim(concat_ws(' ',first_name,last_name)),'Player') into player_name from public.players where id=new.player_id;
  insert into public.notification_outbox(user_id,kind,title,body,url,payload)
  select pr.id,
         case when new.request_type='message' then 'player_message' else 'checkin_signal' end,
         case when new.request_type='message' then coalesce(player_name,'Player')||' messaged DJM' else coalesce(player_name,'Player')||' needs attention' end,
         case when new.request_type='message' then coalesce(new.player_reply,new.title) else coalesce(new.message,new.title) end,
         '/admin/players/'||new.player_id::text,
         jsonb_build_object('player_id',new.player_id,'request_id',new.id,'request_type',new.request_type)
  from public.profiles pr
  left join public.notification_preferences np on np.user_id=pr.id
  where pr.role='admin' and coalesce(np.player_requests,true);

  perform net.http_post(
    url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)
    ),
    body:=jsonb_build_object('source','inbound-player-attention','player_id',new.player_id),
    timeout_milliseconds:=10000
  );
  return new;
end;
$$;
drop trigger if exists queue_admin_inbound_notification on public.player_requests;
create trigger queue_admin_inbound_notification after insert on public.player_requests for each row execute function private.queue_admin_inbound_notification();
