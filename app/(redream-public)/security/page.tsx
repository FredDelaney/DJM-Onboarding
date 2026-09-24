import type { Metadata } from 'next';
import { CheckCircle2, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamMarketingShell from '@/components/ReDreamMarketingShell';
import styles from '@/components/ReDreamMarketingPages.module.css';

export const metadata: Metadata = {
  title: 'Security & Control | ReDream',
  description: 'See how ReDream separates bounded automation, confirmation and human judgement while keeping agency data tenant-aware and traceable.',
  alternates: { canonical: '/security' },
};

export default function SecurityPage() {
  return (
    <ReDreamMarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>SECURITY + CONTROL</p>
            <h1>Useful autonomy without blind trust.</h1>
            <p>
              ReDream is built around tenant isolation, evidence-backed actions and explicit human control. The system should move routine work faster without pretending software should own sensitive football or commercial judgement.
            </p>
            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton className={styles.primary} label="Discuss our setup" trackingKey="security_hero_demo" />
            </div>
          </div>

          <div className={styles.controlBoard}>
            <div className={styles.boardTop}><strong>AUTONOMY ROUTER</strong><span>Every action has a boundary</span></div>
            <div className={styles.controlGrid}>
              <article data-tone="go"><div><small>AUTOPILOT CAN DO</small><h3>Low-risk internal work</h3><p>Create a task, organise captured context, prepare internal next work and keep records current.</p></div><footer>Bounded by explicit action protocols</footer></article>
              <article data-tone="confirm"><div><small>CONFIRM WITH ME</small><h3>Material changes</h3><p>Actions with meaningful commercial or workflow impact pause for the authorised user before they move.</p></div><footer>Human confirmation before execution</footer></article>
              <article data-tone="human"><div><small>AGENT JUDGEMENT</small><h3>External and career decisions</h3><p>Negotiation, disclosure, important communication and player-career direction remain human-owned.</p></div><footer>No silent delegation of judgement</footer></article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>CONTROL ARCHITECTURE</p>
          <h2>Security is part of the operating model, not a footer promise.</h2>
        </div>
        <div className={styles.architecture}>
          <article><div><div className={styles.icon}><LockKeyhole size={20} /></div><small>TENANT BOUNDARY</small><h3>Agency context stays tenant-aware.</h3><p>The architecture resolves agency workspace context before data is used, keeping one agency from becoming another agency’s operating memory.</p></div><div className={styles.pills}><span>Tenant-aware</span><span>Role-aware</span><span>Private workspace</span></div></article>
          <article><div><div className={styles.icon}><ShieldCheck size={20} /></div><small>EVIDENCE GATE</small><h3>Action follows recorded evidence.</h3><p>ReDream keeps evidence health and decision readiness visible so a strong-looking recommendation does not silently become an unsupported fact.</p></div><div className={styles.pills}><span>Why now</span><span>Evidence health</span><span>Source context</span></div></article>
          <article><div><div className={styles.icon}><RotateCcw size={20} /></div><small>PROVENANCE + UNDO</small><h3>Internal actions leave a trace.</h3><p>Where the action protocol supports it, internal work is recorded with provenance and an undo path instead of disappearing into an opaque automation.</p></div><div className={styles.pills}><span>Audit trail</span><span>Outcome record</span><span>Undo where permitted</span></div></article>
        </div>

        <div className={styles.truthBand}>
          <span><CheckCircle2 size={17} /> Public product demos use isolated synthetic agency data, not customer records.</span>
          <span><CheckCircle2 size={17} /> ReDream scores operating readiness and evidence, not the probability a transfer will happen.</span>
          <span><CheckCircle2 size={17} /> External communication and material judgement remain controlled by the agency.</span>
        </div>
      </section>

      <section className={styles.final}>
        <div><h2>Want to review ReDream against your agency’s security expectations?</h2><p>Bring your operating model and concerns. We will show where ReDream can act, where it asks, and where it deliberately stops.</p></div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Review security with us" trackingKey="security_final_demo" />
      </section>
    </ReDreamMarketingShell>
  );
}
