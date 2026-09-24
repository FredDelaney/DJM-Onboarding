'use client';

import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import { trackFunnel } from '@/lib/redream-funnel';
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
    short: 'A club asks you for a player',
    example:
      'Meridian FC need a left-footed winger under 23. Permanent or loan. We have a warm route through their sporting director.',
    decision: 'Check suitable players and review an introduction',
    route: 'Need -> Match -> Relationship -> Pursuit',
    icon: Target,
  },
  {
    key: 'player',
    label: 'Player situation',
    short: 'A player is waiting for your advice',
    example:
      'Leo Martin wants clarity on his summer options. His contract has 14 months left and we promised him an update this week.',
    decision: 'Approve player service plan',
    route: 'Player -> Commitment -> Market -> Service',
    icon: UsersRound,
  },
  {
    key: 'deal',
    label: 'Live deal',
    short: 'An offer needs a response',
    example:
      'Riverton came back at 420k plus bonuses. The player side wants improved base salary and a sell-on. We need to respond tomorrow.',
    decision: 'Review prepared counter position',
    route: 'Deal -> Terms -> Guardrails -> Decision',
    icon: BriefcaseBusiness,
  },
  {
    key: 'relationship',
    label: 'Relationship',
    short: 'You know someone who could open a door',
    example:
      'We know the sporting director at Northstar through James. Last meaningful contact was earlier this month and we have a relevant player to discuss.',
    decision: 'Approve warm introduction route',
    route: 'Person -> Club -> Relationship -> Follow-up',
    icon: Network,
  },
];

const stages = ['Capture', 'Understand', 'Connect', 'Prepare', 'Needs You'];

function capitalisedEntities(value: string) {
  const candidates = value.match(/\b[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2}\b/g) || [];
  const stop = new Set(['We', 'The', 'His', 'Her', 'Permanent', 'Loan', 'Live', 'Club']);

  return Array.from(new Set(candidates.filter((item) => !stop.has(item)))).slice(0, 3);
}

function evidenceFromText(value: string, scenario: ScenarioKey) {
  const lower = value.toLowerCase();
  const evidence: string[] = [];
  const add = (item: string | null) => {
    if (item && !evidence.includes(item)) evidence.push(item);
  };

  if (scenario === 'club') {
    const foot = lower.includes('left-footed')
      ? 'left-footed'
      : lower.includes('right-footed')
        ? 'right-footed'
        : null;
    const role = lower.match(/\b(winger|striker|forward|midfielder|centre-back|center-back|full-back|goalkeeper)\b/)?.[1] || null;
    if (role) add(`Role requirement: ${foot ? `${foot} ` : ''}${role}`);

    const age = lower.match(/\b(?:u|under)\s*[- ]?(\d{2})\b/)?.[1] || null;
    if (age) add(`Age requirement: under ${age}`);

    const permanent = lower.includes('permanent');
    const loan = lower.includes('loan');
    if (permanent && loan) add('Transfer options: permanent or loan');
    else if (permanent) add('Transfer option: permanent');
    else if (loan) add('Transfer option: loan');

    if (lower.includes('warm')) add('Warm relationship route stated');
    if (lower.includes('sporting director')) add('Decision-maker context stated');
  }

  if (scenario === 'player') {
    if (lower.includes('summer options')) add('Summer market options requested');
    const months = lower.match(/\b(\d{1,2})\s+months?\b/)?.[1] || null;
    if (months) add(`Contract runway: ${months} months`);
    if (lower.includes('promised') && lower.includes('update')) {
      add(lower.includes('this week') ? 'Service commitment due this week' : 'Service commitment recorded');
    }
    if (lower.includes('clarity')) add('Player clarity request stated');
  }

  if (scenario === 'deal') {
    const amount = value.match(/\b(?:€|£|\$)?\s*(\d+(?:[.,]\d+)?)\s*(k|m)\b/i);
    if (amount) add(`Offer amount stated: ${amount[1]}${amount[2].toLowerCase()}`);
    if (lower.includes('bonus')) add('Bonuses included in offer');
    if (lower.includes('salary')) add('Salary improvement requested');
    if (lower.includes('sell-on')) add('Sell-on requested');
    if (lower.includes('tomorrow')) add('Response deadline: tomorrow');
  }

  if (scenario === 'relationship') {
    const through = value.match(/\bthrough\s+([A-Z][A-Za-z'-]+)/)?.[1] || null;
    if (through) add(`Relationship route through ${through}`);
    if (lower.includes('sporting director')) add('Decision-maker relationship stated');
    if (lower.includes('earlier this month')) add('Recent contact timing stated');
    if (lower.includes('relevant player')) add('Relevant player route stated');
  }

  if (!evidence.length) {
    add(
      scenario === 'club'
        ? 'Recruitment demand captured'
        : scenario === 'player'
          ? 'Player service situation captured'
          : scenario === 'deal'
            ? 'Live commercial situation captured'
            : 'Relationship context captured',
    );
  }

  return evidence.slice(0, 4);
}

export default function ReDreamInteractiveExperience() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('club');
  const scenario = scenarios.find((item) => item.key === scenarioKey) || scenarios[0];
  const [note, setNote] = useState(scenario.example);
  const [stage, setStage] = useState(-1);
  const [hasRun, setHasRun] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (hasRun) resultRef.current?.focus({ preventScroll: false });
  }, [hasRun]);

  const entities = useMemo(() => capitalisedEntities(note), [note]);
  const evidence = useMemo(() => evidenceFromText(note, scenarioKey), [note, scenarioKey]);

  const chooseScenario = (key: ScenarioKey) => {
    const next = scenarios.find((item) => item.key === key) || scenarios[0];
    trackFunnel('scenario_select', { scenario_kind: key });
    setScenarioKey(key);
    setNote(next.example);
    setStage(-1);
    setHasRun(false);
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const runScenario = () => {
    if (!note.trim() || isRunning) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    trackFunnel('scenario_run', { scenario_kind: scenarioKey });
    setHasRun(false);
    setStage(0);
    setIsRunning(true);

    let nextStage = 0;
    intervalRef.current = setInterval(() => {
      nextStage += 1;
      setStage(nextStage);
      if (nextStage >= stages.length - 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        trackFunnel('scenario_complete', { scenario_kind: scenarioKey });
        setIsRunning(false);
        setHasRun(true);
      }
    }, 420);
  };

  const demoContext = `Homepage scenario: ${scenario.label}. ${note.trim()}`;

  return (
    <section className={styles.shell} aria-label="Try ReDream with an example">
      <div className={styles.topline}>
        <div>
          <span className={styles.statusDot} />
          INTERACTIVE PRODUCT DEMONSTRATION
        </div>
        <span>Browser-only until you submit a demo request</span>
      </div>

      <ol className={styles.demoSteps} aria-label="Demo instructions">
        <li aria-current={!isRunning && !hasRun ? 'step' : undefined}><b>1</b> Pick a situation</li>
        <li aria-current={isRunning ? 'step' : undefined}><b>2</b> Run ReDream</li>
        <li aria-current={hasRun ? 'step' : undefined}><b>3</b> See the next move</li>
      </ol>
      <div className={styles.scenarioTabs} role="group" aria-label="Pick a situation">
        {scenarios.map((item) => {
          const Icon = item.icon;
          const active = item.key === scenarioKey;

          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              className={active ? styles.activeTab : undefined}
              onClick={() => chooseScenario(item.key)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className={styles.capturePanel}>
        <div className={styles.captureLabel}>
          <span>
            <Bot size={15} />
            Tell ReDream
          </span>
          <small>{scenario.short}</small>
        </div>

        <textarea
          value={note}
          disabled={isRunning}
          onChange={(event) => {
            setNote(event.target.value);
            setHasRun(false);
            setStage(-1);
          }}
          rows={3}
          maxLength={700}
          aria-label="Agency situation"
        />

        <div className={styles.captureFooter}>
          <span>
            Use real names if appropriate. This demo does not query or verify live football data.
          </span>
          <button type="button" onClick={runScenario} disabled={isRunning || !note.trim()}>
            {isRunning ? 'Preparing your next move...' : 'Run ReDream'}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <p className={styles.runStatus} role="status">
        {isRunning ? `${stages[stage]}: preparing this example...` : hasRun ? 'Your suggested next move is ready.' : 'Ready when you are. Choose an example above, then press Run ReDream.'}
      </p>
      {hasRun ? <div className={styles.operatingCanvas} ref={resultRef} tabIndex={-1} aria-label="Your suggested next move">
        <h3 className={styles.resultTitle}>3. Here is your next move</h3>
        <div className={styles.processLine} aria-label="Capture, Understand, Connect, Prepare, Needs You">
          {stages.map((item, index) => {
            const complete = index <= stage;
            const current = index === stage;
            return (
              <div
                key={item}
                className={`${styles.processStep} ${complete ? styles.processComplete : ''} ${current ? styles.processCurrent : ''}`}
              >
                <span>{complete ? <Check size={10} /> : index + 1}</span>
                <strong>{item}</strong>
              </div>
            );
          })}
        </div>

        <div className={styles.resultGrid}>
          <div className={styles.memoryCanvas}>
            <div className={styles.canvasLabel}>
              <span>AGENCY MEMORY</span>
              <small>Your note, connected to a next step</small>
            </div>

            <div className={styles.memoryGraph}>
              <div className={`${styles.node} ${styles.nodePrimary}`}>
                <span>{scenario.label}</span>
                <strong>{entities[0] || 'Your situation'}</strong>
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
          </div>

          <div className={`${styles.decisionPanel} ${stage >= 4 ? styles.decisionReady : ''}`}>
            <div className={styles.decisionTop}>
              <div className={styles.decisionIcon}>
                <Sparkles size={18} />
              </div>
              <div className={styles.decisionCopy}>
                <span>NEEDS YOU: REVIEW THIS SUGGESTION</span>
                <strong>{scenario.decision}</strong>
                <small>ReDream prepares the move. The agent owns the decision.</small>
              </div>
            </div>

            <div className={styles.evidenceList}>
              <span>EVIDENCE USED</span>
              {evidence.map((item) => (
                <div key={item}>
                  <Check size={11} />
                  <strong>{item}</strong>
                </div>
              ))}
            </div>

            <span className={styles.humanChip}>
              <ShieldCheck size={12} />
              Human decision
            </span>
          </div>
        </div>
      </div> : null}

      {hasRun ? <div className={styles.conversionBar}>
        <div>
          <span>Imagine this running across your entire agency.</span>
          <strong>Bring one real situation. ReDream starts from there.</strong>
        </div>
        <ReDreamDemoRequestButton
          className={styles.conversionButton}
          label="Run ReDream on my agency"
          initialPriority={demoContext}
          trackingKey="interactive_result"
        />
      </div> : null}

      <p className={styles.truthNote}>
        This is an illustrative, browser-only example using simple rules, not a live search of your agency. Suggestions are starting points for review. This on-page demonstration is illustrative. It does not represent a live requirement, endorsement or relationship involving any club or player unless you enter that information yourself.
      </p>
    </section>
  );
}

