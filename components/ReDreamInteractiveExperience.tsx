'use client';

import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import styles from './ReDreamInteractiveExperience.module.css';

type ScenarioKey = 'club' | 'player' | 'deal' | 'relationship';

type Scenario = {
  key: ScenarioKey;
  label: string;
  short: string;
  example: string;
  decision: string;
  route: string;
  icon: typeof Target;
};

const scenarios: Scenario[] = [
  {
    key: 'club',
    label: 'Club need',
    short: 'Turn demand into a controlled pursuit',
    example:
      'Meridian FC need a left-footed winger under 23. Permanent or loan. We have a warm route through their sporting director.',
    decision: 'Approve pursuit and relationship route',
    route: 'Need -> Match -> Relationship -> Pursuit',
    icon: Target,
  },
  {
    key: 'player',
    label: 'Player situation',
    short: 'Turn a player update into service and market work',
    example:
      'Leo Martin wants clarity on his summer options. His contract has 14 months left and we promised him an update this week.',
    decision: 'Approve player service plan',
    route: 'Player -> Commitment -> Market -> Service',
    icon: UsersRound,
  },
  {
    key: 'deal',
    label: 'Live deal',
    short: 'Turn negotiation detail into the next commercial move',
    example:
      'Riverton came back at 420k plus bonuses. The player side wants improved base salary and a sell-on. We need to respond tomorrow.',
    decision: 'Review prepared counter position',
    route: 'Deal -> Terms -> Guardrails -> Decision',
    icon: BriefcaseBusiness,
  },
  {
    key: 'relationship',
    label: 'Relationship',
    short: 'Turn access into the strongest route',
    example:
      'We know the sporting director at Northstar through James. Last meaningful contact was earlier this month and we have a relevant player to discuss.',
    decision: 'Approve warm introduction route',
    route: 'Person -> Club -> Relationship -> Follow-up',
    icon: Network,
  },
];

const stages = [
  { label: 'Capture', copy: 'Signal received' },
  { label: 'Understand', copy: 'Agency context structured' },
  { label: 'Connect', copy: 'Memory and routes linked' },
  { label: 'Prepare', copy: 'Next action prepared' },
  { label: 'Needs You', copy: 'Human decision ready' },
];

const constraintWords = [
  'under',
  'over',
  'loan',
  'permanent',
  'contract',
  'salary',
  'bonus',
  'sell-on',
  'tomorrow',
  'today',
  'week',
  'warm',
  'sporting director',
];

function capitalisedEntities(value: string) {
  const candidates = value.match(/\b[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2}\b/g) || [];
  const stop = new Set(['We', 'The', 'His', 'Her', 'Permanent', 'Loan', 'Live', 'Club']);

  return Array.from(new Set(candidates.filter((item) => !stop.has(item)))).slice(0, 3);
}

function evidenceFromText(value: string, scenario: ScenarioKey) {
  const lower = value.toLowerCase();
  const evidence = constraintWords
    .filter((word) => lower.includes(word))
    .slice(0, 3)
    .map((word) => {
      if (word === 'warm') return 'Warm relationship route stated';
      if (word === 'tomorrow' || word === 'today' || word === 'week') return 'Time-sensitive commitment stated';
      if (word === 'salary' || word === 'bonus' || word === 'sell-on') return 'Commercial term stated';
      if (word === 'contract') return 'Contract context stated';
      if (word === 'loan' || word === 'permanent') return 'Transfer structure stated';
      if (word === 'sporting director') return 'Decision-maker context stated';
      return `Constraint stated: ${word}`;
    });

  if (!evidence.length) {
    evidence.push(
      scenario === 'club'
        ? 'Recruitment demand stated'
        : scenario === 'player'
          ? 'Player service situation stated'
          : scenario === 'deal'
            ? 'Live commercial situation stated'
            : 'Relationship context stated',
    );
  }

  return evidence;
}

export default function ReDreamInteractiveExperience() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('club');
  const scenario = scenarios.find((item) => item.key === scenarioKey) || scenarios[0];
  const [note, setNote] = useState(scenario.example);
  const [stage, setStage] = useState(4);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const entities = useMemo(() => capitalisedEntities(note), [note]);
  const evidence = useMemo(() => evidenceFromText(note, scenarioKey), [note, scenarioKey]);

  const chooseScenario = (key: ScenarioKey) => {
    const next = scenarios.find((item) => item.key === key) || scenarios[0];
    setScenarioKey(key);
    setNote(next.example);
    setStage(4);
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const runScenario = () => {
    if (!note.trim() || isRunning) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    setStage(0);
    setIsRunning(true);

    let nextStage = 0;
    intervalRef.current = setInterval(() => {
      nextStage += 1;
      setStage(nextStage);
      if (nextStage >= stages.length - 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRunning(false);
      }
    }, 520);
  };

  const demoContext = `Homepage scenario: ${scenario.label}. ${note.trim()}`;

  return (
    <section className={styles.shell} aria-label="Try the ReDream operating flow">
      <div className={styles.topline}>
        <div>
          <span className={styles.statusDot} />
          INTERACTIVE PRODUCT DEMONSTRATION
        </div>
        <span>Browser-only until you submit a demo request</span>
      </div>

      <div className={styles.scenarioTabs} role="tablist" aria-label="Agency situation">
        {scenarios.map((item) => {
          const Icon = item.icon;
          const active = item.key === scenarioKey;

          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? styles.activeTab : undefined}
              onClick={() => chooseScenario(item.key)}
            >
              <Icon size={14} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className={styles.capturePanel}>
        <div className={styles.captureLabel}>
          <span>
            <Bot size={14} />
            Tell ReDream
          </span>
          <small>{scenario.short}</small>
        </div>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={700}
          aria-label="Agency situation"
        />

        <div className={styles.captureFooter}>
          <span>
            Use real names if appropriate. This demo does not query or verify live football data.
          </span>
          <button type="button" onClick={runScenario} disabled={isRunning || !note.trim()}>
            {isRunning ? 'Operating...' : 'Run ReDream'}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className={styles.operatingCanvas} aria-live="polite">
        <div className={styles.stageRail}>
          {stages.map((item, index) => {
            const complete = index <= stage;
            const current = index === stage;

            return (
              <div
                key={item.label}
                className={`${styles.stage} ${complete ? styles.stageComplete : ''} ${current ? styles.stageCurrent : ''}`}
              >
                <span>{complete ? <Check size={11} /> : index + 1}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.copy}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.memoryCanvas}>
          <div className={styles.canvasLabel}>
            <span>AGENCY MEMORY</span>
            <small>Context becomes connected work</small>
          </div>

          <div className={styles.memoryGraph}>
            <div className={`${styles.node} ${styles.nodePrimary}`}>
              <span>{scenario.label}</span>
              <strong>{entities[0] || 'Agency signal'}</strong>
            </div>

            <span className={`${styles.route} ${stage >= 1 ? styles.routeLive : ''}`} />

            <div className={`${styles.node} ${stage >= 1 ? styles.nodeLive : ''}`}>
              <span>Context</span>
              <strong>{scenario.route.split(' -> ')[1]}</strong>
            </div>

            <span className={`${styles.route} ${stage >= 2 ? styles.routeLive : ''}`} />

            <div className={`${styles.node} ${stage >= 2 ? styles.nodeLive : ''}`}>
              <span>Route</span>
              <strong>{scenario.route.split(' -> ')[2]}</strong>
            </div>

            <span className={`${styles.route} ${stage >= 3 ? styles.routeLive : ''}`} />

            <div className={`${styles.node} ${stage >= 3 ? styles.nodeLive : ''}`}>
              <span>Next work</span>
              <strong>{scenario.route.split(' -> ')[3]}</strong>
            </div>
          </div>

          <div className={styles.evidenceGrid}>
            <div>
              <span>FROM YOUR NOTE</span>
              {entities.length ? (
                entities.map((entity) => <strong key={entity}>{entity}</strong>)
              ) : (
                <strong>Situation captured</strong>
              )}
            </div>

            <div>
              <span>EVIDENCE USED</span>
              {evidence.map((item) => (
                <strong key={item}>{item}</strong>
              ))}
            </div>
          </div>
        </div>

        <div className={`${styles.decisionPanel} ${stage >= 4 ? styles.decisionReady : ''}`}>
          <div className={styles.decisionIcon}>
            <Sparkles size={17} />
          </div>
          <div className={styles.decisionCopy}>
            <span>NEEDS YOU</span>
            <strong>{scenario.decision}</strong>
            <small>Evidence ready. ReDream prepares the move. The agent owns the decision.</small>
          </div>
          <span className={styles.humanChip}>
            <ShieldCheck size={12} />
            Human decision
          </span>
        </div>
      </div>

      <div className={styles.conversionBar}>
        <div>
          <span>Imagine this running across your entire agency.</span>
          <strong>Bring one real situation. ReDream starts from there.</strong>
        </div>
        <ReDreamDemoRequestButton
          className={styles.conversionButton}
          label="Run ReDream on my agency"
          initialPriority={demoContext}
        />
      </div>

      <p className={styles.truthNote}>
        This on-page demonstration is illustrative. It does not represent a live requirement, endorsement or relationship involving any club or player unless you enter that information yourself.
      </p>
    </section>
  );
}
