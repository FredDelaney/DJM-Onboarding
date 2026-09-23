import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Network,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamInteractiveExperience from '@/components/ReDreamInteractiveExperience';
import ReDreamProductStory from '@/components/ReDreamProductStory';
import styles from './ReDreamPublicLanding.module.css';

const operatingSpine = [
  'Club need',
  'Player match',
  'Relationship route',
  'Opportunity',
  'Pitch',
  'Follow-up',
  'Deal',
  'Negotiation',
  'Closeout',
  'Commission',
];

const plans = [
  { name: 'Agency', price: '€149', suffix: '/month', capacity: '5 staff · 40 players' },
  { name: 'Pro', price: '€399', suffix: '/month', capacity: '15 staff · 100 players' },
  { name: 'Elite', price: '€799', suffix: '/month', capacity: '30 staff · 250 players' },
  { name: 'Enterprise', price: 'From €1,500', suffix: '/month', capacity: 'Custom scale' },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ReDream',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://redreamsystems.com/',
  description:
    'ReDream is the operating system for football agencies, turning player service, club demand, relationships, market work, deals and commercial commitments into controlled next actions.',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '149',
    highPrice: '1500',
    priceCurrency: 'EUR',
    offerCount: '4',
  },
};

export default function ReDreamPublicLanding() {
  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />

      <header className={styles.navWrap}>
        <div className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="ReDream Systems | Agency Autopilot">
            <img
              src="/brand/redream-lockup-light.png"
              alt="ReDream Systems | Agency Autopilot"
              className={styles.brandLogo}
            />
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#product">Product</a>
            <a href="#autopilot">Agency Autopilot</a>
            <a href="#pricing">Pricing</a>
            <Link href="/platform/sign-in">Sign in</Link>
          </nav>

          <ReDreamDemoRequestButton
            className={styles.navCta}
            label="Run ReDream on my agency"
          />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid} />
        <div className={styles.heroGlow} />

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>THE OPERATING SYSTEM FOR FOOTBALL AGENCIES</p>
            <h1>
              Know what
              <span> happens next.</span>
            </h1>
            <p className={styles.heroLead}>
              Every player. Every relationship. Every opportunity. Every commitment.
              ReDream turns what your agency knows into what your agency should do next.
            </p>

            <div className={styles.heroActions}>
              <a href="#try-redream" className={styles.primaryLink}>
                Try ReDream now
                <ArrowRight size={15} />
              </a>
              <ReDreamDemoRequestButton
                className={styles.secondaryButton}
                label="Run it on my agency"
              />
            </div>

            <div className={styles.heroTrust}>
              <span><Check size={13} /> White-label agency workspace</span>
              <span><Check size={13} /> Human-controlled Agency Autopilot</span>
              <span><Check size={13} /> Player-safe by design</span>
            </div>
          </div>

          <div className={styles.heroThesis}>
            <span className={styles.thesisLabel}>THE DIFFERENCE</span>
            <div className={styles.thesisFlow}>
              <div>
                <span>01</span>
                <strong>Agency signal</strong>
                <small>Conversation, need, commitment, relationship or deal</small>
              </div>
              <ArrowRight size={16} />
              <div>
                <span>02</span>
                <strong>Agency Memory</strong>
                <small>People, players, clubs, evidence and context connect</small>
              </div>
              <ArrowRight size={16} />
              <div className={styles.thesisActive}>
                <span>03</span>
                <strong>Next move</strong>
                <small>The work that needs action or judgement becomes clear</small>
              </div>
            </div>
            <p>
              ReDream is not valuable because it stores more. It is valuable because the agency stops losing the thread between what it knows and what it does.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.trySection} id="try-redream">
        <div className={styles.sectionIntro}>
          <p>EXPERIENCE THE PRODUCT</p>
          <h2>Give ReDream one agency situation.</h2>
          <span>
            Use a real club or player name if appropriate. The on-page experience stays in your browser until you explicitly submit a demo request.
          </span>
        </div>
        <ReDreamInteractiveExperience />
      </section>

      <section className={styles.spineSection} aria-label="ReDream operating spine">
        <div className={styles.spineCopy}>
          <p>ONE OPERATING THREAD</p>
          <h2>From demand to commission without losing ownership or context.</h2>
        </div>
        <div className={styles.spineRail}>
          {operatingSpine.map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.productSection} id="product">
        <div className={styles.sectionIntro}>
          <p>ONE SYSTEM, FOUR OPERATING QUESTIONS</p>
          <h2>The interface changes with the decision the agency needs to make.</h2>
          <span>
            Tell ReDream feeds one connected operating model. Player Service, Access Intelligence, Deal Control and Closeout & Collection surface through Needs You, Market Pursuit, Player 360 and Deal War Room instead of becoming separate products.
          </span>
        </div>
        <ReDreamProductStory />
      </section>

      <section className={styles.autopilotSection} id="autopilot">
        <div className={styles.autopilotCopy}>
          <p>AGENCY AUTOPILOT</p>
          <h2>Automation that can explain itself before it acts.</h2>
          <span>
            ReDream can capture, structure, prepare and recommend. High-impact actions remain evidence-led, reviewable and owned by the right person.
          </span>

          <div className={styles.guardrails}>
            <div><ShieldCheck size={17} /><span><strong>Human judgement where it matters</strong><small>Money, disclosure, negotiation and important external communication stay controlled.</small></span></div>
            <div><Workflow size={17} /><span><strong>Evidence before action</strong><small>ReDream does not invent facts to make a workflow look complete.</small></span></div>
            <div><UsersRound size={17} /><span><strong>Player-safe by design</strong><small>Internal commercial intelligence stays separate unless deliberately disclosed.</small></span></div>
          </div>
        </div>

        <div className={styles.autopilotFrame}>
          <div className={styles.frameTop}>
            <div className={styles.autopilotOrb}><Sparkles size={18} /></div>
            <div><span>CONTROL MODEL</span><strong>Agency Autopilot</strong></div>
          </div>

          <div className={styles.controlRail}>
            {['Evidence', 'Prepare', 'Approve', 'Act', 'Record', 'Undo where permitted'].map((step, index) => (
              <div key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                {index < 5 ? <ArrowRight size={13} /> : null}
              </div>
            ))}
          </div>

          <div className={styles.evidenceCard}>
            <div className={styles.evidenceHead}>
              <Network size={15} />
              <span><small>PREPARED ACTION</small><strong>Follow up through the strongest relationship route</strong></span>
            </div>
            <div className={styles.evidenceRows}>
              <span><Check size={12} /> Existing relationship recorded</span>
              <span><Check size={12} /> Club need captured today</span>
              <span><Check size={12} /> Player constraints pass</span>
            </div>
            <div className={styles.approvalLine}>
              <span><ShieldCheck size={13} /> Human decision</span>
              <strong>Ready for approval</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.commercialSection} id="pricing">
        <div className={styles.sectionIntro}>
          <p>COMMERCIAL</p>
          <h2>Start small. Keep the same operating architecture as you scale.</h2>
          <span>
            Plans start at €149/month. ReDream uses the same tenant-aware architecture from boutique agencies through complex international operations.
          </span>
        </div>

        <div className={styles.planRail}>
          {plans.map((plan) => (
            <article key={plan.name}>
              <span>{plan.name}</span>
              <div><strong>{plan.price}</strong><small>{plan.suffix}</small></div>
              <p>{plan.capacity}</p>
            </article>
          ))}
        </div>

        <div className={styles.valueStrip}>
          <div><CircleDollarSign size={17} /><span><strong>First value before full rollout.</strong><small>Start with one player, one relationship and one live agency situation.</small></span></div>
          <ReDreamDemoRequestButton className={styles.darkButton} label="Run ReDream on my agency" />
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p>BRING ONE REAL SITUATION</p>
          <h2>Imagine this running across your entire agency.</h2>
          <span>
            A player. A club need. A live deal. A relationship problem. Start with something real and we will show you how ReDream would operate it.
          </span>
        </div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Run ReDream on my agency" />
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand} aria-label="ReDream Systems | Agency Autopilot">
          <img
            src="/brand/redream-lockup-dark.png"
            alt="ReDream Systems | Agency Autopilot"
            className={styles.footerBrandLogo}
          />
        </Link>
        <div className={styles.footerMeta}>
          <span>The operating system for football agencies.</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/platform/sign-in">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
