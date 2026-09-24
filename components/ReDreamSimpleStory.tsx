'use client';

import {
  ArrowRight,
  Check,
  CircleDollarSign,
  MessageSquareText,
  Network,
  SearchCheck,
  UserRoundCheck,
} from 'lucide-react';
import { useState } from 'react';

import { trackFunnel } from '@/lib/redream-funnel';
import styles from './ReDreamSimpleStory.module.css';

const steps = [
  {
    key: 'club',
    label: 'Club asks',
    kicker: 'CLUB REQUEST',
    title: 'Arsenal need a left-footed centre-back.',
    detail: ['Centre-back', 'Left-footed', 'Under 24'],
    icon: MessageSquareText,
  },
  {
    key: 'player',
    label: 'Player fits',
    kicker: 'PLAYER MATCH',
    title: 'Daniel Costa looks like the strongest fit.',
    detail: ['21 years old', 'Left-footed CB', 'Available this summer'],
    icon: UserRoundCheck,
  },
  {
    key: 'route',
    label: 'Best route',
    kicker: 'RELATIONSHIP',
    title: 'Your agency already has a warm route into Arsenal.',
    detail: ['Recruitment contact', 'Warm relationship', 'Best route found'],
    icon: Network,
  },
  {
    key: 'next',
    label: 'Next move',
    kicker: 'NEXT STEP',
    title: "Send Daniel's latest clips and confirm his availability.",
    detail: ['Pitch ready', 'Follow-up tracked', 'Opportunity opened'],
    icon: SearchCheck,
  },
] as const;

export default function ReDreamSimpleStory() {
  const [active, setActive] = useState(0);
  const step = steps[active];
  const Icon = step.icon;

  const selectStep = (index: number) => {
    setActive(index);
    trackFunnel('product_mode', {
      metadata: {
        mode: 'simple_story',
        variant: steps[index].key,
      },
    });
  };

  return (
    <section className={styles.story} aria-label="Example ReDream agency story">
      <div className={styles.topline}>
        <span>EXAMPLE AGENCY SCENARIO</span>
        <small>Arsenal is used only as an example club. The player and request are fictional.</small>
      </div>

      <div className={styles.progress} aria-label="Example agency workflow">
        {steps.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => selectStep(index)}
            data-active={index === active ? 'true' : 'false'}
            data-done={index < active ? 'true' : 'false'}
          >
            <span>{index < active ? <Check size={13} /> : index + 1}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>

      <div className={styles.stage}>
        <div className={styles.stageIcon}><Icon size={24} /></div>
        <div className={styles.stageCopy}>
          <span>{step.kicker}</span>
          <h3>{step.title}</h3>
          <div className={styles.details}>
            {step.detail.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>

      <div className={styles.flow}>
        <div>
          <span>Problem</span>
          <strong>A useful club request could disappear into messages and memory.</strong>
        </div>
        <ArrowRight size={17} />
        <div>
          <span>ReDream</span>
          <strong>Connects the request to the player, relationship and next action.</strong>
        </div>
        <ArrowRight size={17} />
        <div>
          <span>Outcome</span>
          <strong>One message becomes a tracked opportunity your team can act on.</strong>
        </div>
      </div>

      <div className={styles.result}>
        <div>
          <CircleDollarSign size={18} />
          <span>
            <small>BUSINESS VALUE</small>
            <strong>Respond faster. Miss fewer opportunities. Keep more deals moving.</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => selectStep((active + 1) % steps.length)}
        >
          {active === steps.length - 1 ? 'See it again' : 'Next step'}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
