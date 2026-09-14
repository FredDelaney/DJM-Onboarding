create or replace function public.platform_server_agency_home_executive(p_tenant_id uuid, p_command_limit integer default 5)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select public.platform_server_agency_home_full(p_tenant_id,p_command_limit)
         || jsonb_build_object(
              'strategic_plays',public.platform_server_agency_playbook(p_tenant_id,3),
              'pursuit_summary',public.platform_server_pursuit_board(p_tenant_id,20)->'summary',
              'deal_portfolio',public.platform_server_deal_portfolio_v2(p_tenant_id,5),
              'commercial_exposure_risk',public.platform_server_commercial_exposure_risk(p_tenant_id),
              'club_portfolio_summary',public.platform_server_club_accounts(p_tenant_id,50)->'summary',
              'evidence_risk',public.platform_server_evidence_risk_summary(p_tenant_id,3),
              'verification_queue',public.platform_server_verification_queue(p_tenant_id,3),
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$$;

create or replace function public.platform_server_agency_brief_executive(p_tenant_id uuid, p_window_hours integer default 24, p_decision_limit integer default 5)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  select public.platform_server_agency_brief_full(p_tenant_id,p_window_hours,p_decision_limit)
         || jsonb_build_object(
              'pursuit_board',public.platform_server_pursuit_board(p_tenant_id,10),
              'strategic_playbook',public.platform_server_agency_playbook(p_tenant_id,8),
              'deal_portfolio',public.platform_server_deal_portfolio_v2(p_tenant_id,20),
              'commercial_exposure_risk',public.platform_server_commercial_exposure_risk(p_tenant_id),
              'club_portfolio',public.platform_server_club_accounts(p_tenant_id,50),
              'evidence_risk',public.platform_server_evidence_risk_summary(p_tenant_id,10),
              'verification_queue',public.platform_server_verification_queue(p_tenant_id,10),
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$$;

revoke execute on function public.platform_server_agency_home_executive(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_home_executive(uuid,integer) to service_role;
revoke execute on function public.platform_server_agency_brief_executive(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_brief_executive(uuid,integer,integer) to service_role;;
