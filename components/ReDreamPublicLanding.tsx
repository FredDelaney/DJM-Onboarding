import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  Fingerprint,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Workflow,
} from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import styles from './ReDreamPublicLanding.module.css';

const DEMO_EMAIL =
  process.env.NEXT_PUBLIC_REDREAM_CONTACT_EMAIL?.trim() ||
  'team@redreamsystems.com';

const plans = [
  {
    name: 'Agency',
    price: '€149',
    suffix: '/month',
    capacity: '5 staff · 40 players',
    promise: 'Run the agency professionally',
    outcome:
      'Core agency operations plus a branded player experience.',
    features: [
      'Five-area agency operating workspace',
      'Player service and career control',
      'Branded player experience',
      'Tasks, follow-up and agency memory',
    ],
  },
  {
    name: 'Pro',
    price: '€399',
    suffix: '/month',
    capacity: '15 staff · 100 players',
    promise: 'Turn conversations into opportunities',
    outcome:
      'The full operating system with intelligent capture and football intelligence.',
    features: [
      'Everything in Agency',
      'Tell ReDream intelligent capture',
      'Market, pursuit and relationship intelligence',
      'Custom agency domain',
    ],
    featured: true,
  },
  {
    name: 'Elite',
    price: '€799',
    suffix: '/month',
    capacity: '30 staff · 250 players',
    promise: 'Run the whole agency as a measurable business',
    outcome:
      'Agency-wide revenue, service and commercial control.',
    features: [
      'Everything in Pro',
      'Owner Command Centre',
      'Negotiation and commission control',
      'Business intelligence and API access',
    ],
  },
  {
    name: 'Enterprise',
    price: 'From €1,500',
    suffix: '/month',
    capacity: 'Custom scale',
    promise: 'Scale privately and securely',
    outcome:
      'Strategic infrastructure for large or complex football agencies.',
    features: [
      'Everything in Elite',
      'Dedicated infrastructure',
      'SSO and advanced access control',
      'Tailored integrations and rollout',
    ],
  },
];

const productAreas = [
  {
    icon: MessageSquareText,
    eyebrow: 'CAPTURE',
    title: 'Tell ReDream',
    copy:
      'Turn a voice note or conversation into structured agency work without rebuilding the same information in five places.',
  },
  {
    icon: UsersRound,
    eyebrow: 'PLAYERS',
    title: 'Player Service',
    copy:
      'Control service, career timing, player reviews, commitments and market coverage from one evidence-led player picture.',
  },
  {
    icon: Target,
    eyebrow: 'MARKET',
    title: 'Market Pursuits',
    copy:
      'Move from a real club need to the right player, the right route, a controlled pitch and a live opportunity.',
  },
  {
    icon: Network,
    eyebrow: 'RELATIONSHIPS',
    title: 'Access Intelligence',
    copy:
      'See direct access, warm introduction routes, relationship ownership and the strongest evidence-backed next move.',
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'DEALS',
    title: 'Deal Control',
    copy:
      'Keep momentum, blockers, decision-makers, negotiation guardrails and next actions visible throughout the process.',
  },
  {
    icon: CircleDollarSign,
    eyebrow: 'REVENUE',
    title: 'Closeout & Collection',
    copy:
      'Separate forecast value from final terms, commission receivables, payments and actual commercial closeout.',
  },
];

const workflow = [
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

export default function ReDreamPublicLanding() {
  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <div className={styles.nav}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="ReDream Systems"
          >
            <span className={styles.brandMark}>R</span>

            <span>
              <strong>ReDream</strong>
              <small>SYSTEMS</small>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#product">Product</a>
            <a href="#workflow">Workflow</a>
            <a href="#principles">Principles</a>
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
            <div className={styles.badge}>
              <Sparkles size={14} />
              Built for football agencies
            </div>

            <h1>
              The operating system
              <span> for football agencies.</span>
            </h1>

            <p>
              ReDream connects player service, club demand, relationships,
              deals, negotiation, follow-up and commission control in one
              operating system built around agent judgement.
            </p>

            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton
                className={styles.primaryCta}
                label="Request a demo"
              />

              <a
                className={styles.secondaryCta}
                href="#workflow"
              >
                See how it works
              </a>
            </div>

            <div className={styles.heroProof}>
              <span>
                <Check size={13} />
                Multi-agency by design
              </span>
              <span>
                <Check size={13} />
                White-label workspace
              </span>
              <span>
                <Check size={13} />
                Human-controlled automation
              </span>
            </div>
          </div>

          <div className={styles.productFrame}>
            <div className={styles.frameTop}>
              <div>
                <span className={styles.frameMark}>R</span>
                <div>
                  <strong>Northstar Football</strong>
                  <small>AGENCY WORKSPACE</small>
                </div>
              </div>

              <span className={styles.liveChip}>
                <i />
                Live
              </span>
            </div>

            <div className={styles.frameTabs}>
              <span className={styles.activeTab}>Home</span>
              <span>Players</span>
              <span>Market</span>
              <span>Deals</span>
              <span>Relationships</span>
            </div>

            <div className={styles.frameBody}>
              <div className={styles.frameHeading}>
                <div>
                  <small>DAILY OPERATING PICTURE</small>
                  <h2>Today</h2>
                </div>

                <div className={styles.captureChip}>
                  <Bot size={14} />
                  Tell ReDream
                </div>
              </div>

              <article className={styles.focusCard}>
                <div>
                  <small>DO THIS FIRST</small>
                  <strong>
                    Resolve Leo Martin&apos;s overdue player action
                  </strong>
                  <p>
                    One player-service commitment is overdue and blocks the
                    current service standard.
                  </p>
                </div>

                <button type="button" tabIndex={-1}>
                  Open action
                  <ArrowRight size={14} />
                </button>
              </article>

              <div className={styles.metricGrid}>
                <div>
                  <span>Needs you</span>
                  <strong>4</strong>
                </div>
                <div>
                  <span>Autopilot ready</span>
                  <strong>7</strong>
                </div>
                <div>
                  <span>Live deals</span>
                  <strong>6</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong>2</strong>
                </div>
              </div>

              <div className={styles.queue}>
                <div className={styles.queueHead}>
                  <strong>Needs judgement</strong>
                  <span>Evidence-ranked</span>
                </div>

                <div className={styles.queueRow}>
                  <span className={styles.queueIcon}>
                    <BriefcaseBusiness size={14} />
                  </span>
                  <div>
                    <strong>Riverton United · Leo Martin</strong>
                    <small>Deal control · next decision missing</small>
                  </div>
                  <ArrowRight size={14} />
                </div>

                <div className={styles.queueRow}>
                  <span className={styles.queueIcon}>
                    <Network size={14} />
                  </span>
                  <div>
                    <strong>Westhaven FC</strong>
                    <small>Warm route stronger than direct access</small>
                  </div>
                  <ArrowRight size={14} />
                </div>

                <div className={styles.queueRow}>
                  <span className={styles.queueIcon}>
                    <Target size={14} />
                  </span>
                  <div>
                    <strong>Belgium · left winger need</strong>
                    <small>3 recorded player routes ready for review</small>
                  </div>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.section}
        id="product"
      >
        <div className={styles.sectionIntro}>
          <p>ONE OPERATING SYSTEM</p>
          <h2>
            Built around the work agents actually do.
          </h2>
          <span>
            Not a generic CRM with football labels. Each surface exists to
            move player service, market access, a live deal or agency
            revenue forward.
          </span>
        </div>

        <div className={styles.productGrid}>
          {productAreas.map((item) => {
            const Icon = item.icon;

            return (
              <article
                className={styles.productCard}
                key={item.title}
              >
                <div className={styles.productIcon}>
                  <Icon size={18} />
                </div>

                <p>{item.eyebrow}</p>
                <h3>{item.title}</h3>
                <span>{item.copy}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.workflowSection}`}
        id="workflow"
      >
        <div className={styles.workflowCopy}>
          <p>THE REVENUE SPINE</p>
          <h2>
            From a club need to money collected.
          </h2>
          <span>
            ReDream keeps the commercial thread connected instead of
            scattering it across WhatsApp, spreadsheets, inboxes and agent
            memory.
          </span>

          <div className={styles.workflowNotes}>
            <div>
              <Clock3 size={16} />
              <span>
                Follow-up and commitments stay attached to the underlying
                player, club and deal.
              </span>
            </div>

            <div>
              <DatabaseZap size={16} />
              <span>
                Agency Memory preserves what changed, who approved it and
                what can still be undone.
              </span>
            </div>
          </div>
        </div>

        <div className={styles.workflowRail}>
          {workflow.map((item, index) => (
            <div
              className={styles.workflowStep}
              key={item}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
              {index < workflow.length - 1 ? (
                <ArrowRight size={14} />
              ) : (
                <Check size={14} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.principlesSection}`}
        id="principles"
      >
        <div className={styles.principlesVisual}>
          <div className={styles.brainRing}>
            <BrainCircuit size={30} />
          </div>

          <p>AGENCY AUTOPILOT</p>
          <h3>
            AI where it removes admin.
            <span> Human judgement where it matters.</span>
          </h3>

          <div className={styles.controlStack}>
            <div>
              <MessageSquareText size={16} />
              <span>Capture</span>
            </div>
            <ArrowRight size={14} />
            <div>
              <BrainCircuit size={16} />
              <span>Structure</span>
            </div>
            <ArrowRight size={14} />
            <div>
              <Workflow size={16} />
              <span>Prepare</span>
            </div>
            <ArrowRight size={14} />
            <div className={styles.humanControl}>
              <Fingerprint size={16} />
              <span>Human decision</span>
            </div>
          </div>
        </div>

        <div className={styles.principlesCopy}>
          <div>
            <ShieldCheck size={18} />
            <section>
              <strong>Evidence before confidence</strong>
              <span>
                Missing evidence stays missing. ReDream does not invent
                relationships, player intent, negotiation limits or signing
                outcomes.
              </span>
            </section>
          </div>

          <div>
            <Fingerprint size={18} />
            <section>
              <strong>Bounded actions</strong>
              <span>
                High-impact actions stay prepared, reviewable and explicitly
                confirmed rather than silently executed.
              </span>
            </section>
          </div>

          <div>
            <DatabaseZap size={18} />
            <section>
              <strong>Memory with provenance</strong>
              <span>
                The platform records what changed, who acted, the supporting
                evidence and whether a reversible action can still be undone.
              </span>
            </section>
          </div>

          <div>
            <UsersRound size={18} />
            <section>
              <strong>Player-safe by design</strong>
              <span>
                Player transparency can stay separate from fees, internal
                notes, relationship routes and private negotiation
                intelligence.
              </span>
            </section>
          </div>
        </div>
      </section>

      <section className={styles.securityBand}>
        <div>
          <p>BUILT FOR MULTI-AGENCY SaaS</p>
          <h2>
            Your agency. Your brand. Your operating data.
          </h2>
        </div>

        <div className={styles.securityItems}>
          <span>
            <ShieldCheck size={15} />
            Tenant-aware permissions
          </span>
          <span>
            <Network size={15} />
            Custom domains
          </span>
          <span>
            <Sparkles size={15} />
            White-label experience
          </span>
          <span>
            <DatabaseZap size={15} />
            Audited operating history
          </span>
        </div>
      </section>

      <section
        className={styles.section}
        id="pricing"
      >
        <div className={styles.sectionIntro}>
          <p>PRICING</p>
          <h2>
            Start with the agency you run today.
          </h2>
          <span>
            Scale the operating system as your roster, team and commercial
            complexity grow.
          </span>
        </div>

        <div className={styles.pricingGrid}>
          {plans.map((plan) => (
            <article
              className={`${styles.planCard} ${
                plan.featured ? styles.featuredPlan : ''
              }`}
              key={plan.name}
            >
              {plan.featured ? (
                <div className={styles.planBadge}>
                  MOST COMPLETE START
                </div>
              ) : null}

              <p>{plan.name.toUpperCase()}</p>
              <h3>
                {plan.price}
                <span>{plan.suffix}</span>
              </h3>
              <small>{plan.capacity}</small>

              <strong>{plan.promise}</strong>
              <p className={styles.planOutcome}>
                {plan.outcome}
              </p>

              <div className={styles.planFeatures}>
                {plan.features.map((feature) => (
                  <span key={feature}>
                    <Check size={13} />
                    {feature}
                  </span>
                ))}
              </div>

              <ReDreamDemoRequestButton
                className={
                  plan.featured
                    ? styles.primaryCta
                    : styles.planCta
                }
                label="Talk to ReDream"
                requestedPlan={plan.name.toLowerCase()}
              />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p>REDREAM SYSTEMS</p>
          <h2>
            Spend less time operating the admin.
            <span> Spend more time operating the agency.</span>
          </h2>
        </div>

        <ReDreamDemoRequestButton
          className={styles.finalButton}
          label="Request a ReDream demo"
        />
      </section>

      <footer className={styles.footer}>
        <Link
          href="/"
          className={styles.footerBrand}
        >
          <span>R</span>
          <strong>ReDream Systems</strong>
        </Link>

        <div>
          <span>Operating systems for football agencies.</span>
          <a href={`mailto:${DEMO_EMAIL}`}>{DEMO_EMAIL}</a>
        </div>
      </footer>
    </main>
  );
}
