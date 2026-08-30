grant execute on function private.djm_position_group(text) to authenticated, service_role;
grant execute on function private.djm_current_recency_weight(date) to authenticated, service_role;
grant execute on function private.djm_experience_recency_weight(date) to authenticated, service_role;
grant execute on function private.djm_position_performance_score(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function private.djm_age_performance_adjustment(integer,text,numeric) to authenticated, service_role;
grant execute on function private.djm_potential_age_adjustment(integer,text) to authenticated, service_role;

revoke execute on function private.djm_position_group(text) from anon, public;
revoke execute on function private.djm_current_recency_weight(date) from anon, public;
revoke execute on function private.djm_experience_recency_weight(date) from anon, public;
revoke execute on function private.djm_position_performance_score(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from anon, public;
revoke execute on function private.djm_age_performance_adjustment(integer,text,numeric) from anon, public;
revoke execute on function private.djm_potential_age_adjustment(integer,text) from anon, public;
