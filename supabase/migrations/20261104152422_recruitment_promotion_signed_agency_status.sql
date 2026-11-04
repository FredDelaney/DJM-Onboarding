-- A recruitment target is only promoted after its stage is explicitly confirmed
-- as signed. Preserve the existing tenant / actor / staff-access checks and
-- explicitly set the canonical player agency status when that record is created.
--
-- Do not change the default for ordinary player creation, backfill historical
-- records, invent a player_agreements row, or widen function privileges.
DO $migration$
DECLARE
  v_original text;
  v_updated text;
  v_columns_old text := 'football_status,([[:space:]]*)onboarding_status,';
  v_columns_new text := 'football_status,[[:space:]]*agency_status,[[:space:]]*onboarding_status,';
  v_values_old text := '(''active'',)([[:space:]]*)(''not_started'',)';
  v_values_new text := '''active'',[[:space:]]*''signed'',[[:space:]]*''not_started'',';
BEGIN
  SELECT pg_get_functiondef(
    'public.platform_server_recruitment_promote_player(uuid,uuid,uuid)'::regprocedure
  ) INTO v_original;

  IF v_original IS NULL THEN
    RAISE EXCEPTION 'recruitment promotion writer is missing';
  END IF;

  -- Safe to rerun, but reject a partially or unexpectedly patched writer.
  IF regexp_count(v_original, v_columns_new) = 1
    AND regexp_count(v_original, v_values_new) = 1 THEN
    RETURN;
  END IF;

  IF regexp_count(v_original, v_columns_old) <> 1
    OR regexp_count(v_original, v_values_old) <> 1
    OR position('platform.tenant_memberships' in v_original) = 0
    OR position('v_prospect.recruitment_stage' in v_original) = 0
    OR position('public.staff_player_access' in v_original) = 0 THEN
    RAISE EXCEPTION 'unrecognised recruitment promotion writer; manual review required';
  END IF;

  v_updated := regexp_replace(
    v_original, v_columns_old,
    'football_status,\1agency_status,\1onboarding_status,'
  );
  v_updated := regexp_replace(
    v_updated, v_values_old,
    '\1\2''signed'',\2\3'
  );

  IF regexp_count(v_updated, v_columns_new) <> 1
    OR regexp_count(v_updated, v_values_new) <> 1 THEN
    RAISE EXCEPTION 'recruitment promotion status patch failed validation';
  END IF;

  -- CREATE OR REPLACE retains the function's original owner and EXECUTE ACL;
  -- pg_get_functiondef retains SECURITY DEFINER and the empty search_path.
  EXECUTE v_updated;
END
$migration$;
