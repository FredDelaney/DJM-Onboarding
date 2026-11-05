import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {kickoffClient, KickoffRunStopped, matchKickoffTeam} from '../_shared/football-data/kickoff-fixtures.ts';

type Target = {tenant_id: string; club_key: string; country_key: string; country_name: string; team_id: string | null};
const json = (body: object, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const day = (time: number) => new Date(time).toISOString().slice(0, 10);
const DAY = 86_400_000;

Deno.serve(async request => {
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  const supplied = request.headers.get('x-redream-kickoff-cron');
  if (!supplied) return json({error: 'Unauthorized'}, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({error: 'Configuration incomplete'}, 503);
  const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: expected, error: secretError} = await admin.rpc('platform_server_kickoff_cron_secret');
  if (secretError || !expected || supplied !== expected) return json({error: 'Unauthorized'}, 401);

  const apiKey = Deno.env.get('KICKOFFAPI_KEY')?.trim();
  const tenantSlug = Deno.env.get('KICKOFFAPI_TENANT_SLUG')?.trim();
  if (!apiKey || !tenantSlug) return json({status: 'configuration_required'}, 503);

  const {data, error} = await admin.rpc('platform_server_kickoff_targets', {p_tenant_slug: tenantSlug});
  if (error || !Array.isArray(data)) return json({error: 'Unable to load fixture targets'}, 503);

  const provider = kickoffClient(apiKey);
  const now = Date.now();
  const totals = {due: data.length, updated: 0, unmatched: 0, failed: 0};
  let stopped: string | null = null;
  for (const target of data as Target[]) {
    try {
      const observedAt = new Date().toISOString();
      const team = target.team_id ?? matchKickoffTeam(
        await provider.teams(target.country_name), target.club_key, target.country_key,
      );
      const fixtures = team ? await provider.fixtures(team, day(now - 7 * DAY), day(now + 60 * DAY)) : [];
      const {error: saveError} = await admin.rpc('platform_server_kickoff_save', {
        p_tenant_id: target.tenant_id, p_club_key: target.club_key, p_country_key: target.country_key,
        p_team_id: team, p_checked_at: observedAt, p_fixtures: fixtures,
      });
      if (saveError) throw new Error('cache_write_failed');
      if (team) totals.updated += 1;
      else totals.unmatched += 1;
    } catch (error) {
      if (error instanceof KickoffRunStopped) {
        stopped = error.message;
        break;
      }
      totals.failed += 1;
    }
  }
  const status = stopped || totals.failed ? 'partial' : 'complete';
  console.info('kickoff_fixture_refresh', {status, stopped, ...totals});
  return json({status, stopped, ...totals}, stopped || totals.failed ? 503 : 200);
});
