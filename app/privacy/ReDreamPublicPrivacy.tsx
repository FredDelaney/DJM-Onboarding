import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import Brand from '@/components/Brand';
import styles from './privacy.module.css';

export default function ReDreamPublicPrivacy() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <Brand />
          <Link href="/" className={styles.back}>
            <ArrowLeft size={16} />
            Back to ReDream
          </Link>
        </div>

        <section className={styles.hero}>
          <div className={styles.kicker}>REDREAM SYSTEMS PRIVACY</div>
          <h1>Privacy on the ReDream website.</h1>
          <p>
            This notice covers the public ReDream Systems website, its interactive
            product experience and the demo-request journey. Customer agency
            workspaces have their own controller-specific privacy information.
          </p>
          <div className={styles.updated}>Last updated 23 September 2026</div>
        </section>

        <div className={styles.summary}>
          <div className={styles.summaryCard}>
            <strong>First-party measurement</strong>
            <span>
              ReDream records a limited set of website engagement signals to understand
              which parts of the product story are useful and where enquiries come from.
            </span>
          </div>

          <div className={styles.summaryCard}>
            <strong>No persistent funnel identifier</strong>
            <span>
              The ReDream sales funnel tracker does not set its own cookie or store its
              session identifier in localStorage or sessionStorage.
            </span>
          </div>

          <div className={styles.summaryCard}>
            <strong>90-day event window</strong>
            <span>
              Anonymous first-party funnel events are automatically deleted after
              90 days.
            </span>
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.kicker}>WEBSITE MEASUREMENT</div>
          <h2>What the public site records</h2>
          <p>
            ReDream may record page and section views, the type of interactive agency
            scenario selected, whether the experience was run or completed, product
            modes viewed, calls to action used and progress through the demo-request
            flow.
          </p>
          <p>
            We may also record the website path, referring page and campaign parameters
            such as UTM source, medium, campaign, content and term. Raw situation text
            typed into the interactive experience is not stored in the anonymous funnel
            events table.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>SESSION DESIGN</div>
          <h2>Browsing stays anonymous until you submit your details</h2>
          <p>
            The funnel tracker creates a random session identifier in page memory. It
            is not designed as a persistent cross-visit identifier.
          </p>
          <p>
            If you deliberately submit a demo request, the current session identifier
            and acquisition information can be linked to that request so ReDream can
            understand the journey that led to the enquiry.
          </p>
          <p>
            If you choose to include a real agency situation in the demo request, that
            submitted situation text may be stored with the enquiry. It is not added to
            the anonymous browsing-events table.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>DEMO REQUESTS</div>
          <h2>Information you choose to send</h2>
          <p>
            A demo request can include your name, email address, agency name, website,
            team size, represented-player count, plan interest and the business context
            you want to discuss. Team size and roster size are optional.
          </p>
          <p>
            ReDream uses this information to respond to the enquiry, understand the
            agency context, prepare a relevant demonstration and manage the resulting
            business relationship.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>RETENTION</div>
          <h2>How long this information is kept</h2>
          <p>
            Anonymous public-site funnel events are automatically removed after
            90 days. Demo-request and contact records may be retained for longer where
            reasonably needed to respond to the enquiry, manage the sales relationship
            and maintain appropriate business or legal records.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>SERVICE PROVIDERS</div>
          <h2>Infrastructure</h2>
          <p>
            ReDream uses Vercel to host and deliver the web application and Supabase
            for backend infrastructure and database services. Normal hosting and
            security systems may process technical request information such as IP
            address, browser or user-agent information and request timestamps.
          </p>
          <p>
            The first-party ReDream sales funnel described above does not send these
            engagement events to an advertising network or create a cross-site
            advertising profile.
          </p>
        </section>

        <section className={`${styles.section} ${styles.rights}`}>
          <div className={styles.kicker}>QUESTIONS AND RIGHTS</div>
          <h2>You can contact ReDream about your information.</h2>
          <p>
            Depending on the data-protection law that applies, you may have rights to
            ask about, access, correct, erase, restrict or object to the processing of
            your personal information and to make a complaint to the relevant
            supervisory authority.
          </p>
          <div className={styles.contact}>
            Privacy questions can be sent to{' '}
            <a href="mailto:team@redreamsystems.com">
              team@redreamsystems.com
            </a>.
          </div>
        </section>

        <div className={styles.footer}>
          This notice covers ReDream Systems&apos; public website and sales journey.
          Privacy responsibilities inside a customer agency workspace remain separate
          and are governed by that agency&apos;s applicable privacy information.
        </div>
      </div>
    </main>
  );
}
