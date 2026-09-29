create index if not exists tenant_plan_change_requests_requested_by_user_idx
  on platform.tenant_plan_change_requests(requested_by_user_id);

create index if not exists tenant_plan_change_requests_from_plan_idx
  on platform.tenant_plan_change_requests(from_plan_key);

create index if not exists tenant_plan_change_requests_requested_plan_idx
  on platform.tenant_plan_change_requests(requested_plan_key);
