// @ts-nocheck
export type DjmAiTask =
  | 'tell_djm'
  | 'home_priority'
  | 'meeting_brief'
  | 'player_intelligence'
  | 'recruitment_intelligence'
  | 'deal_intelligence'
  | 'contract_reasoning'
  | 'data_cleanup';

export type DjmAiTier = 'fast' | 'balanced' | 'deep';

export type DjmAiRoute = {
  tier: DjmAiTier;
  model: string;
  reasoning_effort: 'none' | 'low' | 'medium';
  input_usd_per_million: number;
  output_usd_per_million: number;
  reason: string;
};

type RouteInput = {
  text?: string | null;
  forceTier?: DjmAiTier | null;
};

const envNumber = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const ROUTES: Record<DjmAiTier, DjmAiRoute> = {
  fast: {
    tier: 'fast',
    model: Deno.env.get('DJM_AI_FAST_MODEL') || 'gpt-5.6-luna',
    reasoning_effort: 'none',
    input_usd_per_million: envNumber('DJM_AI_FAST_INPUT_USD_PER_MILLION', 0.2),
    output_usd_per_million: envNumber('DJM_AI_FAST_OUTPUT_USD_PER_MILLION', 1.2),
    reason: 'routine structured agency work',
  },
  balanced: {
    tier: 'balanced',
    model: Deno.env.get('DJM_AI_BALANCED_MODEL') || 'gpt-5.6-terra',
    reasoning_effort: 'none',
    input_usd_per_million: envNumber('DJM_AI_BALANCED_INPUT_USD_PER_MILLION', 2),
    output_usd_per_million: envNumber('DJM_AI_BALANCED_OUTPUT_USD_PER_MILLION', 12),
    reason: 'ambiguous or higher-risk agency work',
  },
  deep: {
    tier: 'deep',
    model: Deno.env.get('DJM_AI_DEEP_MODEL') || 'gpt-5.6-sol',
    reasoning_effort: 'low',
    input_usd_per_million: envNumber('DJM_AI_DEEP_INPUT_USD_PER_MILLION', 4),
    output_usd_per_million: envNumber('DJM_AI_DEEP_OUTPUT_USD_PER_MILLION', 20),
    reason: 'complex professional reasoning',
  },
};

const HIGH_RISK = [
  /\bcontract(?:ual)?\b/i,
  /\brepresentation agreement\b/i,
  /\btermination\b/i,
  /\brelease clause\b/i,
  /\bsell[- ]on\b/i,
  /\bcommission\b/i,
  /\bimage rights?\b/i,
  /\bwork permit\b/i,
  /\bregistration rule/i,
  /\blegal\b/i,
];

const MEDIUM_RISK = [
  /\bsalary\b/i,
  /\bwage\b/i,
  /\btransfer fee\b/i,
  /\bloan fee\b/i,
  /\bbonus\b/i,
  /\bgross\b/i,
  /\bnet\b/i,
  /\btax\b/i,
  /\boption\b/i,
];

function complexityScore(task: DjmAiTask, text: string) {
  let score = 0;

  if (text.length > 1600) score += 1;
  if (text.length > 4000) score += 2;
  if (HIGH_RISK.some((pattern) => pattern.test(text))) score += 2;
  if (MEDIUM_RISK.filter((pattern) => pattern.test(text)).length >= 2) score += 1;

  if (task === 'contract_reasoning') score += 3;
  if (task === 'player_intelligence' || task === 'deal_intelligence') score += 1;
  if (task === 'data_cleanup') score = Math.min(score, 1);

  return score;
}

export function selectDjmAiRoute(
  task: DjmAiTask,
  input: RouteInput = {},
): DjmAiRoute {
  if (input.forceTier) return ROUTES[input.forceTier];

  const text = String(input.text || '').trim();
  const score = complexityScore(task, text);

  if (score >= 3) return ROUTES.deep;
  if (score >= 1) return ROUTES.balanced;
  return ROUTES.fast;
}

export function estimateDjmAiCost(
  route: DjmAiRoute,
  inputTokens: number,
  outputTokens: number,
) {
  return (
    (Math.max(0, inputTokens) / 1_000_000) * route.input_usd_per_million +
    (Math.max(0, outputTokens) / 1_000_000) * route.output_usd_per_million
  );
}
