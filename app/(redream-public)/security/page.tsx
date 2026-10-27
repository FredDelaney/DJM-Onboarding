import type { Metadata } from 'next';
import { CheckCircle2, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamMarketingShell from '@/components/ReDreamMarketingShell';
import styles from '@/components/ReDreamMarketingPages.module.css';

export const metadata: Metadata = {
  title: 'Security & Control | ReDream',
  description: 'See how ReDream protects agency data, records changes and keeps important decisions with you.',
  alternates: { canonical: '/security' },
};

export default function SecurityPage() {
  return (
    <ReDreamMarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>SECURITY + CONTROL</p>
            <h1>Your agency. Your control.</h1>
            <p>
              Agency data stays separate. Actions use recorded evidence. Sensitive decisions need your approval.
            </p>
            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton className={styles.primary} label="Discuss our setup" trackingKey="security_hero_demo" />
            </div>
          </div>

          <div className={styles.controlBoard}>
            <div className={styles.boardTop}><strong>YOU STAY IN CONTROL</strong><span>Every action has a boundary</span></div>
            <div className={styles.controlGrid}>
              <article data-tone="go"><div><small>AUTOPILOT CAN DO</small><h3>Low-risk internal work</h3><p>Create tasks, organise context and keep records current.</p></div><footer>Within your agency permissions</footer></article>
              <article data-tone="confirm"><div><small>CONFIRM WITH ME</small><h3>Material changes</h3><p>Important changes need an authorised user’s approval.</p></div><footer>Approval before changes</footer></article>
              <article data-tone="human"><div><small>AGENT JUDGEMENT</small><h3>External and career decisions</h3><p>Negotiation, disclosure and career decisions stay human-owned.</p></div><footer>Your agency decides</footer></article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>CONTROL ARCHITECTURE</p>
          <h2>Control at every step.</h2>
        </div>
        <div className={styles.architecture}>
          <article><div><div className={styles.icon}><LockKeyhole size={20} /></div><small>AGENCY PRIVACY</small><h3>Separate agency workspaces.</h3><p>Your agency’s records stay separate from other workspaces.</p></div><div className={styles.pills}><span>Separate agencies</span><span>Access by role</span><span>Private workspace</span></div></article>
          <article><div><div className={styles.icon}><ShieldCheck size={20} /></div><small>SOURCES</small><h3>Evidence before action.</h3><p>Check sources and missing information before acting.</p></div><div className={styles.pills}><span>Why now</span><span>Evidence health</span><span>Source context</span></div></article>
          <article><div><div className={styles.icon}><RotateCcw size={20} /></div><small>HISTORY & UNDO</small><h3>A clear audit trail.</h3><p>Internal actions keep an audit trail and, where supported, an undo path.</p></div><div className={styles.pills}><span>Audit trail</span><span>Outcome record</span><span>Undo where permitted</span></div></article>
        </div>

        <div className={styles.truthBand}>
          <span><CheckCircle2 size={17} /> Public demos use synthetic data, not customer records.</span>
          <span><CheckCircle2 size={17} /> ReDream scores readiness and evidence, not transfer probability.</span>
          <span><CheckCircle2 size={17} /> External communication and key judgement stay with the agency.</span>
        </div>
      </section>

      <section className={styles.final}>
        <div><h2>Want to review ReDream against your agency’s security expectations?</h2><p>Bring your operating model. We will show where ReDream acts, asks and stops.</p></div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Review security with us" trackingKey="security_final_demo" />
      </section>
    </ReDreamMarketingShell>
  );
}
