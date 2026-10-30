-- Keep absent operational assessments unknown instead of synthesising neutral 50s.
-- Forward-only read-model repair: no data, writer, RLS, owner or grant changes.
do $repair$
declare
 spec jsonb;patch jsonb;target oid;definition text;
 contract_before jsonb;contract_after jsonb;
begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.platform_server_career_aligned_pursuit_board(uuid,integer)') and md5(prosrc)='2fcffe58bc3af29f63becafc755e0728' and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then
  raise exception 'Unreviewed pursuit assessment career dependency';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.platform_server_agency_playbook(uuid,integer)') and md5(prosrc)='696152b5be22365b46e9368609569d78' and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then
  raise exception 'Unreviewed pursuit assessment playbook dependency';
 end if;
 for spec in select value from jsonb_array_elements($reviewed$
[
  {
    "signature": "public.platform_server_pursuit_readiness_core(uuid,uuid,uuid)",
    "hash": "a97d60ee266f67c4569d130da4f4731b",
    "patches": [
      [
        "v_football := coalesce(v_match.football_score,v_match.overall_score,50);",
        "v_football := v_match.football_score;"
      ],
      [
        "v_registration := coalesce(v_match.registration_score,50);",
        "v_registration := v_match.registration_score;"
      ],
      [
        "v_commercial := coalesce(v_match.commercial_score,50);",
        "v_commercial := v_match.commercial_score;"
      ],
      [
        "v_career := coalesce(v_match.career_score,50);",
        "v_career := v_match.career_score;"
      ],
      [
        "else least(80,40+coalesce(v_need.priority,3)*5)",
        "else null::numeric"
      ],
      [
        "if v_match.football_score is null and v_match.overall_score is null then",
        "if v_match.football_score is null then"
      ],
      [
        "v_completeness := round((1 - jsonb_array_length(v_missing)::numeric/5.0)*100,0);",
        "if v_demand is null then v_missing:=v_missing||jsonb_build_array('demand_certainty'); end if;\n  v_completeness := round((1 - jsonb_array_length(v_missing)::numeric/6.0)*100,0);"
      ],
      [
        "v_score := round(",
        "v_score := case when jsonb_array_length(v_missing)>0 then null else round("
      ],
      [
        ",0);\n\n  v_state := case",
        ",0) end;\n\n  v_state := case\n    when v_score is null then 'assessment_incomplete'"
      ],
      [
        "order by factor_score asc,factor_name",
        "order by factor_score asc nulls first,factor_name"
      ],
      [
        "case when v_match.football_score is not null then 'player_match.football_score' when v_match.overall_score is not null then 'player_match.overall_score' else 'neutral_default_missing' end",
        "case when v_match.football_score is not null then 'player_match.football_score' else 'not_recorded' end"
      ],
      [
        "case when v_match.registration_score is not null then 'player_match.registration_score' else 'neutral_default_missing' end",
        "case when v_match.registration_score is not null then 'player_match.registration_score' else 'not_recorded' end"
      ],
      [
        "case when v_match.commercial_score is not null then 'player_match.commercial_score' else 'neutral_default_missing' end",
        "case when v_match.commercial_score is not null then 'player_match.commercial_score' else 'not_recorded' end"
      ],
      [
        "case when v_match.career_score is not null then 'player_match.career_score' else 'neutral_default_missing' end",
        "case when v_match.career_score is not null then 'player_match.career_score' else 'not_recorded' end"
      ],
      [
        "Deterministic pursuit-readiness ranking for allocating agency effort. It is not a transfer probability, success probability or valuation.",
        "Only fully recorded factors produce an internal pursuit-readiness ranking. Missing assessments remain unknown; an aggregate match rating is not a football assessment. Readiness is not player quality, transfer probability, success probability or valuation."
      ]
    ]
  },
  {
    "signature": "public.platform_server_pursuit_readiness(uuid,uuid,uuid)",
    "hash": "0e626ce15abdba9e91fa3b1f7ada86fd",
    "patches": [
      [
        "when v_direct_score<60 and v_intro_score>=80",
        "when v_core->>'readiness_state'='assessment_incomplete' then 'review_recorded_assessments'\n    when v_direct_score<60 and v_intro_score>=80"
      ]
    ]
  },
  {
    "signature": "public.platform_server_pursuit_board(uuid,integer)",
    "hash": "553a7e9fdbf734828ea788687ffb8c5c",
    "patches": [
      [
        "(item->>'readiness_score')::numeric desc,item->'club'->>'name'",
        "(item->>'readiness_score')::numeric desc nulls last,item->'club'->>'name'"
      ],
      [
        "'strong_count',(select count(*)",
        "'incomplete_assessment_count',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'readiness_state'='assessment_incomplete'),\n      'strong_count',(select count(*)"
      ]
    ]
  },
  {
    "signature": "public.platform_server_pitch_readiness_command(uuid,integer)",
    "hash": "120cb7f187fd5b4048a16a9faed718f2",
    "patches": [
      [
        "'score',v_item->'readiness_score','state',v_item->'readiness_state'",
        "'score',v_item->'readiness_score','state',v_item->'readiness_state','missing_factors',v_item->'missing_factors'"
      ]
    ]
  },
  {
    "signature": "public.platform_server_agency_playbook_core(uuid,integer)",
    "hash": "4bc72365c6cb35991ae894f815a05ae3",
    "patches": [
      [
        "as play_id,\n      case\n        when item",
        "as play_id,\n      case\n        when item->>'readiness_state'='assessment_incomplete' then 'review_pursuit'\n        when item"
      ],
      [
        "as base_score,\n      case\n        when item",
        "as base_score,\n      case\n        when item->>'readiness_state'='assessment_incomplete' then 0\n        when item"
      ],
      [
        "as title,\n      case\n        when item",
        "as title,\n      case\n        when item->>'readiness_state'='assessment_incomplete' then 'Some player-club assessments are not recorded. Review the missing information before judging this pursuit.'\n        when item"
      ],
      [
        "end as rationale,\n      case\n        when item",
        "end as rationale,\n      case\n        when item->>'readiness_state'='assessment_incomplete' then 'Review the recorded assessments and confirm missing information before progressing the pitch.'\n        when item"
      ],
      [
        "  ), ranked as (\n    select *,least(100,base_score+policy_modifier) as play_score,\n           row_number() over(order by least(100,base_score+policy_modifier) desc,play_id) as play_rank\n    from combined\n",
        "  ), assessed as (\n    select *,case when base_score is null then null else least(100,base_score+policy_modifier) end as play_score\n    from combined\n  ), ranked as (\n    select *,row_number() over(order by play_score desc nulls last,play_id) as play_rank\n    from assessed\n"
      ]
    ]
  },
  {
    "signature": "public.platform_server_deal_advantage(uuid,uuid)",
    "hash": "6a269b7cb4d6ad13e18f20c1c0f3bfd4",
    "patches": [
      [
        "v_fit integer:=50;",
        "v_fit integer:=null;"
      ],
      [
        "begin if v_pursuit is not null then v_fit:=coalesce((v_pursuit->>'readiness_score')::integer,50); end if; exception when others then v_fit:=50; end;",
        "begin if v_pursuit is not null then v_fit:=(v_pursuit->>'readiness_score')::integer; end if; exception when others then v_fit:=null; end;"
      ],
      [
        "elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); end if;",
        "elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); elsif v_fit is null then v_unknowns:=v_unknowns||jsonb_build_array('pursuit_assessment_incomplete'); end if;"
      ],
      [
        "'state',case when v_score>=78",
        "'state',case when v_score is null then 'assessment_incomplete' when v_score>=78"
      ]
    ]
  },
  {
    "signature": "public.platform_server_deal_advantage_fast(uuid,uuid)",
    "hash": "2525e63b8cbc21111240d48a740f43e9",
    "patches": [
      [
        "v_fit integer:=50;",
        "v_fit integer:=null;"
      ],
      [
        "begin if v_pursuit is not null then v_fit:=coalesce((v_pursuit->>'readiness_score')::integer,50); end if; exception when others then v_fit:=50; end;",
        "begin if v_pursuit is not null then v_fit:=(v_pursuit->>'readiness_score')::integer; end if; exception when others then v_fit:=null; end;"
      ],
      [
        "elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); end if;",
        "elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); elsif v_fit is null then v_unknowns:=v_unknowns||jsonb_build_array('pursuit_assessment_incomplete'); end if;"
      ],
      [
        "'state',case when v_score>=78",
        "'state',case when v_score is null then 'assessment_incomplete' when v_score>=78"
      ]
    ]
  },
  {
    "signature": "public.platform_server_club_accounts(uuid,integer)",
    "hash": "011ee1baaffcb9ace5937195092bfa4e",
    "patches": [
      [
        "order by organisation_id,(play->>'play_score')::integer desc,(play->>'rank')::integer",
        "order by organisation_id,(play->>'play_score')::integer desc nulls last,(play->>'rank')::integer"
      ]
    ]
  }
]
$reviewed$::jsonb) loop
  target:=to_regprocedure(spec->>'signature');
  if target is null or not exists(select 1 from pg_proc where oid=target and md5(prosrc)=spec->>'hash' and prosecdef and provolatile='s' and proconfig=array['search_path=""'] and pg_get_userbyid(proowner)='postgres') then
   raise exception 'Unreviewed pursuit assessment source or security contract: %',spec->>'signature';
  end if;
  if has_function_privilege('anon',target,'execute') or has_function_privilege('authenticated',target,'execute') or not has_function_privilege('service_role',target,'execute') then
   raise exception 'Unreviewed pursuit assessment execution contract: %',spec->>'signature';
  end if;
  select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'mode',prosecdef,'path',proconfig,'volatility',provolatile,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)),pg_get_functiondef(oid) into contract_before,definition from pg_proc where oid=target;
  for patch in select value from jsonb_array_elements(spec->'patches') loop
   if (length(definition)-length(replace(definition,patch->>0,'')))/length(patch->>0)<>1 then
    raise exception 'Expected exactly one reviewed pursuit assessment fragment: %',spec->>'signature';
   end if;
   definition:=replace(definition,patch->>0,patch->>1);
  end loop;
  execute definition;
  select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'mode',prosecdef,'path',proconfig,'volatility',provolatile,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) into contract_after from pg_proc where oid=target;
  if contract_before is distinct from contract_after then raise exception 'Pursuit assessment metadata changed: %',spec->>'signature';end if;
 end loop;
end $repair$;
