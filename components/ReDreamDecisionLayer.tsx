'use client';

import {
  ArrowRight,
  BrainCircuit,
  Check,
  CircleDollarSign,
  GitBranch,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { trackFunnel } from '@/lib/redream-funnel';
import {
  loadReDreamPublicSandbox,
  REDREAM_PUBLIC_SANDBOX_CONTRACT,
} from '@/lib/redream-public-sandbox';
import styles from './ReDreamDecisionLayer.module.css';

type QuestionKey = 'priority' | 'revenue' | 'access' | 'career';
type LaneKey = 'delegate' | 'confirm' | 'judgement';
type SourceMode = 'loading' | 'live' | 'cached';

type Sandbox = {
  contract_version?: string;
  synthetic?: boolean;
  attention?: any[];
  scenarios?: Record<string, any>;
  pursuits?: any[];
  revenue?: any[];
  network?: { summary?: Record<string, number>; clubs?: any[] };
  product_truth?: Record<string, string>;
};

const FALLBACK: Sandbox = {
  contract_version: REDREAM_PUBLIC_SANDBOX_CONTRACT,
  synthetic: true,
  product_truth: {
    scoring:
      'Readiness, access and evidence scores are operating signals, not transfer-outcome probabilities.',
  },
  scenarios: {
    deal: {
      title: 'Elias Novak to Westhaven FC',
      why_now: 'The deal next action is overdue.',
      recommended_action: 'Send updated pack and confirm medical status',
      priority_score: 100,
      evidence: {
        currency: 'EUR',
        expected_commission: 45000,
        primary_blocker: 'Club wants updated medical and final availability',
      },
      actionability: {
        cta: 'Set next action',
        mode: 'input_then_confirm',
        risk_level: 'medium',
        undo_expected: true,
        external_side_effect: false,
      },
    },
    market: {
      title: 'Nordstadt 04',
      why_now: 'A confirmed club requirement currently has no suggested player match.',
      recommended_action: 'Create a search task and progress the strongest sourcing route.',
      priority_score: 97,
      evidence: {
        organisation: 'Nordstadt 04',
        need_title: 'Left-footed centre-back',
        position: 'CB',
      },
      actionability: {
        cta: 'Create search task',
        mode: 'one_tap',
        risk_level: 'low',
        undo_expected: true,
        external_side_effect: false,
      },
    },
    player: {
      title: 'Elias Novak',
      why_now: 'The player next action is overdue.',
      recommended_action: 'Send updated clips and availability to Westhaven FC',
      priority_score: 96,
      evidence: {
        current_club: 'Adriatic 1919',
        agency_priority: 'high',
        next_action: 'Send updated clips and availability to Westhaven FC',
      },
      actionability: {
        cta: 'Create action',
        mode: 'one_tap',
        risk_level: 'low',
        undo_expected: true,
        external_side_effect: false,
      },
    },
    relationship: {
      organisation_name: 'Riverton United',
      risk_state: 'commercial_exposure_behind_weak_access',
      best_route: {
        person_name: 'Thomas De Smet',
        role_title: 'Technical Director',
        route_score: 58,
        route_state: 'developing',
      },
      best_introduction: {
        intermediary: 'Luca Moretti',
        target_contact: 'Thomas De Smet',
        target_role: 'Technical Director',
        introduction_score: 88,
        introduction_state: 'strong_intro',
        recommended_action:
          'Ask Luca Moretti for an introduction to Thomas De Smet at Riverton United.',
      },
      deal_value_by_currency: [
        { currency: 'EUR', expected_commission: 18000, weighted_commission: 6300 },
      ],
    },
  },
  pursuits: [
    {
      club: { name: 'Westhaven FC' },
      need: { title: 'Explosive right winger U23', need_type: 'confirmed' },
      player: { name: 'Elias Novak', current_club: 'Adriatic 1919' },
      readiness_score: 92,
      best_access_route: {
        person_name: 'Milan de Vries',
        role_title: 'Sporting Director',
        route_score: 87,
        route_state: 'warm',
      },
      career_strategy_gate: {
        state: 'review_strategy_overdue',
        reason:
          'The strategy review date has passed, so the pursuit needs a current player-strategy check.',
        player_confirmation: 'confirmed',
        next_action: {
          instruction: 'Review the strategy with the player before escalating external activity.',
          requires_human_input: true,
        },
      },
    },
    {
      club: { name: 'Riverton United' },
      need: { title: 'Mobile striker', need_type: 'predicted' },
      player: { name: 'Andre Costa' },
      readiness_score: 79,
      career_strategy_gate: {
        state: 'hold_strategy_missing',
        reason:
          'The football pursuit exists, but no human-owned career strategy is recorded for the player.',
        player_confirmation: 'missing',
        next_action: {
          instruction:
            'Agree the player career strategy before treating this pursuit as career-approved external action.',
          requires_human_input: true,
        },
      },
    },
  ],
  revenue: [
    {
      currency: 'EUR',
      active_deals: 2,
      expected_commission: 63000,
      weighted_commission: 34200,
      concentration: { state: 'concentrated', top_deal_share: 0.7143 },
    },
  ],
  attention: [
    {
      title: 'Send Elias Novak updated pack to Westhaven FC',
      why_now: 'The earliest open task is overdue.',
      recommended_action: 'Complete this follow-up and record the outcome.',
      priority_score: 98,
      actionability: {
        cta: 'Mark done',
        mode: 'one_tap',
        risk_level: 'low',
        undo_expected: true,
        external_side_effect: false,
      },
    },
    {
      title: 'Elias Novak to Westhaven FC',
      why_now: 'The deal next action is overdue.',
      recommended_action: 'Send updated pack and confirm medical status',
      priority_score: 100,
      actionability: {
        cta: 'Set next action',
        mode: 'input_then_confirm',
        risk_level: 'medium',
        undo_expected: true,
        external_side_effect: false,
      },
    },
  ],
};

const questions: Array<{
  key: QuestionKey;
  label: string;
  prompt: string;
  icon: typeof Target;
}> = [
  {
    key: 'priority',
    label: 'Priority',
    prompt: 'What needs me first?',
    icon: Target,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    prompt: 'Where is revenue exposed?',
    icon: CircleDollarSign,
  },
  {
    key: 'access',
    label: 'Access',
    prompt: 'Which relationship route is stronger?',
    icon: Network,
  },
  {
    key: 'career',
    label: 'Career',
    prompt: 'What is blocked by player strategy?',
    icon: UsersRound,
  },
];

const human = (value?: string | null) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (amount?: number | null, currency?: string | null) => {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount)) || !currency) return 'Recorded';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currency} ${Math.round(Number(amount)).toLocaleString('en-GB')}`;
  }
};

function laneFor(item: any): LaneKey {
  const action = item?.actionability || {};
  if (action.external_side_effect === true || action.risk_level === 'human_judgement') {
    return 'judgement';
  }
  if (
    action.mode === 'one_tap' &&
    action.risk_level === 'low' &&
    action.undo_expected === true
  ) {
    return 'delegate';
  }
  return 'confirm';
}

function useDecisionData() {
  const [data, setData] = useState<Sandbox>(FALLBACK);
  const [mode, setMode] = useState<SourceMode>('loading');

  useEffect(() => {
    let active = true;

    loadReDreamPublicSandbox<Sandbox>()
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setMode('live');
      })
      .catch((error) => {
        if (!active) return;
        console.warn(
          'ReDream decision layer fallback',
          error instanceof Error ? error.message : error,
        );
        setData(FALLBACK);
        setMode('cached');
      });

    return () => { active = false; };
  }, []);

  return { data, mode };
}

function buildAnswer(key: QuestionKey, data: Sandbox) {
  const scenarios = data.scenarios || FALLBACK.scenarios || {};
  const deal = scenarios.deal || FALLBACK.scenarios?.deal;
  const relationship = scenarios.relationship || FALLBACK.scenarios?.relationship;
  const revenue = data.revenue?.[0] || FALLBACK.revenue?.[0] || {};
  const pursuits = data.pursuits?.length ? data.pursuits : FALLBACK.pursuits || [];
  const career =
    pursuits.find((item) =>
      ['hold_strategy_missing', 'review_strategy_overdue'].includes(
        item?.career_strategy_gate?.state,
      ),
    ) || pursuits[0];

  if (key === 'revenue') {
    return {
      eyebrow: 'COMMERCIAL EXPOSURE',
      title: `${money(revenue.expected_commission, revenue.currency)} is recorded across ${revenue.active_deals || 0} active deals.`,
      summary:
        deal?.evidence?.primary_blocker ||
        'ReDream keeps recorded commission exposure tied to the operational blocker rather than showing revenue in isolation.',
      action: deal?.recommended_action || 'Resolve the highest-value recorded blocker first.',
      evidence: [
        ['Expected commission', money(revenue.expected_commission, revenue.currency)],
        ['Weighted exposure', money(revenue.weighted_commission, revenue.currency)],
        ['Concentration', human(revenue.concentration?.state) || 'Recorded'],
        ['Top deal attention', String(deal?.priority_score || '–')],
      ],
      chain: [
        ['Revenue', money(revenue.expected_commission, revenue.currency)],
        ['Deal', deal?.title || 'Active deal'],
        ['Blocker', deal?.evidence?.primary_blocker || 'Recorded blocker'],
        ['Access', relationship?.best_route?.person_name || 'Relationship route'],
        ['Next move', deal?.recommended_action || 'Review'],
      ],
    };
  }

  if (key === 'access') {
    const direct = relationship?.best_route || {};
    const intro = relationship?.best_introduction || {};
    const exposure = relationship?.deal_value_by_currency?.[0] || {};
    return {
      eyebrow: 'RELATIONSHIP ROUTING',
      title: `${intro.intermediary || 'A warm intermediary'} creates a stronger route into ${relationship?.organisation_name || 'the club'}.`,
      summary:
        intro.why_this_path ||
        'ReDream keeps direct relationship strength separate from a two-hop introduction route, so access strategy does not overwrite the underlying relationship truth.',
      action:
        intro.recommended_action ||
        relationship?.recommended_network_action ||
        'Prepare the stronger route for agent judgement.',
      evidence: [
        ['Direct access', direct.route_score ? `${direct.route_score}/100` : 'Not scored'],
        ['Warm introduction', intro.introduction_score ? `${intro.introduction_score}/100` : 'Not scored'],
        ['Direct contact', direct.person_name || 'Not recorded'],
        ['Commercial exposure', money(exposure.expected_commission, exposure.currency)],
      ],
      chain: [
        ['Club', relationship?.organisation_name || 'Relevant club'],
        ['Direct route', `${direct.person_name || 'Contact'} · ${direct.route_score || '–'}`],
        ['Introduction', `${intro.intermediary || 'Intermediary'} · ${intro.introduction_score || '–'}`],
        ['Exposure', money(exposure.expected_commission, exposure.currency)],
        ['Control', 'Agent chooses the route'],
      ],
    };
  }

  if (key === 'career') {
    const gate = career?.career_strategy_gate || {};
    return {
      eyebrow: 'PLAYER CAREER CONTROL',
      title: `${career?.player?.name || 'The player'} is a football pursuit, but ReDream will not treat it as career-approved external action yet.`,
      summary:
        gate.reason ||
        'A strong player-club fit does not override the player-owned career strategy gate.',
      action:
        gate.next_action?.instruction ||
        'Resolve the player strategy gate before escalating external activity.',
      evidence: [
        ['Player', career?.player?.name || 'Recorded player'],
        ['Club need', career?.need?.title || 'Recorded need'],
        ['Pursuit readiness', career?.readiness_score ? `${career.readiness_score}/100` : 'Recorded'],
        ['Career gate', human(gate.state) || 'Human review'],
      ],
      chain: [
        ['Player', career?.player?.name || 'Player'],
        ['Career strategy', human(gate.state) || 'Review'],
        ['Club need', career?.need?.title || 'Need'],
        ['Pursuit', career?.readiness_score ? `${career.readiness_score}/100 readiness` : 'Recorded'],
        ['Control', 'Human career decision'],
      ],
    };
  }

  return {
    eyebrow: 'AGENCY PRIORITY',
    title: `${deal?.title || 'The highest-priority situation'} needs the agent first.`,
    summary:
      deal?.why_now ||
      'ReDream ranks the recorded situation using urgency, commercial context and evidence rather than a generic task list.',
    action: deal?.recommended_action || 'Review the highest-priority next move.',
    evidence: [
      ['Attention score', String(deal?.priority_score || '–')],
      ['Commission exposure', money(deal?.evidence?.expected_commission, deal?.evidence?.currency)],
      ['Evidence health', `${deal?.evidence_health?.score || '–'} · ${human(deal?.evidence_health?.state)}`],
      ['Control mode', human(deal?.actionability?.mode) || 'Review'],
    ],
    chain: [
      ['Signal', 'Overdue deal action'],
      ['Player', pursuits[0]?.player?.name || 'Connected player'],
      ['Club', pursuits[0]?.club?.name || 'Connected club'],
      ['Revenue', money(deal?.evidence?.expected_commission, deal?.evidence?.currency)],
      ['Next move', deal?.recommended_action || 'Review'],
    ],
  };
}

export default function ReDreamDecisionLayer() {
  const { data, mode } = useDecisionData();
  const [selected, setSelected] = useState<QuestionKey>('priority');

  const answer = useMemo(() => buildAnswer(selected, data), [data, selected]);

  const lanes = useMemo(() => {
    const attention = data.attention?.length ? data.attention : FALLBACK.attention || [];
    const grouped: Record<LaneKey, any[]> = {
      delegate: [],
      confirm: [],
      judgement: [],
    };

    for (const item of attention) grouped[laneFor(item)].push(item);

    const relationship = data.scenarios?.relationship || FALLBACK.scenarios?.relationship;
    grouped.judgement.push({
      title: relationship?.organisation_name
        ? `Choose the route into ${relationship.organisation_name}`
        : 'Choose the relationship route',
      recommended_action:
        relationship?.best_introduction?.recommended_action ||
        'Review the strongest introduction route.',
    });

    return grouped;
  }, [data]);

  const choose = (key: QuestionKey) => {
    setSelected(key);
    trackFunnel('product_mode', {
      metadata: { mode: `decision_layer_${key}`, variant: 'v6_decision_layer' },
    });
  };

  const laneCards: Array<{
    key: LaneKey;
    label: string;
    description: string;
    icon: typeof Sparkles;
  }> = [
    {
      key: 'delegate',
      label: 'Autopilot can do',
      description: 'Low-risk, reversible internal work.',
      icon: Sparkles,
    },
    {
      key: 'confirm',
      label: 'Confirm with me',
      description: 'Prepared work that needs input or approval.',
      icon: UserRoundCheck,
    },
    {
      key: 'judgement',
      label: 'Agent judgement',
      description: 'Career, commercial or external decisions.',
      icon: ShieldCheck,
    },
  ];

  return (
    <section className={styles.layer} aria-label="ReDream Agency Decision Layer">
      <div className={styles.topbar}>
        <div>
          <span className={styles.statusDot} data-mode={mode} />
          <BrainCircuit size={17} />
          <strong>AGENCY DECISION LAYER</strong>
        </div>
        <span>{mode === 'live' ? 'Live synthetic ReDream state' : mode === 'loading' ? 'Connecting…' : 'Cached synthetic state'}</span>
      </div>

      <div className={styles.questionBar}>
        <span>ASK REDREAM</span>
        <div>
          {questions.map((question) => {
            const Icon = question.icon;
            const active = selected === question.key;
            return (
              <button
                type="button"
                key={question.key}
                aria-pressed={active}
                className={active ? styles.activeQuestion : undefined}
                onClick={() => choose(question.key)}
              >
                <Icon size={15} />
                {question.prompt}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.answerGrid}>
        <article className={styles.answerCard}>
          <span>{answer.eyebrow}</span>
          <h3>{answer.title}</h3>
          <p>{answer.summary}</p>
          <div className={styles.nextMove}>
            <ArrowRight size={18} />
            <span><small>PREPARED NEXT MOVE</small><strong>{answer.action}</strong></span>
          </div>
        </article>

        <aside className={styles.evidenceCard}>
          <span>WHY REDREAM ANSWERED THIS WAY</span>
          <div className={styles.evidenceList}>
            {answer.evidence.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          <small>{data.product_truth?.scoring || FALLBACK.product_truth?.scoring}</small>
        </aside>
      </div>

      <div className={styles.impactBlock}>
        <div className={styles.blockHead}>
          <GitBranch size={17} />
          <span><strong>CONNECTED IMPACT</strong><small>One question crosses the agency graph instead of stopping in one screen.</small></span>
        </div>
        <div className={styles.impactRail}>
          {answer.chain.map(([label, value], index) => (
            <div className={styles.impactStep} key={`${label}-${index}`}>
              <article><span>{label}</span><strong>{value}</strong></article>
              {index < answer.chain.length - 1 ? <ArrowRight size={16} /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.autonomyBlock}>
        <div className={styles.blockHead}>
          <ShieldCheck size={17} />
          <span><strong>ONE QUEUE. THREE CONTROL LANES.</strong><small>Autonomy is routed by the action, not hidden behind an “AI” button.</small></span>
        </div>
        <div className={styles.laneGrid}>
          {laneCards.map((lane) => {
            const Icon = lane.icon;
            const items = lanes[lane.key];
            const example = items[0];
            return (
              <article key={lane.key} data-lane={lane.key}>
                <div className={styles.laneHead}>
                  <Icon size={17} />
                  <span><strong>{lane.label}</strong><small>{lane.description}</small></span>
                  <b>{items.length}</b>
                </div>
                <div className={styles.laneExample}>
                  <span>{example?.title || 'No current item in this lane'}</span>
                  <small>{example?.recommended_action || example?.why_now || 'ReDream keeps the lane clear until the recorded state requires it.'}</small>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className={styles.truthLine}>
        <Check size={15} />
        <span><strong>Not chatbot theatre.</strong> These answers are assembled from ReDream read models running on an isolated synthetic agency. The public experience cannot mutate the agency or send an external action.</span>
      </div>
    </section>
  );
}
