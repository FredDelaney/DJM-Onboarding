begin;

-- Add the foreign-key support indexes identified by the live Supabase advisor.
-- These are additive and do not change application behaviour.
create index if not exists entity_links_created_by_idx
  on djm_os.entity_links (created_by);

create index if not exists league_benchmarks_updated_by_idx
  on djm_os.league_benchmarks (updated_by);

create index if not exists player_scorecards_updated_by_idx
  on djm_os.player_scorecards (updated_by);

create index if not exists club_share_links_organisation_id_idx
  on public.club_share_links (organisation_id);

create index if not exists club_share_links_source_person_id_idx
  on public.club_share_links (source_person_id);

-- The live invitation page uses validate_player_invite_v2.
-- Retire public execution of the older legacy validator to reduce redundant attack surface.
revoke execute on function public.validate_player_invite(uuid)
  from public, anon, authenticated;

commit;
