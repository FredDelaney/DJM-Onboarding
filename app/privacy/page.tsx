import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import Brand from '@/components/Brand';
import styles from './privacy.module.css';

export const metadata = {
  title: 'Privacy | DJM Player',
  description: 'How DJM Sports Management handles personal information in DJM Player.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <Brand />
          <Link href="/sign-in" className={styles.back}>
            <ArrowLeft size={16} />
            Back to DJM Player
          </Link>
        </div>

        <section className={styles.hero}>
          <div className={styles.kicker}>DJM PLAYER PRIVACY</div>
          <h1>Your career information stays under control.</h1>
          <p>
            This notice explains what DJM Sports Management collects in DJM Player,
            why we use it, who can see it and the choices you have. DJM Player is a
            private career-management service. Sensitive information is not made
            public by default.
          </p>
          <div className={styles.updated}>Last updated 2 September 2026</div>
        </section>

        <div className={styles.summary}>
          <div className={styles.summaryCard}>
            <strong>Private by default</strong>
            <span>
              Passports, work-right information, contracts, private notes and player
              documents are not part of the public dossier.
            </span>
          </div>
          <div className={styles.summaryCard}>
            <strong>You remain involved</strong>
            <span>
              You can review and correct your information. Club-facing material is
              controlled separately from your private DJM record.
            </span>
          </div>
          <div className={styles.summaryCard}>
            <strong>No automated career decisions</strong>
            <span>
              DJM does not use the platform to make solely automated decisions with
              legal or similarly significant effects on players.
            </span>
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.kicker}>WHO IS RESPONSIBLE</div>
          <h2>DJM Sports Management</h2>
          <p>
            DJM Sports Management is responsible for the personal information used
            through DJM Player for player representation, career management and
            related agency operations.
          </p>
          <div className={styles.contact}>
            Privacy questions or requests can be raised with your DJM representative
            or by email at{' '}
            <a href="mailto:jesse.edge@djmsports.com">
              jesse.edge@djmsports.com
            </a>.
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>WHAT WE USE</div>
          <h2>Information in DJM Player</h2>
          <ul>
            <li>Identity and contact details, including date of birth and nationality.</li>
            <li>Football career, club, competition, position, performance and source data.</li>
            <li>Representation, contract, availability and opportunity information.</li>
            <li>Work-right, passport or visa information where needed for football moves.</li>
            <li>Documents you or DJM add to the private player record.</li>
            <li>Messages, check-ins, tasks and other career-management activity.</li>
            <li>Device, notification and security information needed to operate the app.</li>
            <li>
              Information DJM has already obtained from you, your representatives,
              clubs, football data providers or public football sources.
            </li>
          </ul>
          <p>
            DJM Player is not intended for routine medical records. Do not upload
            health or medical information unless DJM has specifically asked you to
            provide it and explained why it is needed.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>WHY WE USE IT</div>
          <h2>Purposes and lawful bases</h2>
          <p>
            DJM uses personal information to manage the representation relationship,
            maintain an accurate player record, communicate with you, prepare
            club-facing material, support transfers and opportunities, operate the
            platform securely and meet legal or regulatory obligations.
          </p>
          <p>
            Depending on the activity, DJM relies on performance of a contract or
            steps connected with a contract, legitimate interests in providing and
            securing professional football representation, compliance with legal
            obligations, and consent where consent is the appropriate lawful basis.
            If special-category information is ever required, DJM will only process
            it where an additional condition under applicable data-protection law is
            available.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>WHO CAN SEE IT</div>
          <h2>Sharing and club-facing access</h2>
          <p>
            Private player information is available only to authorised DJM staff and
            service providers that need it to operate DJM Player. DJM may also share
            appropriate information with clubs, football organisations, professional
            advisers or authorities where this is necessary for representation,
            requested by you, required by law, or otherwise lawfully permitted.
          </p>
          <p>
            Public dossiers and private club-share links are separate from the
            private player record. Only information approved for those surfaces is
            shown. Sensitive document types such as passports, visas, identity
            documents, medical documents, contracts and agreements are not approved
            for club-document sharing through DJM Player.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>SERVICE PROVIDERS</div>
          <h2>Hosting and international processing</h2>
          <p>
            DJM uses specialist technology providers to host, secure and operate the
            service. Because DJM works internationally and uses global technology
            providers, personal information may be processed outside the country
            where you live. Where data-protection law requires safeguards for an
            international transfer, DJM will use an applicable legal transfer
            mechanism or adequacy framework.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>HOW LONG</div>
          <h2>Retention</h2>
          <p>
            DJM keeps personal information for as long as it is needed for the
            representation relationship and then only for as long as there is a
            legitimate business, legal, regulatory, accounting, dispute or
            safeguarding reason to retain it. Information that is no longer needed
            should be deleted or anonymised. Closing a DJM Player account does not
            require DJM to erase records that must lawfully be retained.
          </p>
        </section>

        <section className={`${styles.section} ${styles.rights}`}>
          <div className={styles.kicker}>YOUR RIGHTS</div>
          <h2>You can ask DJM about your information.</h2>
          <p>
            Depending on the law that applies to you, you may have rights to access,
            correct, erase, restrict or object to processing, receive portable data,
            and withdraw consent where DJM relies on consent. Some rights depend on
            the lawful basis and may have legal exceptions.
          </p>
          <p>
            You may also complain to the UK Information Commissioner&apos;s Office
            or, where applicable, the data-protection authority in the EU or other
            jurisdiction where you live, work or believe an infringement occurred.
          </p>
          <div className={styles.contact}>
            To exercise a privacy right, contact your DJM representative or{' '}
            <a href="mailto:jesse.edge@djmsports.com">
              jesse.edge@djmsports.com
            </a>.
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.kicker}>DECISION SUPPORT</div>
          <h2>Statistics, scoring and football judgement</h2>
          <p>
            DJM may use sourced football statistics and, where sufficiently reliable,
            analytical tools to support scouting and career work. These tools support
            human judgement. DJM does not make solely automated decisions through DJM
            Player that produce legal or similarly significant effects on a player.
          </p>
        </section>

        <div className={styles.footer}>
          This notice describes DJM Player data use and should be read alongside any
          representation agreement or other specific notice DJM gives you. DJM may
          update this notice when the service or its data use materially changes.
        </div>
      </div>
    </main>
  );
}
