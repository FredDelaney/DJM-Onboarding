import {
  ArrowRight,
  CircleDollarSign,
  Handshake,
  Network,
  Radar,
  Sparkles,
} from 'lucide-react';

import styles from './ReDreamCommercialJourney.module.css';

const phases = [
  {
    label: 'Discover',
    icon: Radar,
    items: ['Club demand', 'Player fit', 'Relationship route'],
    accent: 'Demand becomes a credible route.',
  },
  {
    label: 'Pursue',
    icon: Network,
    items: ['Opportunity', 'Pitch', 'Follow-up'],
    accent: 'Every move keeps the same context.',
  },
  {
    label: 'Close',
    icon: Handshake,
    items: ['Deal', 'Negotiation', 'Closeout', 'Commission'],
    accent: 'Commercial value stays attached to the work.',
  },
];

export default function ReDreamCommercialJourney() {
  return (
    <div className={styles.journey}>
      <div className={styles.journeyTop}>
        <div>
          <span>ONE LIVE COMMERCIAL THREAD</span>
          <strong>Elias Novak → Westhaven FC</strong>
        </div>
        <div className={styles.liveState}>
          <Sparkles size={15} />
          Context travels with the opportunity
        </div>
      </div>

      <div className={styles.phaseRail}>
        <div className={styles.flowLine} aria-hidden="true">
          <i />
        </div>

        {phases.map((phase, index) => {
          const Icon = phase.icon;
          return (
            <div className={styles.phaseWrap} key={phase.label}>
              <article className={styles.phase}>
                <div className={styles.phaseHead}>
                  <div className={styles.phaseIcon}><Icon size={18} /></div>
                  <span>
                    <small>{phase.label.toUpperCase()}</small>
                    <strong>{phase.accent}</strong>
                  </span>
                </div>
                <div className={styles.itemRail}>
                  {phase.items.map((item) => <span key={item}>{item}</span>)}
                </div>
              </article>
              {index < phases.length - 1 ? <ArrowRight className={styles.phaseArrow} size={18} /> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.contextBar}>
        <span><small>PLAYER</small><strong>Elias Novak</strong></span>
        <span><small>CLUB</small><strong>Westhaven FC</strong></span>
        <span><small>ACCESS</small><strong>Warm · 87/100</strong></span>
        <span><small>CONTROL</small><strong>Human review</strong></span>
        <span><small>COMMERCIAL</small><strong>€45k expected commission</strong></span>
        <CircleDollarSign size={18} />
      </div>
    </div>
  );
}
