begin;

create or replace function private.redream_provider_contact_suggestion_rows(
  p_tenant_id uuid,
  p_user_id uuid
)
returns table(
  provider text,
  external_contact_id text,
  display_name text,
  email text,
  provider_organisation_name text,
  provider_role_title text,
  suggested_person_id uuid,
  suggested_person_name text,
  suggested_organisation_name text,
  suggested_role_title text,
  match_basis text
)
language sql
stable
security definer
set search_path=''
as $function$
  with source_rows as (
    select
      s.provider,
      s.external_contact_id,
      s.display_name,
      s.email,
      s.organisation_name,
      s.role_title,
      s.updated_at
    from djm_os.provider_contact_sources s
    join djm_os.provider_connections c
      on c.tenant_id=s.tenant_id
     and c.user_id=s.user_id
     and c.provider=s.provider
     and c.status='connected'
     and 'contacts'=any(c.capabilities)
    where s.tenant_id=p_tenant_id
      and s.user_id=p_user_id
      and s.provider in ('google','microsoft')
      and s.is_deleted=false
      and s.person_id is null
      and nullif(
        lower(trim(coalesce(s.email,''))),
        ''
      ) is not null
  ),
  resolved as (
    select
      s.*,
      case
        when em.match_count=1 then em.person_id
        when nm.match_count=1 then nm.person_id
        else null
      end as matched_person_id,
      case
        when em.match_count=1 then 'exact_email'
        when nm.match_count=1 then 'exact_name'
        else null
      end as matched_basis
    from source_rows s
    left join lateral (
      select
        (array_agg(
          distinct cm.person_id
          order by cm.person_id
        ))[1] as person_id,
        count(distinct cm.person_id)::integer as match_count
      from djm_os.contact_methods cm
      join djm_os.people p
        on p.id=cm.person_id
       and p.tenant_id=p_tenant_id
      where cm.tenant_id=p_tenant_id
        and cm.channel='email'
        and coalesce(p.person_type,'contact')<>'player'
        and nullif(trim(coalesce(s.email,'')),'') is not null
        and lower(
          trim(
            coalesce(
              nullif(cm.normalised_value,''),
              cm.value
            )
          )
        )=lower(trim(s.email))
    ) em on true
    left join lateral (
      select
        (array_agg(
          distinct p.id
          order by p.id
        ))[1] as person_id,
        count(distinct p.id)::integer as match_count
      from djm_os.people p
      where p.tenant_id=p_tenant_id
        and coalesce(p.person_type,'contact')<>'player'
        and nullif(trim(coalesce(s.display_name,'')),'') is not null
        and regexp_replace(
          lower(trim(p.full_name)),
          '[^a-z0-9]+',
          '',
          'g'
        )=
        regexp_replace(
          lower(trim(s.display_name)),
          '[^a-z0-9]+',
          '',
          'g'
        )
    ) nm on true
  ),
  deduped as (
    select
      r.*,
      row_number() over(
        partition by
          r.provider,
          coalesce(
            nullif(lower(trim(r.email)),''),
            r.matched_person_id::text,
            r.external_contact_id
          )
        order by
          case r.matched_basis
            when 'exact_email' then 0
            else 1
          end,
          r.updated_at desc nulls last,
          r.external_contact_id
      ) as row_rank
    from resolved r
    where r.matched_person_id is not null
  )
  select
    d.provider,
    d.external_contact_id,
    d.display_name,
    d.email,
    d.organisation_name,
    d.role_title,
    d.matched_person_id,
    p.full_name,
    o.name,
    e.role_title,
    d.matched_basis
  from deduped d
  join djm_os.people p
    on p.id=d.matched_person_id
   and p.tenant_id=p_tenant_id
  left join lateral (
    select
      employment.organisation_id,
      employment.role_title
    from djm_os.employments employment
    where employment.tenant_id=p_tenant_id
      and employment.person_id=d.matched_person_id
      and employment.is_current=true
    order by
      employment.started_on desc nulls last,
      employment.updated_at desc,
      employment.id
    limit 1
  ) e on true
  left join djm_os.organisations o
    on o.id=e.organisation_id
   and o.tenant_id=p_tenant_id
  where d.row_rank=1
    and not exists(
      select 1
      from djm_os.provider_contact_sources linked_source
      where linked_source.tenant_id=p_tenant_id
        and linked_source.user_id=p_user_id
        and linked_source.provider=d.provider
        and linked_source.is_deleted=false
        and linked_source.person_id=d.matched_person_id
        and (
          (
            nullif(lower(trim(coalesce(d.email,''))),'') is not null
            and lower(trim(coalesce(linked_source.email,'')))=
              lower(trim(d.email))
          )
          or (
            nullif(
              regexp_replace(
                lower(trim(coalesce(d.display_name,''))),
                '[^a-z0-9]+',
                '',
                'g'
              ),
              ''
            ) is not null
            and regexp_replace(
              lower(trim(coalesce(linked_source.display_name,''))),
              '[^a-z0-9]+',
              '',
              'g'
            )=
            regexp_replace(
              lower(trim(d.display_name)),
              '[^a-z0-9]+',
              '',
              'g'
            )
          )
        )
    );
$function$;

revoke all on function
  private.redream_provider_contact_suggestion_rows(uuid,uuid)
from public,anon,authenticated;

grant execute on function
  private.redream_provider_contact_suggestion_rows(uuid,uuid)
to postgres,service_role;

notify pgrst,'reload schema';

commit;
