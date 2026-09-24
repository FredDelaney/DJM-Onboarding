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

import { trackFunnel } from '@/lib/redream-funnel';
import styles from './ReDreamProductStory.module.css';

type ModeKey = 'needs' | 'market' | 'player' | 'deal';

const modes = [
  {
    key: 'needs' as ModeKey,
    label: 'What needs me?',
    eyebrow: 'HOME',
    title: 'Know where human judgement is needed now.',
    copy:
      'Needs You brings overdue promises, follow-ups and decisions together, with the reason each needs your attention.',
    icon: Sparkles,
  },
  {
    key: 'market' as ModeKey,
    label: 'Find a player for a club',
    eyebrow: 'MARKET',
    title: 'Turn club demand into a route, owner and next move.',
    copy:
      'Market Pursuit keeps a club request with suitable players and people you know. Access Intelligence helps you understand who could make the introduction.',
    icon: Target,
  },
  {
    key: 'player' as ModeKey,
    label: 'Look after my players',
    eyebrow: 'PLAYERS',
    title: 'See whether the agency is actually servicing the player.',
    copy:
      'Player 360 keeps contracts, promised updates and club conversations together. Player Service helps you follow through on what you promised.',
    icon: UsersRound,
  },
  {
    key: 'deal' as ModeKey,
    label: 'Move a deal forward',
    eyebrow: 'DEALS',
    title: 'Keep commercial momentum through negotiation and collection.',
    copy:
      'Deal War Room keeps offers, terms and the next response together. Deal Control covers the negotiation; Closeout & Collection keeps commission in view after agreement.',
    icon: BriefcaseBusiness,
  },
];

function Workspace({ mode }: { mode: ModeKey }) {
  if (mode === 'market') {
    return (
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceHeader}>
          <div>
            <span>EXAMPLE CLUB REQUEST</span>
            <strong>Left winger · Belgium</strong>
            <small>Under 23 · left-footed · permanent or loan</small>
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
            <div className={styles.routeCard}><Network size={16} /><div><strong>Warm route through James</strong><small>Direct relationship · sporting director</small></div></div>
            <div className={styles.routeCard}><ArrowRight size={16} /><div><strong>Next move</strong><small>Prepare player introduction for approval</small></div></div>
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
          <div><span>REPRESENTED PLAYER</span><strong>Leo Martin</strong><small>Right winger · contract 14 months</small></div>
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
          <div><span>EXAMPLE DEAL</span><strong>Riverton United · Leo Martin</strong><small>Negotiation in progress</small></div>
          <span className={styles.liveState}>Active</span>
        </div>
        <div className={styles.dealTimeline}>
          <div className={styles.timelineItem}><span>01</span><div><strong>Offer received</strong><small>420k + bonuses</small></div></div>
          <div className={styles.timelineItem}><span>02</span><div><strong>Guardrails checked</strong><small>Player salary and sell-on priorities recorded</small></div></div>
          <div className={styles.timelineItem}><span>03</span><div><strong>Counter prepared</strong><small>Human approval required</small></div></div>
        </div>
        <div className={styles.moneyBar}><CircleDollarSign size={16} /><span><strong>Closeout & Collection</strong><small>Commission stays connected after agreement</small></span></div>
      </div>
    );
  }

  return (
    <div className={styles.workspaceBody}>
      <div className={styles.needsHeader}>
        <div><span>DAILY OPERATING PICTURE</span><strong>Needs You</strong><small>Follow-ups and decisions that need your attention</small></div>
        <b>3</b>
      </div>
      <div className={styles.queue}>
        <div className={styles.queueRow}><i /><div><strong>Review Meridian FC introduction</strong><small>Player fit and warm route ready</small></div><span>Now</span></div>
        <div className={styles.queueRow}><i /><div><strong>Send Leo Martin his promised update</strong><small>Promised update due today</small></div><span>Today</span></div>
        <div className={styles.queueRow}><i className={styles.soft} /><div><strong>Review Riverton counter position</strong><small>Salary and sell-on priorities recorded</small></div><span>2h</span></div>
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

        <div className={styles.modeNav} role="group" aria-label="ReDream product areas">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                aria-controls="redream-workspace-example"
                aria-pressed={mode === item.key}
                className={mode === item.key ? styles.activeMode : undefined}
                onClick={() => {
                  setMode(item.key);
                  trackFunnel('product_mode', { metadata: { mode: item.key } });
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                <ArrowRight size={13} />
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.workspace} id="redream-workspace-example" aria-live="polite">
        <div className={styles.workspaceTop}>
          <div className={styles.windowDots}><i /><i /><i /></div>
          <span>ILLUSTRATIVE REDREAM WORKSPACE</span>
          <span className={styles.systemState}>Example only</span>
        </div>
        <Workspace mode={mode} />
      </div>
    </div>
  );
}

