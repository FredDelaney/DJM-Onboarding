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
      and (
        nullif(trim(coalesce(s.email,'')),'') is not null
        or nullif(trim(coalesce(s.display_name,'')),'') is not null
      )
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


create or replace function public.platform_server_provider_contact_suggestions(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,12),50));
  v_count integer:=0;
  v_items jsonb:='[]'::jsonb;
  v_by_provider jsonb:='[]'::jsonb;
begin
  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  select count(*)::integer
  into v_count
  from private.redream_provider_contact_suggestion_rows(
    p_tenant_id,
    p_user_id
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',x.provider,
        'count',x.item_count
      )
      order by x.item_count desc,x.provider
    ),
    '[]'::jsonb
  )
  into v_by_provider
  from (
    select provider,count(*)::integer as item_count
    from private.redream_provider_contact_suggestion_rows(
      p_tenant_id,
      p_user_id
    )
    group by provider
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',x.provider,
        'external_contact_id',x.external_contact_id,
        'display_name',x.display_name,
        'email',x.email,
        'provider_organisation_name',
          x.provider_organisation_name,
        'provider_role_title',
          x.provider_role_title,
        'suggested_person_id',
          x.suggested_person_id,
        'suggested_person_name',
          x.suggested_person_name,
        'suggested_organisation_name',
          x.suggested_organisation_name,
        'suggested_role_title',
          x.suggested_role_title,
        'match_basis',x.match_basis
      )
      order by
        case x.match_basis
          when 'exact_email' then 0
          else 1
        end,
        lower(coalesce(x.display_name,x.email,'')),
        x.external_contact_id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select *
    from private.redream_provider_contact_suggestion_rows(
      p_tenant_id,
      p_user_id
    )
    order by
      case match_basis
        when 'exact_email' then 0
        else 1
      end,
      lower(coalesce(display_name,email,'')),
      external_contact_id
    limit v_limit
  ) x;

  return jsonb_build_object(
    'count',v_count,
    'by_provider',v_by_provider,
    'items',v_items,
    'truth_contract',jsonb_build_object(
      'suggestion',
        'A suggestion is a unique exact Network email or exact Network name match. It is not applied automatically.',
      'confirmation',
        'The signed-in agent must explicitly confirm each provider contact to Network person link.',
      'external_action',
        'Identity confirmation changes internal ReDream linkage only. It never sends an external message.'
    )
  );
end;
$function$;

create or replace function public.redream_provider_contact_suggestions(
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_tenant uuid:=private.redream_request_tenant();
begin
  if v_user is null then
    raise exception 'authentication_required'
      using errcode='42501';
  end if;

  return public.platform_server_provider_contact_suggestions(
    v_tenant,
    v_user,
    p_limit
  );
end;
$function$;

revoke all on function
  public.platform_server_provider_contact_suggestions(uuid,uuid,integer)
from public,anon,authenticated;

grant execute on function
  public.platform_server_provider_contact_suggestions(uuid,uuid,integer)
to postgres,service_role;

revoke all on function
  public.redream_provider_contact_suggestions(integer)
from public,anon;

grant execute on function
  public.redream_provider_contact_suggestions(integer)
to authenticated,service_role;


create or replace function public.platform_server_provider_email_reopen_unresolved(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_emails jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_item jsonb;
  v_external_message_id text;
  v_contact_email text;
  v_person_id uuid;
  v_deleted_id uuid;
  v_seen integer:=0;
  v_reopened integer:=0;
begin
  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from djm_os.provider_connections c
    where c.tenant_id=p_tenant_id
      and c.user_id=p_user_id
      and c.provider=v_provider
      and c.status='connected'
      and 'email'=any(c.capabilities)
  ) then
    raise exception 'provider_email_not_enabled';
  end if;

  if jsonb_typeof(coalesce(p_emails,'[]'::jsonb))<>'array' then
    raise exception 'emails_must_be_array';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_emails,'[]'::jsonb)
    )
  loop
    v_seen:=v_seen+1;

    v_external_message_id:=nullif(
      trim(coalesce(v_item->>'external_message_id','')),
      ''
    );

    v_contact_email:=nullif(
      lower(trim(coalesce(v_item->>'contact_email',''))),
      ''
    );

    if v_external_message_id is null
       or v_contact_email is null then
      continue;
    end if;

    v_person_id:=
      private.redream_provider_contact_person_for_email(
        p_tenant_id,
        p_user_id,
        v_provider,
        v_contact_email
      );

    if v_person_id is null then
      continue;
    end if;

    v_deleted_id:=null;

    delete from djm_os.provider_email_receipts r
    where r.tenant_id=p_tenant_id
      and r.user_id=p_user_id
      and r.provider=v_provider
      and r.external_message_id=v_external_message_id
      and r.capture_id is null
      and (
        r.person_id is null
        or r.person_id=v_person_id
      )
    returning r.id
    into v_deleted_id;

    if v_deleted_id is not null then
      v_reopened:=v_reopened+1;
    end if;
  end loop;

  if v_reopened>0 then
    insert into platform.audit_events(
      tenant_id,
      actor_user_id,
      actor_kind,
      action,
      entity_type,
      entity_id,
      after_state,
      metadata
    )
    values(
      p_tenant_id,
      p_user_id,
      'user',
      'platform.provider.email.identity_recovered',
      'provider_connection',
      v_provider,
      jsonb_build_object(
        'emails_seen',v_seen,
        'emails_reopened',v_reopened
      ),
      jsonb_build_object(
        'provider',v_provider,
        'source','connected_identity_recovery'
      )
    );
  end if;

  return jsonb_build_object(
    'provider',v_provider,
    'emails_seen',v_seen,
    'emails_reopened',v_reopened
  );
end;
$function$;

revoke all on function
  public.platform_server_provider_email_reopen_unresolved(
    uuid,uuid,text,jsonb
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_provider_email_reopen_unresolved(
    uuid,uuid,text,jsonb
  )
to postgres,service_role;

notify pgrst,'reload schema';

commit;
