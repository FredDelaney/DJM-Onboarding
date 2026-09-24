import type { Metadata } from 'next';
import { CheckCircle2, FileSpreadsheet, ShieldCheck } from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamMarketingShell from '@/components/ReDreamMarketingShell';
import styles from '@/components/ReDreamMarketingPages.module.css';

export const metadata: Metadata = {
  title: 'Switch to ReDream | Migration for Football Agencies',
  description: 'Bring an existing player roster into ReDream with preflight checks, duplicate review and explicit approval before import.',
  alternates: { canonical: '/switch' },
};

const steps = [
  ['01', 'Choose CSV', 'Start with the player roster your agency already has.'],
  ['02', 'Run preflight', 'ReDream maps familiar spreadsheet headings and checks every row before writing.'],
  ['03', 'Review issues', 'Blocked rows are surfaced and possible duplicates require an explicit decision.'],
  ['04', 'Approve', 'Nothing is imported until an authorised user approves the batch.'],
  ['05', 'Import', 'Approved player records become usable inside the agency workspace.'],
];

export default function SwitchPage() {
  return (
    <ReDreamMarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>SWITCH TO REDREAM</p>
            <h1>Bring the roster. Keep control of the move.</h1>
            <p>
              ReDream already supports controlled player-roster migration from CSV. The import is preflighted first, possible duplicates need a human decision, and nothing is written until approval.
            </p>
            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton className={styles.primary} label="Plan my switch" trackingKey="switch_hero_demo" />
            </div>
          </div>

          <div className={styles.controlBoard}>
            <div className={styles.boardTop}><strong>PLAYER ROSTER MIGRATION</strong><span>Controlled before import</span></div>
            <div className={styles.controlGrid}>
              <article data-tone="go"><div><small>INPUT</small><h3>Your existing CSV</h3><p>Common player headings are mapped into ReDream’s canonical roster fields.</p></div><footer><FileSpreadsheet size={15} /> Existing spreadsheet accepted</footer></article>
              <article data-tone="confirm"><div><small>PREFLIGHT</small><h3>Review before write</h3><p>Validation issues and possible duplicate players are surfaced before any record is created.</p></div><footer><ShieldCheck size={15} /> Human create-or-skip decision</footer></article>
              <article data-tone="human"><div><small>APPROVAL</small><h3>Import only when ready</h3><p>The batch cannot be applied until the approval gate is clear and the authorised user confirms it.</p></div><footer><CheckCircle2 size={15} /> Explicit approval required</footer></article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>THE ACTUAL FLOW</p>
          <h2>No black-box migration.</h2>
          <span>Every stage is visible before the roster becomes part of the live agency workspace.</span>
        </div>
        <div className={styles.migration}>
          <div className={styles.migrationTop}><strong>ROSTER IMPORT</strong><span>CSV → reviewed agency records</span></div>
          <div className={styles.migrationFlow}>
            {steps.map(([number,title,copy]) => <article className={styles.migrationStep} key={number}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></article>)}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>FIRST VALUE</p>
          <h2>Do not migrate everything before ReDream proves itself.</h2>
        </div>
        <div className={styles.firstValue}>
          <article><b>01</b><strong>One player</strong><span>Start with a player whose next move, commitments or market strategy actually matters now.</span></article>
          <article><b>02</b><strong>One relationship</strong><span>Add the real route into a club so ReDream can show how access changes the decision.</span></article>
          <article><b>03</b><strong>One live situation</strong><span>Run a club need, deal or player-service problem through the operating loop and judge the value there.</span></article>
        </div>
      </section>

      <section className={styles.final}>
        <div><h2>Switching should feel controlled, not like another software project.</h2><p>Start with the roster and one live operating situation. Expand only when the system earns it.</p></div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Plan my switch" trackingKey="switch_final_demo" />
      </section>
    </ReDreamMarketingShell>
  );
}
