create or replace function private.player_is_currently_verified(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and p.verification_status = 'verified'
      and p.verified_at is not null
  );
$function$;

drop policy if exists "public profiles published anon" on public.player_public_profiles;
create policy "public profiles published anon"
on public.player_public_profiles
for select
to anon
using (
  published = true
  and private.player_is_currently_verified(player_id)
);

drop policy if exists "public profiles authenticated read" on public.player_public_profiles;
create policy "public profiles authenticated read"
on public.player_public_profiles
for select
to authenticated
using (
  (published = true and private.player_is_currently_verified(player_id))
  or private.can_view_player(player_id)
);

create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'profile', to_jsonb(pp),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'title', d.title,
          'document_type', d.document_type,
          'created_at', d.created_at
        )
        order by d.created_at desc
      )
      from public.player_documents d
      where d.player_id = s.player_id
        and d.club_shareable = true
    ), '[]'::jsonb)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  limit 1;
$function$;

create or replace function public.track_club_share_view(share_token uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  share_row public.club_share_links%rowtype;
begin
  select s.*
  into share_row
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  for update of s;

  if share_row.id is null then
    return false;
  end if;

  insert into public.club_share_views(share_id)
  values (share_row.id);

  update public.club_share_links
  set view_count = view_count + 1,
      last_viewed_at = now()
  where id = share_row.id;

  return true;
end;
$function$;
