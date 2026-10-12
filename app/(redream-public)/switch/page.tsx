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
  ['01', 'Choose CSV', 'Use your current player roster.'],
  ['02', 'Check', 'Review every row before import.'],
  ['03', 'Review', 'Fix errors and possible duplicates.'],
  ['04', 'Approve', 'Nothing imports without approval.'],
  ['05', 'Import', 'Players appear in your workspace.'],
];

export default function SwitchPage() {
  return (
    <ReDreamMarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>SWITCH TO REDREAM</p>
            <h1>Bring your players with you.</h1>
            <p>
              Upload your player CSV. Review errors and possible duplicates. Approve the import when you are ready.
            </p>
            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton className={styles.primary} label="Plan my switch" trackingKey="switch_hero_demo" />
            </div>
          </div>

          <div className={styles.controlBoard}>
            <div className={styles.boardTop}><strong>PLAYER IMPORT</strong><span>Controlled before import</span></div>
            <div className={styles.controlGrid}>
              <article data-tone="go"><div><small>INPUT</small><h3>Your existing CSV</h3><p>Common player columns map automatically.</p></div><footer><FileSpreadsheet size={15} /> Existing spreadsheet accepted</footer></article>
              <article data-tone="confirm"><div><small>CHECKS</small><h3>Review before write</h3><p>Review errors and possible duplicates before import.</p></div><footer><ShieldCheck size={15} /> Human create-or-skip decision</footer></article>
              <article data-tone="human"><div><small>APPROVAL</small><h3>Import only when ready</h3><p>The batch cannot be applied until the approval gate is clear and the authorised user confirms it.</p></div><footer><CheckCircle2 size={15} /> Explicit approval required</footer></article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p>HOW IT WORKS</p>
          <h2>Review before import.</h2>
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
          <h2>Start small.</h2>
        </div>
        <div className={styles.firstValue}>
          <article><b>01</b><strong>One player</strong><span>Choose someone who matters now.</span></article>
          <article><b>02</b><strong>One relationship</strong><span>Add a real route into a club.</span></article>
          <article><b>03</b><strong>One live situation</strong><span>Use a real need, deal or player issue.</span></article>
        </div>
      </section>

      <section className={styles.final}>
        <div><h2>Make the move at your pace.</h2><p>Start with the roster and one live situation. Expand when it proves useful.</p></div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Plan my switch" trackingKey="switch_final_demo" />
      </section>
    </ReDreamMarketingShell>
  );
}
