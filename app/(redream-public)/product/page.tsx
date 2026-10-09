import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck } from 'lucide-react';

import ReDreamDecisionLayer from '@/components/ReDreamDecisionLayer';
import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamLiveOperatingDemo from '@/components/ReDreamLiveOperatingDemo';
import ReDreamMarketingShell from '@/components/ReDreamMarketingShell';
import styles from '@/components/ReDreamMarketingPages.module.css';

export const metadata: Metadata = {
  title: 'Product | ReDream Agency Autopilot',
  description: 'See how ReDream connects Agency Memory, the Agency Decision Layer and controlled action for football agencies.',
  alternates: { canonical: '/product' },
};

export default function ProductPage() {
  return (
    <ReDreamMarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AGENCY AUTOPILOT</p>
            <h1>One agency. One clear view.</h1>
            <p>
              Connect your players, club requests, relationships and deals. See the next step and who owns it.
            </p>
            <div className={styles.heroActions}>
              <Link href="#agency-demo" className={styles.primary}>Explore the agency demo <ArrowRight size={16} /></Link>
              <ReDreamDemoRequestButton className={styles.secondary} label="Run ReDream on my agency" trackingKey="product_hero_demo" />
            </div>
          </div>
          <ReDreamLiveOperatingDemo variant="hero" />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>THREE LAYERS, ONE SYSTEM</p>
          <h2>Capture. Decide. Act.</h2>
        </div>
        <div className={styles.architecture}>
          <article>
            <div>
              <div className={styles.icon}><DatabaseZap size={20} /></div>
              <small>01 · AGENCY MEMORY</small>
              <h3>Keep your agency connected.</h3>
              <p>Players, clubs, people, needs, commitments, opportunities, deals and evidence stay connected instead of disappearing into separate notes and spreadsheets.</p>
            </div>
            <div className={styles.pills}><span>Players</span><span>Club demand</span><span>Relationships</span><span>Deals</span></div>
          </article>
          <article>
            <div>
              <div className={styles.icon}><BrainCircuit size={20} /></div>
              <small>02 · DECISION LAYER</small>
              <h3>See what needs attention.</h3>
              <p>ReDream ranks attention, exposes revenue risk, compares access routes and keeps player career control separate from football fit.</p>
            </div>
            <div className={styles.pills}><span>Why now</span><span>Evidence health</span><span>Impact chain</span><span>Next move</span></div>
          </article>
          <article>
            <div>
              <div className={styles.icon}><ShieldCheck size={20} /></div>
              <small>03 · ACTION PROTOCOL</small>
              <h3>Stay in control.</h3>
              <p>Low-risk internal work can move forward while external communication, disclosure, negotiation and player-career judgement stay explicitly controlled.</p>
            </div>
            <div className={styles.pills}><span>Autopilot</span><span>Confirm</span><span>Human judgement</span><span>Audit + undo</span></div>
          </article>
        </div>
      </section>

      <section id="agency-demo" className={styles.section}>
        <div className={styles.sectionHead}>
          <p>ASK THE AGENCY</p>
          <h2>Ask ReDream. Find your next move.</h2>
        </div>
        <ReDreamDecisionLayer />
      </section>

      <section className={styles.final}>
        <div><h2>Try it with your agency.</h2><p>The fastest way to understand ReDream is to run it against the kind of decision your team already deals with every day.</p></div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Run ReDream on my agency" trackingKey="product_final_demo" />
      </section>
    </ReDreamMarketingShell>
  );
}
