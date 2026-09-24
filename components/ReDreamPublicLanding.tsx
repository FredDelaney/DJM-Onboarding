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
import ReDreamFunnelTracker from '@/components/ReDreamFunnelTracker';
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
            <a href="#how-it-works">How it works</a>
            <a href="#autopilot">Agency Autopilot</a>
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
            <p className={styles.eyebrow}>SOFTWARE BUILT FOR FOOTBALL AGENTS</p>
            <h1>
              Your players. Your deals.
              <span> Your next move.</span>
            </h1>
            <p className={styles.heroLead}>
              Manage your players, deals and follow-ups in one place.
              ReDream connects your notes, club requests and contacts, then helps you decide what to do next.
            </p>

            <div className={styles.heroActions}>
              <a href="#try-redream" className={styles.primaryLink} data-funnel-cta="hero_try">
                Try an example
                <ArrowRight size={15} />
              </a>
              <ReDreamDemoRequestButton
                className={styles.secondaryButton}
                label="Book a personal demo"
                trackingKey="hero_demo"
              />
            </div>

            <div className={styles.heroTrust}>
              <span><Check size={13} /> Your agency, organised</span>
              <span><Check size={13} /> You approve important actions</span>
              <span><Check size={13} /> No sign-up to try the example</span>
            </div>
          </div>

          <aside className={styles.heroThesis} aria-label="An example of ReDream at work">
            <span className={styles.thesisLabel}>ONE CONVERSATION. A CLEAR NEXT STEP.</span>
            <div className={styles.exampleNote}>
              <span>You hear from a club</span>
              <p>“We need a left-footed winger under 23. A loan could work.”</p>
            </div>
            <div className={styles.exampleConnector}><ArrowRight size={20} /> ReDream helps you move it forward</div>
            <div className={styles.exampleNext}>
              <span>SUGGESTED NEXT MOVE</span>
              <h2>Check your players. Prepare the introduction.</h2>
              <p>Keep the club request, suitable players and the contact you know together.</p>
              <strong><ShieldCheck size={17} /> You review before anything is shared.</strong>
            </div>
            <p>Illustrative example. No live club request or player match is claimed.</p>
          </aside>
        </div>
      </section>

      <section className={styles.howSection} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.sectionIntro}>
          <p>FROM CONVERSATION TO ACTION</p>
          <h2 id="how-title">How ReDream Works</h2>
        </div>
        <ol className={styles.howSteps}>
          <li><span>01</span><h3>Tell it what happened</h3><p>Add a note from a call, a club request or a player update.</p></li>
          <li><span>02</span><h3>Connect the details</h3><p>Keep the relevant players, contacts, commitments and deals together. This is your Agency Memory.</p></li>
          <li><span>03</span><h3>Make your next move</h3><p>Review the suggested follow-up, introduction or decision. You stay in control.</p></li>
        </ol>
      </section>

      <section className={styles.trySection} id="try-redream">
        <div className={styles.sectionIntro}>
          <p>EXPERIENCE THE PRODUCT</p>
          <h2>Try it with a situation you recognise.</h2>
          <span>
            Pick a situation, run ReDream, then see a suggested next move. Use the example or edit it in your own words.
          </span>
        </div>
        <ReDreamInteractiveExperience />
      </section>

      <section className={styles.spineSection} id="operating-spine" aria-label="From club request to commission">
        <div className={styles.spineCopy}>
          <p>KEEP THE WHOLE DEAL TOGETHER</p>
          <h2>From club demand to commission. One thread, full context.</h2>
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
          <p>YOUR DAILY WORK, IN ONE PLACE</p>
          <h2>What needs your attention today?</h2>
          <span>
            See the follow-ups that are due, players who need an update, club requests worth pursuing and deals waiting on a decision.
          </span>
        </div>
        <ReDreamProductStory />
      </section>

      <section className={styles.autopilotSection} id="autopilot">
        <div className={styles.autopilotCopy}>
          <p>AGENCY AUTOPILOT</p>
          <h2>Less admin. You keep the final say.</h2>
          <span>
            Agency Autopilot helps organise updates and prepare next actions. You review important messages, negotiations and decisions before they go ahead.
          </span>

          <div className={styles.guardrails}>
            <div><ShieldCheck size={17} /><span><strong>Human judgement where it matters</strong><small>Money, disclosure, negotiation and important external communication stay controlled.</small></span></div>
            <div><Workflow size={17} /><span><strong>Evidence before action</strong><small>ReDream does not invent facts to make a workflow look complete.</small></span></div>
            <div><UsersRound size={17} /><span><strong>Player-safe by design</strong><small>Private agency notes stay separate from information you choose to share with players.</small></span></div>
          </div>
        </div>

        <div className={styles.autopilotFrame}>
          <div className={styles.frameTop}>
            <div className={styles.autopilotOrb}><Sparkles size={18} /></div>
            <div><span>HOW APPROVAL WORKS</span><strong>Agency Autopilot</strong></div>
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
              <span><small>ILLUSTRATIVE PREPARED ACTION</small><strong>Prepare an introduction through a contact you know</strong></span>
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
          <p>PLANS FOR YOUR AGENCY</p>
          <h2>Choose a plan that fits your agency.</h2>
          <span>
            Plans start at €149/month. ReDream grows with your players, staff and operation, from boutique agencies to complex international teams.
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
          <div><CircleDollarSign size={17} /><span><strong>First value before full rollout.</strong><small>Start with one player, one relationship and one live agency situation.</small></span></div>
          <ReDreamDemoRequestButton className={styles.darkButton} label="Run ReDream on my agency" trackingKey="pricing_demo" />
        </div>
      </section>

      <section className={styles.finalCta} id="final-cta">
        <div>
          <p>BRING ONE REAL SITUATION</p>
          <h2>Bring one real situation. See how ReDream would run it.</h2>
          <span>
            A player, club need, live deal or relationship problem. Start there. We will show you what happens next across the rest of your agency.
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
          <span>The operating system for football agencies.</span>
          <Link href="/privacy">Privacy</Link>
          <Link href="/platform/sign-in">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}

