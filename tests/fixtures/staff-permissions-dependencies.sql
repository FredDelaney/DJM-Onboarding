
-- Dependency stubs deliberately throw if a restricted view retrieves private DTOs.
create function public.platform_server_execute_agency_action_core_v10(p_proposal_id uuid,p_actor_user_id uuid) returns jsonb language plpgsql as $$
declare p platform.agency_action_proposals%rowtype;begin select * into p from platform.agency_action_proposals where id=p_proposal_id;
update djm_os.tasks set status='completed' where id=p.target_id;return '{"applied":true}'::jsonb;end;$$;
create function public.platform_server_undo_agency_action_core_v10(p_proposal_id uuid,p_actor_user_id uuid) returns jsonb language plpgsql as $$
declare p platform.agency_action_proposals%rowtype;begin select * into p from platform.agency_action_proposals where id=p_proposal_id;
update djm_os.tasks set status='open' where id=p.target_id;return '{"undone":true}'::jsonb;end;$$;
create function public.platform_server_user_task_commands(p_tenant_id uuid,p_user_id uuid,p_limit integer) returns jsonb language sql as $$
select jsonb_build_object('commands',coalesce(jsonb_agg(jsonb_build_object(
'command_id','task:'||id,'command_type','Complete follow-up','source_type','task','source_id',id,'title',title,
'priority_score',80,'base_priority_score',80,'actionability',jsonb_build_object('mode','one_tap','risk_level','low','undo_expected',true),'evidence_health','{}'::jsonb)),'[]'::jsonb))
from djm_os.tasks where tenant_id=p_tenant_id and owner_user_id=p_user_id and status='open';$$;
create function public.platform_server_agency_decisions(uuid,integer) returns jsonb language sql as $$select '{"commands":[{"command_id":"private","source_type":"player","title":"SECRET_AGENCY","priority_score":99,"base_priority_score":99,"actionability":{}}]}'::jsonb$$;
create function public.platform_server_agency_home(uuid,integer) returns jsonb language plpgsql as $$begin raise exception 'private_context_retrieved';end;$$;
create function public.platform_server_autonomy_policy(uuid) returns jsonb language plpgsql as $$begin raise exception 'private_context_retrieved';end;$$;
create function public.platform_server_user_commitment_summary(uuid,uuid,integer) returns jsonb language sql as $$select '{"items":[]}'::jsonb$$;
create function public.platform_server_club_account(uuid,uuid) returns jsonb language plpgsql as $$begin raise exception 'private_context_retrieved';end;$$;
create function public.platform_server_relationship_person(uuid,uuid) returns jsonb language plpgsql as $$begin raise exception 'private_context_retrieved';end;$$;
grant usage on schema public,djm_os,private,auth to authenticated,service_role;
grant usage on schema platform to service_role;
grant select,insert,update,delete on all tables in schema djm_os to authenticated;
grant select on public.players,public.staff_player_access to authenticated;
grant select,insert,update,delete on all tables in schema public,platform,djm_os to service_role;

