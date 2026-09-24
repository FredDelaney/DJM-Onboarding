import Link from 'next/link';
import type { ReactNode } from 'react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import styles from './ReDreamMarketingShell.module.css';

export default function ReDreamMarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <div className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="ReDream Systems | Agency Autopilot">
            <img src="/brand/redream-lockup-light.png" alt="ReDream Systems | Agency Autopilot" className={styles.logo} />
          </Link>
          <nav className={styles.links} aria-label="Primary">
            <Link href="/product">Product</Link>
            <Link href="/security">Security</Link>
            <Link href="/switch">Switch</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/platform/sign-in">Sign in</Link>
          </nav>
          <ReDreamDemoRequestButton className={styles.demoButton} label="Book a demo" trackingKey="subpage_nav_demo" />
        </div>
      </header>

      {children}

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand} aria-label="ReDream Systems | Agency Autopilot">
          <img src="/brand/redream-lockup-dark.png" alt="ReDream Systems | Agency Autopilot" className={styles.footerLogo} />
        </Link>
        <div className={styles.footerLinks}>
          <span>Agency Autopilot for football agencies.</span>
          <Link href="/product">Product</Link>
          <Link href="/security">Security</Link>
          <Link href="/switch">Switch</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/platform/sign-in">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
