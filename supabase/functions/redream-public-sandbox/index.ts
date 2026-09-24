import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=20, s-maxage=60, stale-while-revalidate=120",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const obj = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

const list = (value: unknown): any[] => Array.isArray(value) ? value : [];

const cleanText = (value: unknown, max = 320): string | null => {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
};

const cleanNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const truthy = (value: unknown): boolean => value === true;

const compact = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== null &&
      item !== undefined &&
      item !== "" &&
      !(Array.isArray(item) && item.length === 0)
    ),
  ) as T;

function sanitizeActionability(value: unknown) {
  const a = obj(value);
  return compact({
    cta: cleanText(a.cta, 100),
    mode: cleanText(a.mode, 80),
    risk_level: cleanText(a.risk_level, 40),
    action_type: cleanText(a.action_type, 100),
    evidence_gate: cleanText(a.evidence_gate, 60),
    undo_expected: truthy(a.undo_expected),
    requires_input: truthy(a.requires_input),
    external_side_effect: truthy(a.external_side_effect),
  });
}

function sanitizeEvidence(value: unknown) {
  const e = obj(value);
  return compact({
    stage: cleanText(e.stage, 80),
    status: cleanText(e.status, 80),
    currency: cleanText(e.currency, 10),
    probability: cleanNumber(e.probability),
    expected_commission: cleanNumber(e.expected_commission),
    primary_blocker: cleanText(e.primary_blocker, 240),
    organisation: cleanText(e.organisation, 160),
    need_title: cleanText(e.need_title, 180),
    position: cleanText(e.position, 40),
    need_priority: cleanNumber(e.need_priority),
    current_club: cleanText(e.current_club, 160),
    agency_priority: cleanText(e.agency_priority, 40),
    next_action: cleanText(e.next_action, 260),
    task_count: cleanNumber(e.task_count),
  });
}

function sanitizeCommand(value: unknown) {
  const c = obj(value);
  const health = obj(c.evidence_health);
  return compact({
    title: cleanText(c.title, 220),
    why_now: cleanText(c.why_now, 260),
    category: cleanText(c.category, 80),
    command_type: cleanText(c.command_type, 120),
    recommended_action: cleanText(c.recommended_action, 320),
    priority_band: cleanText(c.priority_band, 40),
    priority_score: cleanNumber(c.priority_score),
    evidence: sanitizeEvidence(c.evidence),
    evidence_health: compact({
      state: cleanText(health.state, 40),
      score: cleanNumber(health.score),
      operating_mode: cleanText(health.operating_mode, 60),
      external_decision_ready: truthy(health.external_decision_ready),
    }),
    actionability: sanitizeActionability(c.actionability),
  });
}

function sanitizeDirectRoute(value: unknown) {
  const r = obj(value);
  return compact({
    person_name: cleanText(r.person_name, 120),
    role_title: cleanText(r.role_title, 120),
    route_score: cleanNumber(r.route_score),
    route_state: cleanText(r.route_state, 60),
    why_this_route: cleanText(r.why_this_route, 320),
  });
}

function sanitizeIntroduction(value: unknown) {
  const r = obj(value);
  const intermediary = obj(r.intermediary);
  const target = obj(r.target_contact);
  return compact({
    intermediary: cleanText(intermediary.name, 120),
    target_contact: cleanText(target.name, 120),
    target_role: cleanText(target.role_title, 120),
    introduction_score: cleanNumber(r.introduction_score),
    introduction_state: cleanText(r.introduction_state, 60),
    why_this_path: cleanText(r.why_this_path, 320),
    recommended_action: cleanText(r.recommended_action, 320),
    improves_direct_access: truthy(r.improves_direct_access),
    direct_access_to_target: cleanNumber(r.direct_access_to_target),
    introduction_advantage_points: cleanNumber(r.introduction_advantage_points),
  });
}

function sanitizeNetworkClub(value: unknown) {
  const c = obj(value);
  const intro = obj(c.introduction_context);
  return compact({
    organisation_name: cleanText(c.organisation_name, 160),
    country: cleanText(c.country, 100),
    league_name: cleanText(c.league_name, 140),
    coverage_state: cleanText(c.coverage_state, 80),
    risk_state: cleanText(c.risk_state, 100),
    route_count: cleanNumber(c.route_count),
    active_deals: cleanNumber(c.active_deals),
    active_needs: cleanNumber(c.active_needs),
    confirmed_needs: cleanNumber(c.confirmed_needs),
    single_threaded: truthy(c.single_threaded),
    best_route: sanitizeDirectRoute(c.best_route),
    best_introduction: sanitizeIntroduction(intro.best_route),
    recommended_network_action: cleanText(c.recommended_network_action, 320),
    deal_value_by_currency: list(c.deal_value_by_currency).slice(0, 4).map((item) => {
      const v = obj(item);
      return compact({
        currency: cleanText(v.currency, 10),
        active_deals: cleanNumber(v.active_deals),
        expected_commission: cleanNumber(v.expected_commission),
        weighted_commission: cleanNumber(v.weighted_commission),
      });
    }),
  });
}

function sanitizeDemand(value: unknown) {
  const d = obj(value);
  const club = obj(d.club);
  const need = obj(d.need);
  const access = obj(d.access);
  const intro = obj(access.best_introduction_route);
  const next = obj(d.next_action);
  const coverage = obj(d.candidate_coverage);
  return compact({
    club: compact({
      name: cleanText(club.name, 160),
      country: cleanText(club.country, 100),
      league_name: cleanText(club.league_name, 140),
    }),
    need: compact({
      title: cleanText(need.title, 180),
      position: cleanText(need.position, 40),
      priority: cleanNumber(need.priority),
      need_type: cleanText(need.need_type, 60),
      max_age: cleanNumber(need.max_age),
      preferred_foot: cleanText(need.preferred_foot, 40),
      transfer_type: cleanText(need.transfer_type, 80),
      salary_budget: cleanNumber(need.salary_budget),
      currency: cleanText(need.currency, 10),
    }),
    access: compact({
      mode: cleanText(access.mode, 80),
      direct_score: cleanNumber(access.direct_score),
      best_direct_contact: cleanText(access.best_direct_contact, 120),
      best_direct_role: cleanText(access.best_direct_role, 120),
      introduction_score: cleanNumber(access.introduction_score),
      best_introduction: sanitizeIntroduction(intro),
    }),
    coverage_state: cleanText(d.coverage_state, 100),
    candidate_coverage: compact({
      recorded_candidates: cleanNumber(coverage.recorded_candidates),
      career_open: cleanNumber(coverage.career_open),
      held: cleanNumber(coverage.held),
      human_review: cleanNumber(coverage.human_review),
      candidates: list(coverage.candidates).slice(0, 4).map((item) => {
        const c = obj(item);
        return compact({
          player_name: cleanText(c.player_name, 120),
          match_status: cleanText(c.match_status, 60),
          career_gate_state: cleanText(c.career_gate_state, 80),
          career_gate_reason: cleanText(c.career_gate_reason, 260),
        });
      }),
    }),
    next_action: compact({
      action_type: cleanText(next.action_type, 100),
      instruction: cleanText(next.instruction, 320),
      requires_human_input: truthy(next.requires_human_input),
    }),
  });
}

function sanitizePursuit(value: unknown) {
  const p = obj(value);
  const club = obj(p.club);
  const need = obj(p.need);
  const player = obj(p.player);
  const factors = obj(p.factors);
  const gate = obj(p.career_strategy_gate);
  const next = obj(gate.next_action);
  const reasoning = obj(p.match_reasoning);
  const evidence = obj(p.evidence_health);
  return compact({
    club: compact({
      name: cleanText(club.name, 160),
      country: cleanText(club.country, 100),
      league_name: cleanText(club.league_name, 140),
    }),
    need: compact({
      title: cleanText(need.title, 180),
      position: cleanText(need.position, 40),
      priority: cleanNumber(need.priority),
      need_type: cleanText(need.need_type, 60),
    }),
    player: compact({
      name: cleanText(player.name, 120),
      current_club: cleanText(player.current_club, 160),
      primary_position: cleanText(player.primary_position, 40),
      football_status: cleanText(player.football_status, 60),
    }),
    readiness_score: cleanNumber(p.readiness_score),
    readiness_state: cleanText(p.readiness_state, 80),
    pursuit_operating_mode: cleanText(p.pursuit_operating_mode, 80),
    interpretation: cleanText(p.interpretation, 360),
    factors: compact({
      football_fit: cleanNumber(obj(factors.football_fit).score),
      registration: cleanNumber(obj(factors.registration).score),
      commercial_fit: cleanNumber(obj(factors.commercial_fit).score),
      club_access: cleanNumber(obj(factors.club_access).score),
      career_fit: cleanNumber(obj(factors.career_fit).score),
      demand_certainty: cleanNumber(obj(factors.demand_certainty).score),
    }),
    match_reasoning: compact({
      summary: cleanText(reasoning.summary, 260),
      evidence: list(reasoning.evidence).slice(0, 5).map((item) => cleanText(item, 180)).filter(Boolean),
    }),
    best_access_route: sanitizeDirectRoute(p.best_access_route),
    evidence_health: compact({
      state: cleanText(evidence.state, 40),
      score_floor: cleanNumber(evidence.score_floor),
    }),
    career_strategy_gate: compact({
      state: cleanText(gate.state, 80),
      reason: cleanText(gate.reason, 320),
      strategy_status: cleanText(gate.strategy_status, 60),
      player_confirmation: cleanText(gate.player_confirmation, 60),
      target_markets: list(gate.target_markets).slice(0, 8).map((item) => cleanText(item, 80)).filter(Boolean),
      avoid_markets: list(gate.avoid_markets).slice(0, 8).map((item) => cleanText(item, 80)).filter(Boolean),
      next_action: compact({
        action_type: cleanText(next.action_type, 100),
        instruction: cleanText(next.instruction, 320),
        requires_human_input: truthy(next.requires_human_input),
      }),
    }),
  });
}

function sanitizeRevenue(value: unknown) {
  const r = obj(value);
  return list(r.by_currency).slice(0, 6).map((item) => {
    const v = obj(item);
    const concentration = obj(v.concentration);
    return compact({
      currency: cleanText(v.currency, 10),
      active_deals: cleanNumber(v.active_deals),
      expected_commission: cleanNumber(v.expected_commission),
      weighted_commission: cleanNumber(v.weighted_commission),
      concentration: compact({
        state: cleanText(concentration.state, 80),
        top_deal_share: cleanNumber(concentration.top_deal_share),
      }),
      unpriced_active_deals: cleanNumber(v.unpriced_active_deals),
    });
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      return reply({ error: "Demo unavailable" }, 503);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.rpc("platform_server_public_demo_snapshot_v1");

    if (error || !data) {
      console.error("redream-public-sandbox snapshot", error?.message || "missing data");
      return reply({ error: "Demo unavailable" }, 503);
    }

    const source = obj(data);
    if (source.synthetic !== true || source.contract_version !== "redream_public_demo_source_v1") {
      console.error("redream-public-sandbox safety contract rejected");
      return reply({ error: "Demo unavailable" }, 503);
    }

    const home = obj(source.home);
    const attention = obj(home.attention);
    const network = obj(source.network);
    const topCommands = list(attention.commands).slice(0, 8).map(sanitizeCommand);
    const clubs = list(network.clubs).slice(0, 8).map(sanitizeNetworkClub);
    const demandItems = list(obj(source.demand).items).slice(0, 8).map(sanitizeDemand);
    const pursuits = list(obj(source.pursuits).items).slice(0, 8).map(sanitizePursuit);
    const revenue = sanitizeRevenue(source.revenue);

    const dealCommand = topCommands.find((item) => item.category === "deal") || topCommands[0] || null;
    const marketCommand = topCommands.find((item) => item.category === "market") || null;
    const playerCommand = topCommands.find((item) => item.category === "player_service") || null;
    const introClub = clubs.find((item) => obj(item.best_introduction).introduction_score) || null;

    return reply({
      contract_version: "redream_public_sandbox_v1",
      synthetic: true,
      generated_at: new Date().toISOString(),
      product_truth: {
        source: "Live ReDream read models running against an isolated synthetic staging agency.",
        customer_data: "No real agency, player, club or relationship data is returned by this endpoint.",
        autonomy: "ReDream can prepare and apply bounded internal work. External communication and material commercial judgement stay human-controlled.",
        scoring: "Readiness, access and evidence scores are operating signals, not transfer-outcome probabilities.",
      },
      operating_loop: {
        capture: "A club request, player update, relationship signal or deal change enters ReDream.",
        memory: "ReDream connects the relevant player, club, relationship, commitment and commercial context.",
        decide: cleanText(dealCommand?.recommended_action || dealCommand?.why_now, 320),
        control: dealCommand?.actionability || {},
        record: "Approved internal actions are recorded in Agency Memory and remain undoable where the action protocol supports it.",
      },
      scenarios: {
        deal: dealCommand,
        market: marketCommand || demandItems[0] || null,
        player: playerCommand,
        relationship: introClub || clubs[0] || null,
      },
      attention: topCommands,
      demand: demandItems,
      pursuits,
      network: {
        summary: compact({
          relevant_clubs: cleanNumber(obj(network.summary).relevant_clubs),
          warm_access_clubs: cleanNumber(obj(network.summary).warm_access_clubs),
          single_threaded_clubs: cleanNumber(obj(network.summary).single_threaded_clubs),
          clubs_with_introduction_option: cleanNumber(obj(network.summary).clubs_with_introduction_option),
          weak_or_developing_access_clubs: cleanNumber(obj(network.summary).weak_or_developing_access_clubs),
        }),
        clubs,
      },
      revenue,
    });
  } catch (error) {
    console.error(
      "redream-public-sandbox",
      error instanceof Error ? error.message : error,
    );
    return reply({ error: "Demo unavailable" }, 500);
  }
});
