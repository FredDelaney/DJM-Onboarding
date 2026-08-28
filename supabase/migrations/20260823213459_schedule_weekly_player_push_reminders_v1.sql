create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists private.push_scheduler_config (
  singleton boolean primary key default true check(singleton),
  secret text not null,
  updated_at timestamptz not null default now()
);

do $$
declare s text;
begin
  if not exists(select 1 from private.push_scheduler_config where singleton=true) then
    s := encode(gen_random_bytes(32),'hex');
    insert into private.push_scheduler_config(singleton,secret) values(true,s);
    perform vault.create_secret(s,'djm_push_cron_secret','DJM Player weekly push dispatcher secret');
  end if;
end $$;

create or replace function public.get_push_scheduler_secret()
returns text
language sql
stable
security definer
set search_path=private,pg_catalog
as $$ select secret from private.push_scheduler_config where singleton=true limit 1 $$;
revoke all on function public.get_push_scheduler_secret() from public,anon,authenticated;
grant execute on function public.get_push_scheduler_secret() to service_role;

create or replace function private.queue_weekly_checkin_reminders()
returns integer
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare inserted_count integer; current_week date := date_trunc('week',now())::date;
begin
  insert into public.notification_outbox(user_id,kind,title,body,url,payload)
  select p.user_id,
         'weekly_checkin',
         'Your weekly DJM check-in is ready',
         'It takes about 60 seconds. Keep DJM current on availability, fitness and anything that changed.',
         '/check-in',
         jsonb_build_object('player_id',p.id,'week_start',current_week)
  from public.players p
  left join public.notification_preferences np on np.user_id=p.user_id
  where p.user_id is not null
    and coalesce(np.weekly_checkin_reminders,true)
    and not exists (
      select 1 from public.weekly_checkins w
      where w.player_id=p.id and w.week_start=current_week
    )
    and not exists (
      select 1 from public.notification_outbox o
      where o.user_id=p.user_id
        and o.kind='weekly_checkin'
        and o.payload->>'week_start'=current_week::text
        and o.status in ('pending','sent','cancelled')
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function private.queue_weekly_checkin_reminders() from public,anon,authenticated;
grant execute on function private.queue_weekly_checkin_reminders() to service_role;

select cron.schedule(
  'djm-weekly-player-checkin-reminders',
  '0 8 * * 1',
  $$
    select private.queue_weekly_checkin_reminders();
    select net.http_post(
      url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)
      ),
      body:=jsonb_build_object('source','weekly-cron'),
      timeout_milliseconds:=10000
    );
  $$
);
