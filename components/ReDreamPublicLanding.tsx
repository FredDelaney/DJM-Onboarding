import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Workflow,
} from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
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

const productMoments = [
  {
    icon: Sparkles,
    eyebrow: 'HOME',
    title: 'Needs You',
    copy:
      'The agency opens on the work that actually needs judgement. ReDream ranks live commitments, exceptions and decisions by evidence and urgency.',
    visual: 'queue',
  },
  {
    icon: Target,
    eyebrow: 'MARKET',
    title: 'Market Pursuit',
    copy:
      'Turn a club need into a controlled pursuit with player fit, Access Intelligence, relationship routes, ownership and the next commercial move.',
    visual: 'market',
  },
  {
    icon: UsersRound,
    eyebrow: 'PLAYERS',
    title: 'Player 360',
    copy:
      'Keep Player Service, career timing, representation, commitments and market work around one trusted player picture.',
    visual: 'player',
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'DEALS',
    title: 'Deal War Room',
    copy:
      'Run Deal Control from live momentum through negotiation, Closeout & Collection and commission without losing the thread.',
    visual: 'deal',
  },
];

const trustSteps = [
  'Evidence',
  'Prepare',
  'Approve',
  'Act',
  'Record',
  'Undo where permitted',
];

const plans = [
  {
    name: 'Agency',
    price: '€149',
    suffix: '/month',
    capacity: '5 staff · 40 players',
  },
  {
    name: 'Pro',
    price: '€399',
    suffix: '/month',
    capacity: '15 staff · 100 players',
  },
  {
    name: 'Elite',
    price: '€799',
    suffix: '/month',
    capacity: '30 staff · 250 players',
  },
  {
    name: 'Enterprise',
    price: 'From €1,500',
    suffix: '/month',
    capacity: 'Custom scale',
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ReDream',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://redreamsystems.com/',
  description:
    'ReDream is the operating system for football agencies, connecting player service, club demand, relationships, market work, deals, negotiation and commission.',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '149',
    highPrice: '1500',
    priceCurrency: 'EUR',
    offerCount: '4',
  },
};

function ProductVisual({
  visual,
}: {
  visual: string;
}) {
  if (visual === 'queue') {
    return (
      <div className={styles.momentVisual}>
        <div className={styles.visualHead}>
          <span>NEEDS JUDGEMENT</span>
          <strong>4</strong>
        </div>

        <div className={styles.miniRow}>
          <span className={styles.priorityDot} />
          <div>
            <strong>Leo Martin</strong>
            <small>Player commitment overdue</small>
          </div>
          <span>Now</span>
        </div>

        <div className={styles.miniRow}>
          <span className={styles.priorityDot} />
          <div>
            <strong>Westhaven FC</strong>
            <small>Warm route ready to review</small>
          </div>
          <span>Today</span>
        </div>

        <div className={styles.miniRow}>
          <span className={styles.softDot} />
          <div>
            <strong>Riverton United</strong>
            <small>Deal next move missing</small>
          </div>
          <span>2h</span>
        </div>
      </div>
    );
  }

  if (visual === 'market') {
    return (
      <div className={styles.momentVisual}>
        <div className={styles.marketNeed}>
          <span>LIVE CLUB NEED</span>
          <strong>Left winger · Belgium</strong>
          <small>U23 · direct running · permanent or loan</small>
        </div>

        <div className={styles.routeLine}>
          <div>
            <span>01</span>
            <strong>3 matches</strong>
          </div>
          <ArrowRight size={14} />
          <div>
            <span>02</span>
            <strong>2 warm routes</strong>
          </div>
          <ArrowRight size={14} />
          <div>
            <span>03</span>
            <strong>1 pursuit owner</strong>
          </div>
        </div>

        <small className={styles.visualNote}>
          Access Intelligence chooses the strongest route before outreach.
        </small>
      </div>
    );
  }

  if (visual === 'player') {
    return (
      <div className={styles.momentVisual}>
        <div className={styles.playerHead}>
          <div className={styles.avatar}>LM</div>
          <div>
            <strong>Leo Martin</strong>
            <small>RW · represented</small>
          </div>
          <span>Active</span>
        </div>

        <div className={styles.playerGrid}>
          <div>
            <span>Service</span>
            <strong>On track</strong>
          </div>
          <div>
            <span>Market</span>
            <strong>3 live routes</strong>
          </div>
          <div>
            <span>Contract</span>
            <strong>14 months</strong>
          </div>
          <div>
            <span>Next review</span>
            <strong>8 Oct</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.momentVisual}>
      <div className={styles.dealHead}>
        <div>
          <span>LIVE DEAL</span>
          <strong>Riverton United · Leo Martin</strong>
        </div>
        <span className={styles.dealChip}>Negotiation</span>
      </div>

      <div className={styles.dealMetric}>
        <div>
          <span>Momentum</span>
          <strong>Active</strong>
        </div>
        <div>
          <span>Owner</span>
          <strong>James</strong>
        </div>
        <div>
          <span>Next move</span>
          <strong>Counter terms</strong>
        </div>
      </div>

      <div className={styles.dealFooter}>
        <CircleDollarSign size={14} />
        Closeout & Collection stays attached after agreement.
      </div>
    </div>
  );
}

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
          <Link
            href="/"
            className={styles.brand}
            aria-label="ReDream Systems | Agency Autopilot"
          >
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
          </nav>

          <ReDreamDemoRequestButton
            className={styles.navCta}
            label="Request a demo"
          />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              THE OPERATING SYSTEM FOR FOOTBALL AGENCIES
            </p>

            <h1>
              Run the agency from
              <span> what happens next.</span>
            </h1>

            <p className={styles.heroLead}>
              ReDream turns conversations, club demand, relationship
              intelligence, player service and live deals into the next
              action your agency needs to take.
            </p>

            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton
                className={styles.primaryCta}
                label="Request a demo"
              />

              <a className={styles.secondaryCta} href="#product">
                See how it works
                <ArrowRight size={15} />
              </a>
            </div>

            <div className={styles.heroTrust}>
              <span>
                <Check size={13} />
                White-label agency workspace
              </span>
              <span>
                <Check size={13} />
                Human-controlled automation
              </span>
              <span>
                <Check size={13} />
                Built around agency judgement
              </span>
            </div>
          </div>

          <div className={styles.storyFrame} aria-label="Illustrative ReDream agency workflow">
            <div className={styles.storyTop}>
              <div>
                <span>ILLUSTRATIVE AGENCY WORKSPACE</span>
                <strong>Tell ReDream</strong>
              </div>

              <span className={styles.liveChip}>
                <i />
                Live
              </span>
            </div>

            <div className={styles.capture}>
              <div className={styles.captureIcon}>
                <Bot size={18} />
              </div>

              <div>
                <span>CAPTURED FROM A CONVERSATION</span>
                <p>
                  “Westhaven need a left-footed winger under 23. We have a
                  warm route through their sporting director.”
                </p>
              </div>
            </div>

            <div className={styles.storyFlow}>
              <div className={styles.storyStep}>
                <span>01</span>
                <div>
                  <small>UNDERSTAND</small>
                  <strong>Club need structured</strong>
                </div>
              </div>

              <div className={styles.storyStep}>
                <span>02</span>
                <div>
                  <small>MATCH</small>
                  <strong>3 players fit the brief</strong>
                </div>
              </div>

              <div className={styles.storyStep}>
                <span>03</span>
                <div>
                  <small>ROUTE</small>
                  <strong>Warm relationship identified</strong>
                </div>
              </div>

              <div className={styles.storyStep}>
                <span>04</span>
                <div>
                  <small>OPERATE</small>
                  <strong>Follow-up prepared for approval</strong>
                </div>
              </div>
            </div>

            <div className={styles.needsYou}>
              <div>
                <Sparkles size={15} />
                <span>
                  <small>NEEDS YOU</small>
                  <strong>Approve the Westhaven pursuit</strong>
                </span>
              </div>

              <button type="button" tabIndex={-1}>
                Review
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.spineSection} aria-label="ReDream operating spine">
        <div className={styles.spineIntro}>
          <span>ONE OPERATING THREAD</span>
          <strong>
            From demand to commission, without losing ownership or context.
          </strong>
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
        <div className={styles.sectionHeading}>
          <p>THE PRODUCT</p>
          <h2>
            The agency should open ReDream and immediately know what matters.
          </h2>
          <span>
            The product is organised around operating decisions, not around
            making staff maintain another system.
          </span>
        </div>

        <div className={styles.momentsGrid}>
          {productMoments.map((moment) => {
            const Icon = moment.icon;

            return (
              <article className={styles.moment} key={moment.title}>
                <div className={styles.momentCopy}>
                  <div className={styles.momentLabel}>
                    <span className={styles.momentIcon}>
                      <Icon size={16} />
                    </span>
                    <small>{moment.eyebrow}</small>
                  </div>

                  <h3>{moment.title}</h3>
                  <p>{moment.copy}</p>
                </div>

                <ProductVisual visual={moment.visual} />
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.autopilotSection} id="autopilot">
        <div className={styles.autopilotCopy}>
          <p>AGENCY AUTOPILOT</p>
          <h2>
            Automation that works inside the agency&apos;s guardrails.
          </h2>
          <span>
            ReDream can capture, structure, prepare and recommend. High-impact
            actions stay reviewable, evidence-led and owned by the right
            person.
          </span>

          <div className={styles.trustPoints}>
            <div>
              <ShieldCheck size={16} />
              <span>
                <strong>Human judgement where it matters</strong>
                <small>
                  Human decision remains explicit for money, disclosure,
                  negotiation and important external communication.
                </small>
              </span>
            </div>

            <div>
              <Workflow size={16} />
              <span>
                <strong>Evidence before action</strong>
                <small>
                  ReDream does not invent facts to make a workflow look
                  complete.
                </small>
              </span>
            </div>

            <div>
              <UsersRound size={16} />
              <span>
                <strong>Player-safe by design</strong>
                <small>
                  Internal commercial intelligence stays separate from the
                  player experience unless deliberately disclosed.
                </small>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.trustFrame}>
          <div className={styles.trustTop}>
            <div className={styles.trustOrb}>
              <Bot size={18} />
            </div>

            <div>
              <small>CONTROL MODEL</small>
              <strong>Agency Autopilot</strong>
            </div>
          </div>

          <div className={styles.trustRail}>
            {trustSteps.map((step, index) => (
              <div key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                {index < trustSteps.length - 1 ? (
                  <ArrowRight size={13} />
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.approvalCard}>
            <div>
              <ShieldCheck size={15} />
              <span>
                <small>APPROVAL REQUIRED</small>
                <strong>Send prepared club follow-up</strong>
              </span>
            </div>

            <span className={styles.approvalStatus}>
              Human decision
            </span>
          </div>
        </div>
      </section>

      <section className={styles.commercialSection} id="pricing">
        <div className={styles.sectionHeading}>
          <p>PRICING</p>
          <h2>Start with the agency you are. Scale without changing systems.</h2>
          <span>
            Plans start at €149/month. The same operating architecture scales
            from boutique agencies to complex international operations.
          </span>
        </div>

        <div className={styles.planRail}>
          {plans.map((plan) => (
            <article key={plan.name}>
              <span>{plan.name}</span>
              <div>
                <strong>{plan.price}</strong>
                <small>{plan.suffix}</small>
              </div>
              <p>{plan.capacity}</p>
            </article>
          ))}
        </div>

        <div className={styles.commercialNote}>
          <div>
            <Clock3 size={17} />
            <span>
              <strong>Built for first value, not a long implementation.</strong>
              <small>
                Start with one player, one relationship and one live agency
                need, then expand from real operating value.
              </small>
            </span>
          </div>

          <ReDreamDemoRequestButton
            className={styles.darkCta}
            label="Request a demo"
          />
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p>SEE IT ON YOUR AGENCY</p>
          <h2>See how ReDream would run the work you already do.</h2>
          <span>
            Bring one real player, club need or live opportunity. We will show
            you what the operating system does with it.
          </span>
        </div>

        <ReDreamDemoRequestButton
          className={styles.lightCta}
          label="Request a demo"
        />
      </section>

      <footer className={styles.footer}>
        <Link
          href="/"
          className={styles.footerBrand}
          aria-label="ReDream Systems | Agency Autopilot"
        >
          <img
            src="/brand/redream-lockup-dark.png"
            alt="ReDream Systems | Agency Autopilot"
            className={styles.footerBrandLogo}
          />
        </Link>

        <div className={styles.footerMeta}>
          <span>The operating system for football agencies.</span>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
