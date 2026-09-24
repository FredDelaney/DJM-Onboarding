import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  MessageSquareText,
  Network,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import ReDreamFunnelTracker from '@/components/ReDreamFunnelTracker';
import ReDreamSimpleStory from '@/components/ReDreamSimpleStory';
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
    'ReDream helps football agencies keep players, club requests, relationships, follow-ups and deals connected so the team knows what needs attention and what to do next.',
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
          <Link href="/" className={styles.brand} aria-label="ReDream Systems">
            <img
              src="/brand/redream-lockup-light.png"
              alt="ReDream Systems"
              className={styles.brandLogo}
            />
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#how-it-works">How it works</a>
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
            <p className={styles.eyebrow}>SOFTWARE FOR FOOTBALL AGENCIES</p>
            <h1>
              Run your agency without relying on memory.
            </h1>
            <p className={styles.heroLead}>
              ReDream keeps your players, club requests, contacts and deals connected. It shows your team what needs attention and what to do next.
            </p>

            <div className={styles.heroActions}>
              <a href="#how-it-works" className={styles.primaryLink} data-funnel-cta="hero_how_it_works">
                See how it works
                <ArrowRight size={16} />
              </a>
              <ReDreamDemoRequestButton
                className={styles.secondaryButton}
                label="Book a demo"
                trackingKey="hero_demo"
              />
            </div>

            <div className={styles.heroTrust}>
              <span><CheckCircle2 size={14} /> Less admin</span>
              <span><CheckCircle2 size={14} /> Fewer missed follow-ups</span>
              <span><CheckCircle2 size={14} /> More time for deals</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="ReDream turns scattered agency work into one clear next move">
            <div className={styles.heroInputs}>
              <div><MessageSquareText size={17} /><span><small>WHATSAPP</small><strong>Club needs a left-footed CB</strong></span></div>
              <div><UsersRound size={17} /><span><small>PLAYER</small><strong>Daniel Costa is available</strong></span></div>
              <div><Network size={17} /><span><small>RELATIONSHIP</small><strong>You have a warm route</strong></span></div>
              <div><BellRing size={17} /><span><small>FOLLOW-UP</small><strong>Nothing gets forgotten</strong></span></div>
            </div>

            <div className={styles.heroArrow}><ArrowRight size={19} /></div>

            <div className={styles.heroAnswer}>
              <span>NEXT MOVE</span>
              <strong>Send Daniel's clips and confirm availability.</strong>
              <small>ReDream keeps the opportunity moving.</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.storySection} id="how-it-works">
        <div className={styles.sectionIntro}>
          <p>SEE REDREAM WORK</p>
          <h2>One club request. One clear next move.</h2>
          <span>
            ReDream turns scattered information into something your team can act on.
          </span>
        </div>
        <ReDreamSimpleStory />
        <div className={styles.deepLink}>
          <span>Want to see the technology underneath?</span>
          <Link href="/product">Explore the full product <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className={styles.changeSection} id="value">
        <div className={styles.sectionIntro}>
          <p>PROBLEM TO OUTCOME</p>
          <h2>The value is simple.</h2>
        </div>

        <div className={styles.changeGrid}>
          <article data-tone="problem">
            <span>Today</span>
            <h3>Too much depends on people remembering.</h3>
            <ul>
              <li>Club requests arrive everywhere.</li>
              <li>Relationships live in people's heads.</li>
              <li>Follow-ups are easy to miss.</li>
            </ul>
          </article>

          <article data-tone="value">
            <span>With ReDream</span>
            <h3>The important work stays connected.</h3>
            <ul>
              <li>Requests connect to the right players.</li>
              <li>Players connect to the best route into the club.</li>
              <li>Your team sees the next action.</li>
            </ul>
          </article>

          <article data-tone="outcome">
            <span>Business outcome</span>
            <h3>Your agency moves faster.</h3>
            <ul>
              <li>Respond to clubs faster.</li>
              <li>Miss fewer opportunities.</li>
              <li>Spend more time on relationships and deals.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.daySection}>
        <div className={styles.dayCopy}>
          <p>START THE DAY CLEAR</p>
          <h2>Know what needs your attention.</h2>
          <span>
            Instead of checking WhatsApp, email, notes and spreadsheets just to work out what to do.
          </span>
        </div>

        <div className={styles.dayGrid}>
          <article><UsersRound size={20} /><span><strong>Players</strong><small>Who needs an update?</small></span></article>
          <article><MessageSquareText size={20} /><span><strong>Club requests</strong><small>Which players fit?</small></span></article>
          <article><Network size={20} /><span><strong>Relationships</strong><small>Who gives you the best route?</small></span></article>
          <article><BriefcaseBusiness size={20} /><span><strong>Deals</strong><small>What needs to happen next?</small></span></article>
        </div>
      </section>

      <section className={styles.controlSection} id="control">
        <div>
          <p>YOU STAY IN CONTROL</p>
          <h2>ReDream helps with the work. You make the decisions.</h2>
        </div>

        <div className={styles.controlGrid}>
          <article>
            <CheckCircle2 size={18} />
            <span><strong>ReDream can help</strong><small>Organise information, connect the dots, prepare next steps and remind your team what is due.</small></span>
          </article>
          <article>
            <ShieldCheck size={18} />
            <span><strong>You approve important actions</strong><small>Important communication stays controlled by your agency.</small></span>
          </article>
          <article>
            <UsersRound size={18} />
            <span><strong>You own the judgement</strong><small>Negotiations and player career decisions stay with the agent.</small></span>
          </article>
        </div>
      </section>

      <section className={styles.commercialSection} id="pricing">
        <div className={styles.sectionIntro}>
          <p>PLANS FOR YOUR AGENCY</p>
          <h2>Start small. Prove the value first.</h2>
          <span>
            Start with one player, club request or live deal. See how ReDream works with your agency before moving everything across.
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
          <div>
            <CircleDollarSign size={18} />
            <span>
              <strong>See the value before a full rollout.</strong>
              <small>Bring one real situation. ReDream should make the next move clearer immediately.</small>
            </span>
          </div>
          <ReDreamDemoRequestButton className={styles.darkButton} label="Run ReDream on my agency" trackingKey="pricing_demo" />
        </div>
      </section>

      <section className={styles.finalCta} id="final-cta">
        <div>
          <p>TRY IT WITH SOMETHING REAL</p>
          <h2>A player. A club request. A relationship. A live deal.</h2>
          <span>
            Bring us one real situation from your agency. We will show you how ReDream connects it and what the next move could be.
          </span>
        </div>
        <ReDreamDemoRequestButton className={styles.lightButton} label="Run ReDream on my agency" trackingKey="final_demo" />
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand} aria-label="ReDream Systems">
          <img
            src="/brand/redream-lockup-dark.png"
            alt="ReDream Systems"
            className={styles.footerBrandLogo}
          />
        </Link>
        <div className={styles.footerMeta}>
          <span>Software for football agencies.</span>
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
