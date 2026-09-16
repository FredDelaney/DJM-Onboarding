insert into platform.plan_features (plan_key, feature_key, enabled)
values ('enterprise', 'enterprise_dedicated_infrastructure', true)
on conflict (plan_key, feature_key) do update set
  enabled = true,
  updated_at = now();
