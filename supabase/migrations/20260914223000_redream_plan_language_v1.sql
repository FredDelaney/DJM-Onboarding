update platform.plan_catalog
set metadata = jsonb_set(
  jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{positioning}',
    to_jsonb('The full agency operating system with intelligent capture, voice workflows and football intelligence'::text),
    true
  ),
  '{sales_anchor}',
  to_jsonb('Intelligent capture plus football intelligence plus custom domain'::text),
  true
),
updated_at = now()
where plan_key = 'pro';
