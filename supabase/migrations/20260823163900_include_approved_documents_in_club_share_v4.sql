create or replace function public.get_club_share(share_token uuid)
returns jsonb
language sql
stable security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'profile', to_jsonb(pp),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'document_type',d.document_type,'created_at',d.created_at) order by d.created_at desc)
      from public.player_documents d
      where d.player_id=s.player_id and d.club_shareable=true
    ), '[]'::jsonb)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id=s.player_id
  where s.token=share_token
    and s.active=true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published=true
  limit 1;
$$;
revoke all on function public.get_club_share(uuid) from public;
grant execute on function public.get_club_share(uuid) to anon, authenticated;
