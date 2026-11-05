const TEAM_ID = /^tm_[a-z0-9_-]+$/i;
const FIXTURE_ID = /^fx_[a-z0-9_-]+$/i;
const LOGO_URL = /^https:\/\/cdn\.kickoffapi\.com\/images\/(?:logos|teams)\/[a-z0-9_-]+\.(?:png|webp|svg|jpe?g)$/i;
const BASE_URL = 'https://api.kickoffapi.com/api/v2/';
const PAGE_LIMIT = 5;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const key = (value: unknown) => clean(value).toLowerCase();
const logo = (value: unknown) => LOGO_URL.test(clean(value)) ? clean(value) : null;

export type KickoffFixture = {
  fixture_id: string;
  kickoff_at: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_logo: string | null;
  away_logo: string | null;
  attribution: string[];
};

function attribution(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(clean)
    .filter(label => label.length > 0 && label.length <= 150).slice(0, 8);
}

export function matchKickoffTeam(teams: unknown[], club: string, country: string): string | null {
  const matches = new Set(teams.map(object)
    .filter(team => key(team.name) === club && key(team.country) === country && TEAM_ID.test(clean(team.id)))
    .map(team => clean(team.id)));
  return matches.size === 1 ? [...matches][0] : null;
}

export function normaliseKickoffFixture(value: unknown, team: string, credits: string[]): KickoffFixture {
  const row = object(value);
  const home = object(row.home);
  const away = object(row.away);
  const id = clean(row.id);
  const date = clean(row.date);
  const status = clean(object(row.status).short);
  const homeId = clean(home.id), awayId = clean(away.id);
  const homeName = clean(home.name), awayName = clean(away.name);
  if (!FIXTURE_ID.test(id) || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(date)
    || !Number.isFinite(Date.parse(date)) || !/^[A-Z0-9]{1,8}$/.test(status)
    || !TEAM_ID.test(homeId) || !TEAM_ID.test(awayId) || homeId === awayId
    || (homeId !== team && awayId !== team) || !homeName || !awayName) {
    throw new Error('invalid_fixture');
  }
  return {
    fixture_id: id, kickoff_at: new Date(date).toISOString(), status,
    home_team_id: homeId, away_team_id: awayId,
    home_team_name: homeName.slice(0, 160), away_team_name: awayName.slice(0, 160),
    home_logo: logo(home.logo), away_logo: logo(away.logo),
    attribution: [...new Set([...credits, ...attribution(row.attribution)])].slice(0, 16),
  };
}

export class KickoffRunStopped extends Error {}

export function kickoffClient(apiKey: string, fetcher: typeof fetch = fetch, deadline = Date.now() + 105_000) {
  let remaining = 24;
  async function read<T>(endpoint: 'teams' | 'fixtures', params: Record<string, string>,
    parse: (row: unknown, credits: string[]) => T): Promise<T[]> {
    const rows: T[] = [];
    let cursor = 0;
    for (let page = 0; page < PAGE_LIMIT; page += 1) {
      const timeout = Math.min(7_000, deadline - Date.now());
      if (!remaining || timeout <= 0) throw new KickoffRunStopped('request_budget');
      remaining -= 1;
      const url = new URL(endpoint, BASE_URL);
      url.search = new URLSearchParams({...params, cursor: String(cursor)}).toString();
      const response = await fetcher(url, {
        headers: {'x-api-key': apiKey, Accept: 'application/json'},
        signal: AbortSignal.timeout(timeout),
        redirect: 'error',
      });
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new KickoffRunStopped(`provider_${response.status}`);
      }
      if (!response.ok) throw new Error('provider_response_failed');
      if (response.headers.get('X-RateLimit-Daily-Remaining') === '0'
        || response.headers.get('X-RateLimit-Remaining') === '0') remaining = 0;
      const body = object(await response.json());
      const meta = object(body.meta);
      if (!Array.isArray(body.data) || !('nextCursor' in meta)) throw new Error('invalid_page');
      const credits = attribution(meta.attribution);
      rows.push(...body.data.map(row => parse(row, credits)));
      if (meta.nextCursor === null) return rows;
      const next = Number(meta.nextCursor);
      if (!Number.isSafeInteger(next) || next <= cursor || body.data.length === 0) throw new Error('invalid_cursor');
      cursor = next;
    }
    throw new Error('incomplete_page_set');
  }

  const countries = new Map<string, Promise<unknown[]>>();
  return {
    teams(country: string) {
      const countryKey = key(country);
      const cached = countries.get(countryKey);
      if (cached) return cached;
      const request = read('teams', {country, limit: '2000'}, row => row);
      countries.set(countryKey, request);
      return request;
    },
    async fixtures(team: string, from: string, to: string) {
      if (!TEAM_ID.test(team)) throw new Error('invalid_team');
      const fixtures = await read('fixtures', {team, from, to, limit: '240'},
        (row, credits) => normaliseKickoffFixture(row, team, credits));
      if (fixtures.length > 240) throw new Error('fixture_limit');
      if (new Set(fixtures.map(row => row.fixture_id)).size !== fixtures.length) throw new Error('duplicate_fixture');
      return fixtures;
    },
  };
}
