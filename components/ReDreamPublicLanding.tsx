import Link from 'next/link';
import {
  ArrowRight,
  CircleDollarSign,
  DatabaseZap,
  Network,
  ShieldCheck,
  Undo2,
  UsersRound,
  Workflow,
} from 'lucide-react';

import ReDreamCommercialJourney from '@/components/ReDreamCommercialJourney';
import ReDreamDecisionLayer from '@/components/ReDreamDecisionLayer';
import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamFunnelTracker from '@/components/ReDreamFunnelTracker';
import ReDreamLiveOperatingDemo from '@/components/ReDreamLiveOperatingDemo';
import styles from './ReDreamPublicLanding.module.css';

const plans = [
  { name: 'Agency', audience: 'Boutique agency', price: '€149', suffix: '/month', capacity: '5 staff · 40 players' },
  { name: 'Pro', audience: 'Growing team', price: '€399', suffix: '/month', capacity: '15 staff · 100 players' },
  { name: 'Elite', audience: 'Multi-market agency', price: '€799', suffix: '/month', capacity: '30 staff · 250 players' },
  { name: 'Enterprise', audience: 'Large organisation', price: 'From €1,500', suffix: '/month', capacity: 'Custom scale' },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ReDream',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://redreamsystems.com/',
  description:
    'ReDream is Agency Autopilot and the decision layer for football agencies, connecting players, club demand, relationships, career strategy, deals, revenue and controlled next actions in one Agency Memory.',
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
      <ReDreamFunnelTracker />
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
            <Link href="/product">Product</Link>
            <Link href="/security">Security</Link>
            <Link href="/switch">Switch</Link>
            <a href="#pricing">Pricing</a>
            <Link href="/platform/sign-in">Sign in</Link>
          </nav>

          <ReDreamDemoRequestButton
            className={styles.navCta}
            label="Book a demo"
            trackingKey="nav_demo"
          />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid} />
        <div className={styles.heroGlow} />

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>THE DECISION LAYER FOR FOOTBALL AGENCIES</p>
            <h1>
              Know what matters next.
              <span> Move the agency forward.</span>
            </h1>
            <p className={styles.heroLead}>
              ReDream connects every player, club need, relationship, commitment and deal into one Agency Memory, then routes the next move between Autopilot, confirmation and agent judgement.
            </p>

            <div className={styles.heroActions}>
              <a href="#decision-layer" className={styles.primaryLink} data-funnel-cta="hero_decision_layer">
                Ask the live agency
                <ArrowRight size={16} />
              </a>
              <ReDreamDemoRequestButton
                className={styles.secondaryButton}
                label="Run ReDream on my agency"
                trackingKey="hero_demo"
              />
            </div>

            <div className={styles.heroTrust}>
              <span><DatabaseZap size={14} /> Connected agency context</span>
              <span><ShieldCheck size={14} /> Autonomy routed by risk</span>
              <span><Undo2 size={14} /> Traceable internal actions</span>
            </div>
          </div>

          <ReDreamLiveOperatingDemo variant="hero" />
        </div>
      </section>

      <section className={styles.decisionSection} id="decision-layer">
        <div className={styles.sectionIntro}>
          <p>THE AGENCY DECISION LAYER</p>
          <h2>Ask the agency, not the dashboard.</h2>
          <span>
            Ask what needs you first, where revenue is exposed, which relationship route is stronger or what player strategy is blocking. ReDream answers across the connected agency state, not one screen at a time.
          </span>
        </div>
        <ReDreamDecisionLayer />
      </section>

      <section className={styles.liveSection} id="operating-loop">
        <div className={styles.sectionIntro}>
          <p>THE PRODUCT IS THE DEMO</p>
          <h2>Watch one situation become the next controlled move.</h2>
          <span>
            Real ReDream operating models. Isolated synthetic agency. No customer data and no fake football claim.
          </span>
        </div>
        <ReDreamLiveOperatingDemo />
      </section>

      <section className={styles.journeySection} id="commercial-thread">
        <div className={styles.sectionIntro}>
          <p>ONE COMMERCIAL THREAD</p>
          <h2>The context should travel all the way to commission.</h2>
          <span>
            ReDream keeps the player, club, access route, control state and commercial value attached as an opportunity moves through the agency.
          </span>
        </div>
        <ReDreamCommercialJourney />
      </section>

      <section className={styles.autopilotSection} id="autopilot">
        <div className={styles.autopilotCopy}>
          <p>AGENCY AUTOPILOT</p>
          <h2>Automate the admin. Protect the judgement.</h2>
          <span>
            ReDream separates work that can safely move forward from work that needs confirmation, context or human commercial judgement.
          </span>

          <div className={styles.guardrails}>
            <div><ShieldCheck size={18} /><span><strong>Bounded autonomy</strong><small>Low-risk internal work can move under explicit rules. External side effects stay controlled.</small></span></div>
            <div><Workflow size={18} /><span><strong>Evidence before action</strong><small>Every recommendation stays tied to recorded context, evidence health and why it matters now.</small></span></div>
            <div><UsersRound size={18} /><span><strong>Player strategy stays human-owned</strong><small>A strong market fit never overrides player direction or agent judgement.</small></span></div>
          </div>
        </div>

        <div className={styles.autopilotFrame}>
          <div className={styles.frameTop}>
            <div className={styles.autopilotOrb}><Workflow size={19} /></div>
            <div><span>CONTROLLED OPERATING LOOP</span><strong>Agency Autopilot</strong></div>
          </div>

          <div className={styles.controlRail}>
            {['Evidence', 'Connect', 'Prepare', 'Confirm when needed', 'Act', 'Record + learn'].map((step, index) => (
              <div key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                {index < 5 ? <ArrowRight size={14} /> : null}
              </div>
            ))}
          </div>

          <div className={styles.approvalExample}>
            <div><Network size={17} /><span><small>RELATIONSHIP ROUTE</small><strong>Direct access is developing. A stronger warm introduction exists.</strong></span></div>
            <div className={styles.approvalRoute}><span>Direct route</span><strong>58</strong><ArrowRight size={15} /><span>Warm introduction</span><strong>88</strong></div>
            <div className={styles.approvalLine}><span><ShieldCheck size={14} /> Human decision</span><strong>Prepare the introduction, do not send</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.commercialSection} id="pricing">
        <div className={styles.sectionIntro}>
          <p>PLANS FOR YOUR AGENCY</p>
          <h2>Start with one live situation. Expand when ReDream proves value.</h2>
          <span>
            Plans start at €149/month and scale with your staff and represented-player operation. The first goal is useful operating context from day one, not a long implementation.
          </span>
        </div>

        <div className={styles.planRail}>
          {plans.map((plan) => (
            <article key={plan.name}>
              <span>{plan.name}</span>
              <small>{plan.audience}</small>
              <div><strong>{plan.price}</strong><small>{plan.suffix}</small></div>
              <p>{plan.capacity}</p>
            </article>
          ))}
        </div>

        <div className={styles.valueStrip}>
          <div><CircleDollarSign size={18} /><span><strong>First value before full rollout.</strong><small>Bring one player, one relationship and one live agency situation. ReDream should earn the right to expand.</small></span></div>
          <ReDreamDemoRequestButton className={styles.darkButton} label="Run ReDream on my agency" trackingKey="pricing_demo" />
        </div>
      </section>

      <section className={styles.finalCta} id="final-cta">
        <div>
          <p>BRING THE MESSY REAL THING</p>
          <h2>A player. A club request. A live deal. A relationship problem.</h2>
          <span>
            Give ReDream one situation your agency is dealing with now. See how the context connects across the rest of the operation without pretending software should make the judgement for you.
          </span>
        </div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Run ReDream on my agency" trackingKey="final_demo" />
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
