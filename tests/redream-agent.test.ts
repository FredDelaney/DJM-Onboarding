import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { restrictedPlayerProfile } from '../supabase/functions/_shared/staff-read-contract.ts';

const source = readFileSync('supabase/functions/redream-agent/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ role = 'owner', workspace = 'djm', records = [], tables = {}, output = null, saved = null, configStatus = 200 } : any = {}) {
  const calls: any[] = [];
  const httpCalls: any[] = [];
  let modelInput: any;
  const admin = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return { data: name === 'platform_server_user_workspaces'
        ? [{ tenant_id: 'tenant-a', slug: workspace, role, is_primary: true }]
        : { items: records }, error: null };
    },
    schema() { return this; },
    from(table: string) {
      const filters: any[] = [];
      const call = { table, filters };
      calls.push(call);
      const result = () => {
        const rows = (tables[table] || []).filter((row: any) => filters.every(([key, value, op]) => op === 'neq' ? row[key] !== value : row[key] === value));
        return { data: rows, error: null };
      };
      const query: any = {
        select() { return query; },
        eq(key: string, value: any) { filters.push([key, value, 'eq']); return query; },
        neq(key: string, value: any) { filters.push([key, value, 'neq']); return query; },
        is(key: string, value: any) { filters.push([key, value, 'eq']); return query; },
        in() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle: async () => ({ data: result().data[0] || null, error: null }),
        then(resolve: any) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };
  const handler = new Function('exports', 'createSupabaseContext', 'Deno', 'fetch', 'console', 'restrictedPlayerProfile', compiled + '\nreturn exports.default;')(
    {}, async () => ({ data: { userClaims: { sub: 'user-a' }, supabaseAdmin: admin } }),
    { env: { get: (key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined } },
    async (url: string, options: any) => {
      httpCalls.push({ url, options });
      if (url.includes('/v1/agents/')) return Response.json(saved || {
        id: 'agent_edd2cf2599d3452e94e74c6e22dce7935f1a5c93d3d54eb098',
        instructions: 'Saved agency operating policy.', model: 'gpt-6.1-sol', reasoning: { effort: 'high' },
        tools: [{ type: 'web_search', mode: 'live', context_size: 'medium' }], text: { verbosity: 'medium' },
      }, { status: configStatus });
      modelInput = JSON.parse(options.body);
      return Response.json(output || { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Recorded evidence only.', basis: 'internal', needs_clarification: false, clarification_question: null, next_action: null }) }] }] });
    }, { error() {} }, restrictedPlayerProfile,
  );
  return {
    calls, httpCalls, model: () => modelInput, input: () => JSON.parse(modelInput.input[0].content[0].text),
    request: (body: any) => handler.fetch(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) })),
  };
}

test('an explicit inaccessible workspace is denied without falling back or calling the model', async () => {
  const app = setup();
  const response = await app.request({ query: 'What do we know about Kota?', workspace_slug: 'another-agency' });
  assert.equal(response.status, 403);
  assert.equal(app.calls.length, 1);
});

test('assigned staff receive football evidence without private player contract and commercial fields', async () => {
  const app = setup({ role: 'scout', records: [{ kind: 'player', id: 'p1', title: 'Kota' }], tables: {
    players: [{ id: 'p1', tenant_id: 'tenant-a', current_club: 'Example FC', contract_expiry: '2027-12-31', transfermarkt_market_value: 500000, next_action: 'Negotiate salary' }],
    career_entries: [{ player_id: 'p1', appearances: 10, goals: 0 }],
  } });
  assert.equal((await app.request({ query: 'What do we know about Kota?', workspace_slug: 'djm' })).status, 200);
  const player = app.input().redream_internal_data[0];
  assert.equal(player.player.current_club, 'Example FC');
  assert.equal(player.career[0].goals, 0);
  assert.equal(player.player.contract_expiry, undefined);
  assert.equal(player.player.next_action, undefined);
  assert.equal(player.player.transfermarkt_market_value, undefined);
});

test('staff club answers contain identity without internal relationship history', async () => {
  const app = setup({ role: 'agent', records: [{ kind: 'club', id: 'c1', title: 'Example FC' }], tables: {
    organisations: [{ id: 'c1', tenant_id: 'tenant-a', name: 'Example FC' }],
    interactions: [{ organisation_id: 'c1', tenant_id: 'tenant-a', summary: 'Confidential negotiation' }],
  } });
  await app.request({ query: 'What do we know about Example FC?', workspace_slug: 'djm' });
  assert.equal(app.input().redream_internal_data[0].recent_interactions, undefined);
  assert.equal(app.calls.some((call: any) => call.table === 'interactions'), false);
});

test('task questions retrieve only the current user\'s open work', async () => {
  const app = setup({ tables: { tasks: [
    { tenant_id: 'tenant-a', owner_user_id: 'user-a', title: 'My follow-up', status: 'open' },
    { tenant_id: 'tenant-a', owner_user_id: 'user-b', title: 'Private task', status: 'open' },
  ] } });
  await app.request({ query: 'What are my tasks today?', workspace_slug: 'djm' });
  assert.deepEqual(app.input().redream_internal_data[0].tasks.map((task: any) => task.title), ['My follow-up']);
});

test('an empty or refused model response is an error rather than a successful blank answer', async () => {
  const app = setup({ output: { output: [{ content: [{ type: 'output_text', text: '{}' }] }] } });
  assert.equal((await app.request({ query: 'What is recorded?', workspace_slug: 'djm' })).status, 502);
});

test('public sources include the citations actually attached to an answer', async () => {
  const app = setup({ output: { output: [{ type: 'message', content: [{ type: 'output_text',
    text: JSON.stringify({ answer: 'Public evidence.', basis: 'public', needs_clarification: false }),
    annotations: [{ type: 'url_citation', title: 'Official source', url: 'https://example.org/player' }],
  }] }] } });
  const answer = await (await app.request({ query: 'Research Kota.', workspace_slug: 'djm' })).json();
  assert.deepEqual(answer.sources, [{ title: 'Official source', url: 'https://example.org/player' }]);
});

test('questions use the saved OpenAI agent instructions and model settings', async () => {
  const app = setup();
  const response = await app.request({ query: 'What is recorded?', workspace_slug: 'djm' });
  assert.equal(response.status, 200);
  assert.ok(app.model().instructions.includes('Saved agency operating policy.'));
  assert.equal(app.model().model, 'gpt-6.1-sol');
  assert.equal(app.model().reasoning.effort, 'high');
  assert.ok(app.httpCalls[0].url.endsWith('/v1/agents/agent_edd2cf2599d3452e94e74c6e22dce7935f1a5c93d3d54eb098'));
  assert.equal(app.httpCalls[0].options.headers['OpenAI-Beta'], 'agents=v1');
  assert.equal((await response.json()).agent_id, 'agent_edd2cf2599d3452e94e74c6e22dce7935f1a5c93d3d54eb098');
});

test('turning web search off in the saved agent removes web tools from the request', async () => {
  const app = setup({ saved: { id: 'saved-agent', model: 'gpt-6.1-sol', instructions: 'Saved policy', reasoning: { effort: 'high' }, tools: [] } });
  await app.request({ query: 'What is recorded?', workspace_slug: 'djm' });
  assert.deepEqual(app.model().tools, []);
});

test('a missing or inaccessible saved agent fails clearly without silently using a different configuration', async () => {
  const app = setup({ configStatus: 403 });
  const response = await app.request({ query: 'What is recorded?', workspace_slug: 'djm' });
  assert.equal(response.status, 503);
  assert.equal(app.httpCalls.some((call: any) => call.url.endsWith('/responses')), false);
});
