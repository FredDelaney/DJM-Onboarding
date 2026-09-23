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
  Layers3,
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
    promise: 'Control the core operating work',
    outcome:
      'For boutique agencies that want player service, follow-up and agency memory out of people’s heads.',
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
    promise: 'Add Agency Autopilot and market intelligence',
    outcome:
      'For growing agencies that need conversations, club demand and relationships turned into coordinated work.',
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
    promise: 'Add owner-level revenue and negotiation control',
    outcome:
      'For established agencies that need service standards, deal control and commercial visibility across the business.',
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
    promise: 'Add scale, infrastructure and advanced control',
    outcome:
      'For complex agencies that need dedicated infrastructure, advanced access control and tailored rollout.',
    features: [
      'Everything in Elite',
      'Dedicated infrastructure',
      'SSO and advanced access control',
      'Tailored integrations and rollout',
    ],
  },
];

const painToOperation = [
  {
    icon: MessageSquareText,
    before: 'Conversation',
    after: 'Structured agency work',
    copy:
      'Turn a voice note, call recap or meeting into linked work without rebuilding the same information in multiple places.',
  },
  {
    icon: Target,
    before: 'Club need',
    after: 'Controlled pursuit',
    copy:
      'Connect the brief to the right player, the right relationship route and the next commercial move.',
  },
  {
    icon: Network,
    before: 'Relationship',
    after: 'Access route',
    copy:
      'Know who has the direct route, where a warm introduction is stronger and who owns the next step.',
  },
  {
    icon: BriefcaseBusiness,
    before: 'Opportunity',
    after: 'Deal momentum',
    copy:
      'Keep blockers, ownership, follow-up, decision-makers and negotiation preparation attached to the same live deal.',
  },
  {
    icon: UsersRound,
    before: 'Player work',
    after: 'Service proof',
    copy:
      'Turn everyday agency work into a visible record of service, commitments, career decisions and market activity.',
  },
  {
    icon: CircleDollarSign,
    before: 'Closed football work',
    after: 'Commission closeout',
    copy:
      'Separate expected value from confirmed terms, receivables, payments and actual commercial completion.',
  },
];

const operatingOutcomes = [
  {
    icon: Clock3,
    title: 'Miss less follow-up',
    copy:
      'Keep commitments and next actions attached to the underlying player, club, relationship or deal instead of scattered across memory and messages.',
  },
  {
    icon: Network,
    title: 'Use access deliberately',
    copy:
      'Make relationship ownership and warm introduction routes visible before the agency defaults to cold outreach.',
  },
  {
    icon: UsersRound,
    title: 'Make player service visible',
    copy:
      'Give the agency a defensible record of what has been done, what is overdue and what the player should experience next.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Protect deal momentum',
    copy:
      'Keep commercial blockers, decision points and the next move visible while the deal is still alive.',
  },
  {
    icon: CircleDollarSign,
    title: 'Close the revenue loop',
    copy:
      'Carry the work beyond agreement into closeout, commission receivables and payment tracking.',
  },
  {
    icon: Layers3,
    title: 'Give owners operating visibility',
    copy:
      'See where the agency needs judgement, where revenue is exposed and where service or ownership is falling behind.',
  },
];

const proofAreas = [
  {
    eyebrow: 'HOME',
    title: 'Needs You',
    copy:
      'An evidence-ranked decision queue that brings the most important unresolved agency work to the top.',
  },
  {
    eyebrow: 'CAPTURE',
    title: 'Tell ReDream',
    copy:
      'A universal capture layer that turns agency conversations into structured work while preserving human approval.',
  },
  {
    eyebrow: 'RELATIONSHIPS',
    title: 'Club Account Room',
    copy:
      'Direct access, warm introduction routes, live demand, key people and commercial context in one place.',
  },
  {
    eyebrow: 'PLAYERS',
    title: 'Player 360',
    copy:
      'Service, career timing, representation, market activity, commitments and value proof around one player picture.',
  },
  {
    eyebrow: 'DEALS',
    title: 'Deal War Room',
    copy:
      'Momentum, blockers, next move, negotiation guardrails, closeout and commission around the same commercial thread.',
  },
  {
    eyebrow: 'OWNERS',
    title: 'Owner Command Centre',
    copy:
      'Commercial exposure, receivables, team ownership and player-service control without turning the product into a dashboard factory.',
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

const audiences = [
  {
    label: 'BOUTIQUE',
    title: 'When the founder still carries the operating memory',
    copy:
      'Move follow-up, player commitments and opportunity context out of one person’s head without adding unnecessary process.',
  },
  {
    label: 'GROWING',
    title: 'When multiple agents need to move as one agency',
    copy:
      'Create shared ownership of players, relationships, club demand and deal follow-up while keeping judgement with the right person.',
  },
  {
    label: 'ESTABLISHED',
    title: 'When service and revenue need operating standards',
    copy:
      'See where player service is slipping, where commercial work is exposed and where the next owner-level intervention matters.',
  },
  {
    label: 'ENTERPRISE',
    title: 'When scale needs permissions and infrastructure',
    copy:
      'Use tenant-aware controls, white-label workspaces, custom domains and advanced access without a separate product architecture.',
  },
];

const faqs = [
  {
    question: 'Is ReDream a CRM?',
    answer:
      'No. ReDream is an operating system for football agencies. Its job is not simply to store contacts, players or deals. It connects those records into prioritised work, decisions, follow-up, player service and commercial execution.',
  },
  {
    question: 'Do we have to stop using the tools we already use?',
    answer:
      'No. ReDream is designed around the operating work of the agency. Specialist data sources, messaging, email and existing records can continue to exist while ReDream becomes the place where agency work is prioritised and followed through.',
  },
  {
    question: 'Will AI contact clubs or make decisions automatically?',
    answer:
      'High-impact actions stay human-controlled. ReDream can capture, structure, prepare and recommend, but important external actions and judgement remain reviewable and explicitly confirmed.',
  },
  {
    question: 'Can players see our internal commercial information?',
    answer:
      'The player experience is deliberately separated from internal fees, relationship routes, negotiation intelligence and private agency notes.',
  },
  {
    question: 'How do we move an existing roster into ReDream?',
    answer:
      'Agencies can start with one player for immediate value or use the roster migration workflow with duplicate review and controlled onboarding.',
  },
  {
    question: 'Can the platform use our agency brand?',
    answer:
      'Yes. ReDream is multi-agency by design, with tenant-aware branding, agency workspaces and support for custom domains.',
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
            aria-label="ReDream Systems"
          >
            <span className={styles.brandMark}>R</span>

            <span>
              <strong>ReDream</strong>
              <small>SYSTEMS</small>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#why">Why ReDream</a>
            <a href="#platform">Platform</a>
            <a href="#workflow">How it works</a>
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
              Not a CRM. The agency operating system.
            </div>

            <h1>
              Run the agency.
              <span> Not the admin.</span>
            </h1>

            <p>
              ReDream is the operating system for football agencies. It
              connects player service, club demand, relationships, market
              work, deals, negotiation and commission into one operating
              layer built around agent judgement.
            </p>

            <div className={styles.heroActions}>
              <ReDreamDemoRequestButton
                className={styles.primaryCta}
                label="Request a demo"
              />

              <a
                className={styles.secondaryCta}
                href="#why"
              >
                Why ReDream exists
              </a>
            </div>

            <div className={styles.heroProof}>
              <span>
                <Check size={13} />
                Operating system, not contact database
              </span>
              <span>
                <Check size={13} />
                White-label agency workspace
              </span>
              <span>
                <Check size={13} />
                Human-controlled Agency Autopilot
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
        className={`${styles.section} ${styles.problemSection}`}
        id="why"
      >
        <div className={styles.sectionIntro}>
          <p>WHY REDREAM EXISTS</p>
          <h2>
            Football agencies do not need another place to store information.
          </h2>
          <span>
            The information already exists across conversations,
            spreadsheets, inboxes, databases and people. The operating
            problem is turning that information into coordinated work before
            opportunities, service commitments or revenue slip.
          </span>
        </div>

        <div className={styles.problemStrip}>
          <span>WhatsApp</span>
          <ArrowRight size={14} />
          <span>Spreadsheets</span>
          <ArrowRight size={14} />
          <span>Inbox</span>
          <ArrowRight size={14} />
          <span>Agent memory</span>
          <ArrowRight size={14} />
          <strong>ReDream operating layer</strong>
        </div>

        <div className={styles.transformationGrid}>
          {painToOperation.map((item) => {
            const Icon = item.icon;

            return (
              <article className={styles.transformationCard} key={item.after}>
                <div className={styles.productIcon}>
                  <Icon size={18} />
                </div>

                <div className={styles.transformLabel}>
                  <span>{item.before}</span>
                  <ArrowRight size={13} />
                  <strong>{item.after}</strong>
                </div>

                <p>{item.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.categoryBand}>
        <div className={styles.categoryCopy}>
          <p>CATEGORY</p>
          <h2>
            Not another system of record.
            <span> A system of operation.</span>
          </h2>
          <p className={styles.categoryLead}>
            Players, clubs, contacts and deals are records. ReDream connects
            those records into the decisions and actions that actually move
            the agency.
          </p>
        </div>

        <div className={styles.categoryColumns}>
          <div>
            <small>RECORDS TELL YOU WHAT EXISTS</small>
            <ul>
              <li>Players and representation</li>
              <li>Clubs and contacts</li>
              <li>Opportunities and deals</li>
              <li>Tasks and commitments</li>
              <li>Commercial terms</li>
            </ul>
          </div>

          <div className={styles.operationColumn}>
            <small>REDREAM RUNS WHAT HAPPENS NEXT</small>
            <ul>
              <li>Prioritise the exceptions that need judgement</li>
              <li>Route work to the strongest relationship path</li>
              <li>Prepare the next commercial action</li>
              <li>Keep follow-up and ownership live</li>
              <li>Carry value through closeout and commission</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p>COMMERCIAL VALUE</p>
          <h2>
            Protect the revenue already inside the agency.
          </h2>
          <span>
            ReDream is designed to reduce operating leakage without
            pretending that software can replace relationships, judgement or
            negotiation.
          </span>
        </div>

        <div className={styles.outcomeGrid}>
          {operatingOutcomes.map((item) => {
            const Icon = item.icon;

            return (
              <article className={styles.outcomeCard} key={item.title}>
                <Icon size={18} />
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            );
          })}
        </div>

        <div className={styles.inlineCta}>
          <div>
            <strong>See where ReDream would remove operating friction in your agency.</strong>
            <span>No generic software tour. Start from the way your agency actually works.</span>
          </div>

          <ReDreamDemoRequestButton
            className={styles.primaryCta}
            label="Request a demo"
          />
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.platformSection}`}
        id="platform"
      >
        <div className={styles.sectionIntro}>
          <p>THE OPERATING PLATFORM</p>
          <h2>
            The product is the proof.
          </h2>
          <span>
            ReDream is built around real agency operating surfaces, not a
            generic database with football labels. Player Service, Access Intelligence,
            Deal Control and Closeout & Collection all connect back into one operating model.
          </span>
        </div>

        <div className={styles.proofGrid}>
          {proofAreas.map((item) => (
            <article className={styles.proofCard} key={item.title}>
              <small>{item.eyebrow}</small>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <span>
                Open operating surface
                <ArrowRight size={13} />
              </span>
            </article>
          ))}
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
            scattering it across messages, spreadsheets, inboxes and
            individual memory.
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

      <section className={`${styles.section} ${styles.principlesSection}`}>
        <div className={styles.principlesVisual}>
          <div className={styles.brainRing}>
            <BrainCircuit size={30} />
          </div>

          <p>AGENCY AUTOPILOT</p>
          <h3>
            AI where it removes operational work.
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
                Important actions stay prepared, reviewable and explicitly
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
                Player transparency stays separate from fees, internal notes,
                relationship routes and private negotiation intelligence.
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

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p>WHO IT IS FOR</p>
          <h2>
            One operating system across different stages of agency growth.
          </h2>
          <span>
            ReDream changes the amount of control and automation available,
            not the underlying operating model.
          </span>
        </div>

        <div className={styles.audienceGrid}>
          {audiences.map((item) => (
            <article className={styles.audienceCard} key={item.label}>
              <small>{item.label}</small>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.section}
        id="pricing"
      >
        <div className={styles.sectionIntro}>
          <p>PRICING</p>
          <h2>
            Buy more operating leverage as the agency grows.
          </h2>
          <span>
            The plans increase the depth of automation, commercial control
            and scale. The underlying agency operating system stays the same.
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
                  FOR GROWING AGENCIES
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

      <section className={`${styles.section} ${styles.faqSection}`}>
        <div className={styles.sectionIntro}>
          <p>COMMON QUESTIONS</p>
          <h2>
            Understand the category before you compare the features.
          </h2>
          <span>
            ReDream is designed to become the operating layer of the agency,
            not another place for agents to duplicate records.
          </span>
        </div>

        <div className={styles.faqGrid}>
          {faqs.map((item) => (
            <details className={styles.faqItem} key={item.question}>
              <summary>
                {item.question}
                <span>+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p>SEE REDREAM ON YOUR AGENCY</p>
          <h2>
            See how ReDream would run your agency.
            <span> Start from your real operating work.</span>
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
          <span>The operating system for football agencies.</span>
          <a href={`mailto:${DEMO_EMAIL}`}>{DEMO_EMAIL}</a>
        </div>
      </footer>
    </main>
  );
}
