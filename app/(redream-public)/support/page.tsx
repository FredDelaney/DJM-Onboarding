import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import ReDreamMarketingShell from '@/components/ReDreamMarketingShell';
import ReDreamDemoRequestButton from '@/components/ReDreamDemoRequestButton';
import styles from '@/components/ReDreamMarketingPages.module.css';

export const metadata:Metadata={title:'Support | ReDream Agency Autopilot',description:'Account access, billing and getting started with your ReDream agency workspace.',alternates:{canonical:'/support'}};
export default function SupportPage(){
 return <ReDreamMarketingShell>
  <section className={styles.hero}><div className={styles.heroInner}><div className={styles.heroCopy}>
   <p className={styles.eyebrow}>HELP AND GETTING STARTED</p>
   <h1>A clear route into your agency workspace.</h1>
   <p>Get help with account access, your plan or the first agency situation you want to work through.</p>
   <div className={styles.heroActions}><Link href="/sign-in" className={styles.primary}>Sign in <ArrowRight size={16}/></Link><a href="mailto:team@redreamsystems.com" className={styles.secondary}>Contact ReDream</a></div>
  </div></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><p>ACCOUNT ACCESS</p><h2>Start with the right invitation.</h2></div>
   <div className={styles.architecture}>
    <article><div><small>AGENCY STAFF</small><h3>Open your agency workspace.</h3><p>Staff access comes from an agency invitation. Use the email address your agency invited. Your account's agency membership determines the workspace you can open.</p><Link href="/sign-in">Agency sign in</Link></div></article>
    <article><div><small>REPRESENTED PLAYERS</small><h3>Use your private player portal.</h3><p>Players join through a private player invitation. If you sign in on the ReDream website, choose your agency's verified portal to continue.</p><Link href="/player-workspaces">Find your player portal</Link></div></article>
    <article><div><small>PASSWORD RECOVERY</small><h3>Get back into your account.</h3><p>Request a recovery email using your account address, then open the newest link. An expired link can be replaced with a new request.</p><Link href="/forgot-password">Reset your password</Link></div></article>
   </div>
  </section>
  <section className={styles.section}><div className={styles.sectionHead}><p>PLANS AND BILLING</p><h2>Know what happens before you commit.</h2></div>
   <div className={styles.architecture}>
    <article><div><h3>A demo is an enquiry.</h3><p>A demo request does not create an account, start a subscription or commit your agency to a plan. Bring one player, club need or live deal to explore the fit.</p><Link href="/product#agency-demo">Explore the example agency</Link></div></article>
    <article><div><h3>Plan changes need confirmation.</h3><p>Agency owners can request a plan change from Billing settings. The request is reviewed before it takes effect. Your current plan remains in place until the change is completed.</p><Link href="/#pricing">See plans and capacities</Link></div></article>
    <article><div><h3>Billing help has a direct route.</h3><p>When online billing is enabled, agency owners can manage payment information and invoices in the payment provider's portal. For other arrangements, contact ReDream to confirm billing or request an invoice.</p><a href="mailto:team@redreamsystems.com?subject=Billing%20support">Contact billing support</a></div></article>
   </div>
  </section>
  <section className={styles.section}><div className={styles.sectionHead}><p>HELP WITH AN ISSUE</p><h2>Tell us where you got stuck.</h2></div><p>Send your agency name, the page you were using and what happened to <a href="mailto:team@redreamsystems.com">team@redreamsystems.com</a>. Do not send passwords or private player documents by email.</p><p>For information about data access and handling, see <Link href="/security">Security</Link> and <Link href="/privacy">Privacy</Link>.</p></section>
  <section className={styles.final}><div><h2>Work through one real agency situation.</h2><p>Use a focused demonstration to decide whether ReDream fits your team's work.</p></div><ReDreamDemoRequestButton className={styles.lightButton} label="Book a demo" trackingKey="support_demo"/></section>
 </ReDreamMarketingShell>;
}
