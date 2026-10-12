'use client';

import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  LoaderCircle,
  Network,
  RefreshCw,
  ShieldCheck,
  Target,
  Undo2,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import { trackFunnel } from '@/lib/redream-funnel';
import {
  loadReDreamPublicSandbox,
  REDREAM_PUBLIC_SANDBOX_CONTRACT,
} from '@/lib/redream-public-sandbox';
import styles from './ReDreamLiveOperatingDemo.module.css';

type ScenarioKey = 'deal' | 'market' | 'player' | 'relationship';
type SourceMode = 'loading' | 'live' | 'cached';

type Actionability = {
  cta?: string | null;
  mode?: string | null;
  risk_level?: string | null;
  action_type?: string | null;
  evidence_gate?: string | null;
  undo_expected?: boolean;
  requires_input?: boolean;
  external_side_effect?: boolean;
};

type Scenario = Record<string, any> | null;

type SandboxData = {
  contract_version: string;
  synthetic: true;
  product_truth: {
    source?: string;
    customer_data?: string;
    autonomy?: string;
    scoring?: string;
  };
  operating_loop: {
    capture?: string;
    memory?: string;
    decide?: string;
    control?: Actionability;
    record?: string;
  };
  scenarios: Record<ScenarioKey, Scenario>;
  pursuits?: any[];
  revenue?: any[];
  network?: {
    summary?: Record<string, number>;
    clubs?: any[];
  };
};

const FALLBACK_DATA: SandboxData = {
  contract_version: REDREAM_PUBLIC_SANDBOX_CONTRACT,
  synthetic: true,
  product_truth: {
    source: 'Cached synthetic ReDream product model.',
    customer_data: 'No real agency, player, club or relationship data is shown.',
    autonomy:
      'External communication and material commercial judgement stay human-controlled.',
    scoring:
      'Readiness, access and evidence scores are operating signals, not transfer-outcome probabilities.',
  },
  operating_loop: {
    capture:
      'A club request, player update, relationship signal or deal change enters ReDream.',
    memory:
      'ReDream connects the relevant player, club, relationship, commitment and commercial context.',
    decide: 'Send updated pack and confirm medical status',
    control: {
      cta: 'Set next action',
      mode: 'input_then_confirm',
      risk_level: 'medium',
      action_type: 'set_deal_next_action',
      evidence_gate: 'ready',
      undo_expected: true,
      requires_input: true,
      external_side_effect: false,
    },
    record:
      'Approved internal actions are recorded in Agency Memory and remain undoable where the action protocol supports it.',
  },
  scenarios: {
    deal: {
      title: 'Elias Novak to Westhaven FC',
      why_now: 'The deal next action is overdue.',
      category: 'deal',
      recommended_action: 'Send updated pack and confirm medical status',
      priority_score: 100,
      evidence: {
        stage: 'interest',
        currency: 'EUR',
        expected_commission: 45000,
        primary_blocker: 'Club wants updated medical and final availability',
      },
      evidence_health: { state: 'strong', score: 91 },
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
      category: 'market',
      recommended_action:
        'Review the need, search the roster and external network, or confirm that there is no suitable player.',
      priority_score: 97,
      evidence: {
        organisation: 'Nordstadt 04',
        need_title: 'Left-footed centre-back',
        position: 'CB',
        need_priority: 4,
      },
      evidence_health: { state: 'strong', score: 93 },
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
      category: 'player_service',
      recommended_action: 'Send updated clips and availability to Westhaven FC',
      priority_score: 96,
      evidence: {
        current_club: 'Adriatic 1919',
        agency_priority: 'high',
        next_action: 'Send updated clips and availability to Westhaven FC',
      },
      evidence_health: { state: 'strong', score: 85 },
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
      country: 'Belgium',
      coverage_state: 'developing',
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
      recommended_network_action:
        'Ask Luca Moretti for an introduction to Thomas De Smet at Riverton United.',
      deal_value_by_currency: [
        { currency: 'EUR', active_deals: 1, expected_commission: 18000 },
      ],
    },
  },
  pursuits: [
    {
      club: { name: 'Westhaven FC' },
      need: { title: 'Explosive right winger U23', need_type: 'confirmed' },
      player: { name: 'Elias Novak', current_club: 'Adriatic 1919' },
      readiness_score: 92,
      readiness_state: 'strong_pursuit',
      best_access_route: {
        person_name: 'Milan de Vries',
        role_title: 'Sporting Director',
        route_score: 87,
        route_state: 'warm',
      },
      career_strategy_gate: {
        state: 'review_strategy_overdue',
        player_confirmation: 'confirmed',
      },
    },
  ],
  revenue: [
    {
      currency: 'EUR',
      active_deals: 2,
      expected_commission: 63000,
      weighted_commission: 34200,
    },
  ],
  network: {
    summary: {
      relevant_clubs: 3,
      warm_access_clubs: 2,
      single_threaded_clubs: 2,
      clubs_with_introduction_option: 1,
    },
    clubs: [],
  },
};

const scenarioMeta: Record<ScenarioKey, { label: string; sub: string; icon: typeof Target }> = {
  deal: { label: 'Live deal', sub: 'Protect momentum and revenue', icon: BriefcaseBusiness },
  market: { label: 'Club demand', sub: 'Turn demand into pursuit', icon: Target },
  player: { label: 'Player service', sub: 'Keep promises visible', icon: UsersRound },
  relationship: { label: 'Relationship route', sub: 'Use the strongest path', icon: Network },
};

const human = (value?: string | null) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (amount?: number | null, currency?: string | null) => {
  if (!amount || !currency) return null;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
  }
};

function useSandboxData() {
  const [data, setData] = useState<SandboxData>(FALLBACK_DATA);
  const [sourceMode, setSourceMode] = useState<SourceMode>('loading');

  useEffect(() => {
    let active = true;

    loadReDreamPublicSandbox<SandboxData>()
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setSourceMode('live');
      })
      .catch((error) => {
        if (!active) return;
        console.warn(
          'ReDream public sandbox fallback',
          error instanceof Error ? error.message : error,
        );
        setData(FALLBACK_DATA);
        setSourceMode('cached');
      });

    return () => { active = false; };
  }, []);

  return { data, sourceMode };
}

function scenarioTitle(key: ScenarioKey, scenario: Scenario) {
  if (!scenario) return scenarioMeta[key].label;
  if (key === 'relationship') return scenario.organisation_name || 'Relationship route';
  return scenario.title || scenarioMeta[key].label;
}

function scenarioWhy(key: ScenarioKey, scenario: Scenario) {
  if (!scenario) return 'ReDream keeps the situation connected to the next controlled action.';
  if (key === 'relationship') {
    return (
      scenario.recommended_network_action ||
      'ReDream compares the recorded direct and introduction routes.'
    );
  }
  return scenario.why_now || 'This situation needs attention now.';
}

function scenarioAction(key: ScenarioKey, scenario: Scenario) {
  if (!scenario) return 'Review the connected context and decide the next move.';
  if (key === 'relationship') {
    return scenario.best_introduction?.recommended_action || scenario.recommended_network_action;
  }
  return scenario.recommended_action;
}

function scenarioActionability(key: ScenarioKey, scenario: Scenario): Actionability {
  if (!scenario) return {};
  if (key === 'relationship') {
    return {
      cta: 'Prepare introduction',
      mode: 'review_only',
      risk_level: 'human_judgement',
      undo_expected: false,
      requires_input: true,
      external_side_effect: true,
    };
  }
  return scenario.actionability || {};
}

function scenarioEvidence(key: ScenarioKey, scenario: Scenario) {
  if (!scenario) return [] as Array<{ label: string; value: string }>;

  if (key === 'deal') {
    const e = scenario.evidence || {};
    return [
      { label: 'Stage', value: human(e.stage) || 'Live deal' },
      { label: 'Commission exposure', value: money(e.expected_commission, e.currency) || 'Recorded' },
      { label: 'Blocker', value: e.primary_blocker || 'No blocker recorded' },
      { label: 'Evidence health', value: `${scenario.evidence_health?.score || '–'} · ${human(scenario.evidence_health?.state)}` },
    ];
  }

  if (key === 'market') {
    const e = scenario.evidence || {};
    return [
      { label: 'Need', value: e.need_title || 'Recorded club demand' },
      { label: 'Position', value: e.position || 'Open' },
      { label: 'Priority', value: e.need_priority ? `${e.need_priority}/5` : 'Open' },
      { label: 'Evidence health', value: `${scenario.evidence_health?.score || '–'} · ${human(scenario.evidence_health?.state)}` },
    ];
  }

  if (key === 'player') {
    const e = scenario.evidence || {};
    return [
      { label: 'Current club', value: e.current_club || 'Not set' },
      { label: 'Agency priority', value: human(e.agency_priority) || 'Normal' },
      { label: 'Commitment', value: e.next_action || 'Review next action' },
      { label: 'Evidence health', value: `${scenario.evidence_health?.score || '–'} · ${human(scenario.evidence_health?.state)}` },
    ];
  }

  const direct = scenario.best_route || {};
  const intro = scenario.best_introduction || {};
  return [
    { label: 'Direct route', value: `${direct.person_name || 'No route'}${direct.role_title ? ` · ${direct.role_title}` : ''}` },
    { label: 'Direct access', value: direct.route_score ? `${direct.route_score}/100 · ${human(direct.route_state)}` : 'Not scored' },
    { label: 'Introduction', value: intro.intermediary ? `${intro.intermediary} → ${intro.target_contact}` : 'No stronger introduction recorded' },
    { label: 'Introduction strength', value: intro.introduction_score ? `${intro.introduction_score}/100 · ${human(intro.introduction_state)}` : 'Not available' },
  ];
}

function scenarioContext(key: ScenarioKey, scenario: Scenario) {
  if (!scenario) return 'Synthetic agency situation';
  if (key === 'relationship') {
    return `${scenario.country || 'Market'} · ${human(scenario.coverage_state) || 'Relationship coverage'}`;
  }
  const e = scenario.evidence || {};
  return [e.organisation, e.current_club, e.stage && human(e.stage)].filter(Boolean).join(' · ') || scenarioMeta[key].sub;
}

function reviewLabel(actionability: Actionability) {
  if (actionability.external_side_effect) return 'Your approval required';
  if (actionability.mode === 'input_then_confirm') return 'Review before saving';
  if (actionability.mode === 'one_tap') return 'Ready to prepare';
  return 'Review required';
}

function ControlBoundary({ actionability }: { actionability: Actionability }) {
  const external = actionability.external_side_effect === true;
  return (
    <div className={styles.controlBoundary}>
      <div>
        <ShieldCheck size={17} />
        <span>
          <small>YOUR APPROVAL</small>
          <strong>{reviewLabel(actionability)}</strong>
        </span>
      </div>
      <div className={styles.controlPills}>
        {actionability.undo_expected ? <span><Undo2 size={13} /> Undo available</span> : null}
        {!external ? <span><Check size={13} /> Nothing sent</span> : null}
      </div>
    </div>
  );
}

export default function ReDreamLiveOperatingDemo({
  variant = 'full',
}: {
  variant?: 'hero' | 'full';
}) {
  const { data, sourceMode } = useSandboxData();
  const [selected, setSelected] = useState<ScenarioKey>('deal');
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const scenario = data.scenarios?.[selected] || FALLBACK_DATA.scenarios[selected];
  const title = scenarioTitle(selected, scenario);
  const why = scenarioWhy(selected, scenario);
  const action = scenarioAction(selected, scenario);
  const actionability = scenarioActionability(selected, scenario);
  const evidence = useMemo(() => scenarioEvidence(selected, scenario), [selected, scenario]);
  const pursuit = data.pursuits?.[0] || FALLBACK_DATA.pursuits?.[0];
  const revenue = data.revenue?.[0] || FALLBACK_DATA.revenue?.[0];

  const selectScenario = (key: ScenarioKey) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setStage(0);
    setSelected(key);
    trackFunnel('scenario_select', { scenario_kind: key });
  };

  const runLoop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage(0);
    setRunning(true);
    trackFunnel('scenario_run', { scenario_kind: selected });
    trackFunnel('product_mode', {
      metadata: { mode: 'live_synthetic_operating_loop', variant: 'v6' },
    });

    let next = 0;
    timerRef.current = setInterval(() => {
      next += 1;
      setStage(next);
      if (next >= 4) {
        if (timerRef.current) clearInterval(timerRef.current);
        setRunning(false);
        trackFunnel('scenario_complete', { scenario_kind: selected });
      }
    }, 520);
  };

  if (variant === 'hero') {
    return (
      <aside className={styles.heroFrame} aria-label="Example agency">
        <div className={styles.frameChrome}>
          <span className={styles.liveDot} data-mode={sourceMode} />
          <strong>{'EXAMPLE AGENCY'}</strong>
          <small>No customer data</small>
        </div>

        <div className={styles.heroCommand}>
          <span className={styles.commandEyebrow}>NEEDS YOU NOW</span>
          <h2>{scenarioTitle('deal', data.scenarios.deal)}</h2>
          <p>{scenarioWhy('deal', data.scenarios.deal)}</p>
          <div className={styles.heroDecision}>
            <span>PREPARED NEXT MOVE</span>
            <strong>{scenarioAction('deal', data.scenarios.deal)}</strong>
          </div>
        </div>

        <div className={styles.heroSignals}>
          <div>
            <Target size={16} />
            <span><small>PLAYER × CLUB</small><strong>{pursuit?.readiness_score || 92} readiness</strong></span>
          </div>
          <div>
            <Network size={16} />
            <span><small>RELATIONSHIP ROUTE</small><strong>{pursuit?.best_access_route?.route_score || 87} access</strong></span>
          </div>
          <div>
            <CircleDollarSign size={16} />
            <span><small>ACTIVE COMMISSION</small><strong>{money(revenue?.expected_commission, revenue?.currency) || 'Recorded'}</strong></span>
          </div>
        </div>

        <ControlBoundary actionability={scenarioActionability('deal', data.scenarios.deal)} />
        <p className={styles.syntheticNote}>Explore the example Northstar agency. This demo uses synthetic data.</p>
      </aside>
    );
  }

  const steps = [
    { label: 'Situation', value: title },
    { label: 'Context', value: 'Relevant agency information' },
    { label: 'Next step', value: action || 'Review next move' },
    { label: 'Approval', value: reviewLabel(actionability) },
    { label: 'History', value: actionability.undo_expected ? 'Recorded with undo' : 'Recorded' },
  ];

  return (
    <section className={styles.shell} aria-label="Interactive agency demo">
      <div className={styles.shellTop}>
        <div>
          <span className={styles.liveDot} data-mode={sourceMode} />
          <strong>EXAMPLE AGENCY</strong>
        </div>
        <span>{'Interactive demo'}</span>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.scenarioRail} aria-label="Agency situations">
          <span>CHOOSE A SITUATION</span>
          {Object.entries(scenarioMeta).map(([key, meta]) => {
            const Icon = meta.icon;
            const active = selected === key;
            return (
              <button
                type="button"
                key={key}
                aria-pressed={active}
                className={active ? styles.activeScenario : undefined}
                onClick={() => selectScenario(key as ScenarioKey)}
              >
                <Icon size={17} />
                <span><strong>{meta.label}</strong><small>{meta.sub}</small></span>
                <ArrowRight size={15} />
              </button>
            );
          })}

          <div className={styles.sandboxTruth}>
            <ShieldCheck size={16} />
            <span><strong>Example agency data</strong><small>This demo uses no customer records.</small></span>
          </div>
        </aside>

        <div className={styles.operatingCanvas}>
          <div className={styles.canvasHead}>
            <div>
              <span>{scenarioMeta[selected].label.toUpperCase()}</span>
              <h3>{title}</h3>
              <p>{scenarioContext(selected, scenario)}</p>
            </div>
            {selected !== 'relationship' && scenario?.priority_score ? (
              <div className={styles.priorityScore}><small>ATTENTION</small><strong>{scenario.priority_score}</strong></div>
            ) : selected === 'relationship' && scenario?.best_introduction?.introduction_score ? (
              <div className={styles.priorityScore}><small>INTRO ROUTE</small><strong>{scenario.best_introduction.introduction_score}</strong></div>
            ) : null}
          </div>

          <div className={styles.stepRail} aria-label="ReDream operating loop">
            {steps.map((item, index) => (
              <div key={item.label} data-state={index < stage ? 'done' : index === stage ? 'active' : 'waiting'}>
                <span>{index < stage ? <Check size={14} /> : index + 1}</span>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>

          <div className={styles.stageBody} aria-live="polite">
            {stage === 0 ? (
              <div className={styles.situationPanel}>
                <span>WHY THIS NEEDS ATTENTION</span>
                <h4>{why}</h4>
                <p>ReDream works from recorded agency context.</p>
              </div>
            ) : null}

            {stage === 1 ? (
              <div className={styles.memoryPanel}>
                <div className={styles.panelLabel}><Network size={16} /><span><small>AGENCY MEMORY</small><strong>Only the evidence relevant to this decision</strong></span></div>
                <div className={styles.evidenceGrid}>
                  {evidence.map((item) => (
                    <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
                  ))}
                </div>
              </div>
            ) : null}

            {stage === 2 ? (
              <div className={styles.decisionPanel}>
                <span>PREPARED NEXT MOVE</span>
                <h4>{action || 'Review the connected context and choose the next move.'}</h4>
                <div><BadgeCheck size={17} /><p>Evidence and recommendation stay separate. The score is a signal, not a prediction.</p></div>
              </div>
            ) : null}

            {stage === 3 ? <ControlBoundary actionability={actionability} /> : null}

            {stage >= 4 ? (
              <div className={styles.recordPanel}>
                <div><Check size={18} /><span><small>AGENCY HISTORY</small><strong>{'Approved work stays in your agency history.'}</strong></span></div>
                <p>{actionability.external_side_effect ? 'Sharing and negotiations need your approval.' : 'Each change is recorded, with undo where supported.'}</p>
              </div>
            ) : null}
          </div>

          <div className={styles.canvasFooter}>
            <div>
              <span>{'Example agency'}</span>
              <small>{'Readiness and access scores are not transfer probabilities.'}</small>
            </div>
            <button type="button" onClick={runLoop} disabled={running}>
              {running ? <LoaderCircle size={16} className={styles.spin} /> : stage >= 4 ? <RefreshCw size={16} /> : <ArrowRight size={16} />}
              {running ? 'Playing demo' : stage >= 4 ? 'Run it again' : 'Watch the demo'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.demoClose}>
        <div>
          <span>THIS IS THE DIFFERENCE</span>
          <strong>ReDream connects the context, prioritises the work and records what happens next.</strong>
        </div>
        <ReDreamDemoRequestButton
          className={styles.demoButton}
          label="Run this on my agency"
          trackingKey={`v6_live_${selected}`}
          initialPriority={`${scenarioMeta[selected].label}: ${title}. ${action || why}`}
        />
      </div>
    </section>
  );
}
