begin;

create or replace function private.redream_email_interaction_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capture_id uuid;
  v_direction text;
begin
  if new.source_type <> 'tell_djm'
     or new.direction <> 'logged'
     or new.source_external_id is null
     or new.source_external_id not like 'tell:%' then
    return new;
  end if;

  begin
    v_capture_id :=
      split_part(
        new.source_external_id,
        ':',
        2
      )::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  select
    case
      when c.context_json
        ->> 'capture_origin' =
        'email'
       and c.context_json
        ->> 'email_direction'
        in (
          'inbound',
          'outbound'
        )
      then
        c.context_json
          ->> 'email_direction'
      else
        null
    end
  into
    v_direction
  from
    djm_os.captures c
  where
    c.id = v_capture_id
    and c.tenant_id =
      new.tenant_id
  limit 1;

  if v_direction is not null then
    new.direction :=
      v_direction;
  end if;

  return new;
end;
$function$;


drop trigger if exists
  redream_email_interaction_direction
on djm_os.interactions;

create trigger
  redream_email_interaction_direction
before insert or update of
  source_external_id,
  direction
on djm_os.interactions
for each row
execute function
  private.redream_email_interaction_direction();


update
  djm_os.interactions i
set
  direction =
    c.context_json
      ->> 'email_direction'
from
  djm_os.captures c
where
  i.tenant_id =
    c.tenant_id
  and i.source_type =
    'tell_djm'
  and i.direction =
    'logged'
  and i.source_external_id
    like
      'tell:' ||
      c.id::text ||
      ':%'
  and c.context_json
    ->> 'capture_origin' =
    'email'
  and c.context_json
    ->> 'email_direction'
    in (
      'inbound',
      'outbound'
    );


revoke all on function
  private.redream_email_interaction_direction()
from
  public,
  anon,
  authenticated;

notify pgrst, 'reload schema';

commit;
