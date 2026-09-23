'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Network,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';

import styles from './ReDreamProductStory.module.css';

type ModeKey = 'needs' | 'market' | 'player' | 'deal';

const modes = [
  {
    key: 'needs' as ModeKey,
    label: 'Needs You',
    eyebrow: 'HOME',
    title: 'Know where human judgement is needed now.',
    copy:
      'ReDream collapses commitments, exceptions, market signals and deal blockers into a ranked decision queue instead of asking the agent to hunt for work.',
    icon: Sparkles,
  },
  {
    key: 'market' as ModeKey,
    label: 'Market Pursuit',
    eyebrow: 'MARKET',
    title: 'Turn club demand into a route, owner and next move.',
    copy:
      'A need becomes structured constraints, player matches, Access Intelligence and a controlled pursuit without losing the original evidence.',
    icon: Target,
  },
  {
    key: 'player' as ModeKey,
    label: 'Player 360',
    eyebrow: 'PLAYERS',
    title: 'See whether the agency is actually servicing the player.',
    copy:
      'Player Service, commitments, career timing, representation and market activity live around one trusted picture instead of across separate conversations.',
    icon: UsersRound,
  },
  {
    key: 'deal' as ModeKey,
    label: 'Deal War Room',
    eyebrow: 'DEALS',
    title: 'Keep commercial momentum through negotiation and collection.',
    copy:
      'Deal Control keeps ownership, terms, guardrails, next actions, Closeout & Collection and commission on the same commercial thread.',
    icon: BriefcaseBusiness,
  },
];

function Workspace({ mode }: { mode: ModeKey }) {
  if (mode === 'market') {
    return (
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceHeader}>
          <div>
            <span>LIVE CLUB NEED</span>
            <strong>Left winger · Belgium</strong>
            <small>U23 · left-footed · permanent or loan</small>
          </div>
          <span className={styles.liveState}>Pursuit open</span>
        </div>

        <div className={styles.marketColumns}>
          <div className={styles.panel}>
            <span>PLAYER MATCH</span>
            <div className={styles.rankRow}><strong>Leo Martin</strong><small>Mandatory constraints pass</small><b>01</b></div>
            <div className={styles.rankRow}><strong>Niko Varga</strong><small>Role fit, timing review</small><b>02</b></div>
            <div className={styles.rankRow}><strong>Amir Costa</strong><small>Loan route only</small><b>03</b></div>
          </div>
          <div className={styles.panel}>
            <span>ACCESS INTELLIGENCE</span>
            <div className={styles.routeCard}><Network size={15} /><div><strong>Warm route through James</strong><small>Direct relationship · sporting director</small></div></div>
            <div className={styles.routeCard}><ArrowRight size={15} /><div><strong>Next move</strong><small>Prepare player introduction for approval</small></div></div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'player') {
    return (
      <div className={styles.workspaceBody}>
        <div className={styles.playerHero}>
          <div className={styles.avatar}>LM</div>
          <div><span>REPRESENTED PLAYER</span><strong>Leo Martin</strong><small>RW · contract 14 months</small></div>
          <span className={styles.liveState}>Service on track</span>
        </div>
        <div className={styles.metricGrid}>
          <div><span>PLAYER SERVICE</span><strong>1 commitment due</strong><small>Update promised this week</small></div>
          <div><span>MARKET</span><strong>3 live routes</strong><small>2 warm · 1 direct</small></div>
          <div><span>CAREER TIMING</span><strong>Decision window open</strong><small>Contract context verified</small></div>
          <div><span>NEXT REVIEW</span><strong>8 Oct</strong><small>Agent-owned</small></div>
        </div>
      </div>
    );
  }

  if (mode === 'deal') {
    return (
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceHeader}>
          <div><span>LIVE DEAL</span><strong>Riverton United · Leo Martin</strong><small>Negotiation in progress</small></div>
          <span className={styles.liveState}>Active</span>
        </div>
        <div className={styles.dealTimeline}>
          <div className={styles.timelineItem}><span>01</span><div><strong>Offer received</strong><small>420k + bonuses</small></div></div>
          <div className={styles.timelineItem}><span>02</span><div><strong>Guardrails checked</strong><small>Player salary and sell-on priorities recorded</small></div></div>
          <div className={styles.timelineItem}><span>03</span><div><strong>Counter prepared</strong><small>Human approval required</small></div></div>
        </div>
        <div className={styles.moneyBar}><CircleDollarSign size={15} /><span><strong>Closeout & Collection</strong><small>Commission stays connected after agreement</small></span></div>
      </div>
    );
  }

  return (
    <div className={styles.workspaceBody}>
      <div className={styles.needsHeader}>
        <div><span>DAILY OPERATING PICTURE</span><strong>Needs You</strong><small>Evidence-ranked decisions, not another task list</small></div>
        <b>4</b>
      </div>
      <div className={styles.queue}>
        <div className={styles.queueRow}><i /><div><strong>Approve Meridian FC pursuit</strong><small>Player fit and warm route ready</small></div><span>Now</span></div>
        <div className={styles.queueRow}><i /><div><strong>Resolve Leo Martin service commitment</strong><small>Promised update due today</small></div><span>Today</span></div>
        <div className={styles.queueRow}><i className={styles.soft} /><div><strong>Review Riverton counter position</strong><small>Commercial guardrails prepared</small></div><span>2h</span></div>
      </div>
    </div>
  );
}

export default function ReDreamProductStory() {
  const [mode, setMode] = useState<ModeKey>('needs');
  const active = modes.find((item) => item.key === mode) || modes[0];

  return (
    <div className={styles.story}>
      <div className={styles.storyCopy}>
        <span>{active.eyebrow}</span>
        <h3>{active.title}</h3>
        <p>{active.copy}</p>

        <div className={styles.modeNav} role="tablist" aria-label="ReDream product areas">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={mode === item.key}
                className={mode === item.key ? styles.activeMode : undefined}
                onClick={() => setMode(item.key)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                <ArrowRight size={13} />
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.workspaceTop}>
          <div className={styles.windowDots}><i /><i /><i /></div>
          <span>ILLUSTRATIVE REDREAM WORKSPACE</span>
          <span className={styles.systemState}>Agency live</span>
        </div>
        <Workspace mode={mode} />
      </div>
    </div>
  );
}
