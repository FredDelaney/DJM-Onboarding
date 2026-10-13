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
   <p>Help with access, billing or your first agency workflow.</p>
   <div className={styles.heroActions}><Link href="/sign-in" className={styles.primary}>Sign in <ArrowRight size={16}/></Link><a href="mailto:team@redreamsystems.com" className={styles.secondary}>Contact ReDream</a></div>
  </div></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><p>ACCOUNT ACCESS</p><h2>Start with the right invitation.</h2></div>
   <div className={styles.architecture}>
    <article><div><small>AGENCY STAFF</small><h3>Open your agency workspace.</h3><p>Staff access starts with an agency invitation. Sign in with the invited email.</p><Link href="/sign-in">Agency sign in</Link></div></article>
    <article><div><small>REPRESENTED PLAYERS</small><h3>Use your private player portal.</h3><p>Players join through a private invite. Sign in through your agency's verified portal.</p><Link href="/player-workspaces">Find your player portal</Link></div></article>
    <article><div><small>PASSWORD RECOVERY</small><h3>Get back into your account.</h3><p>Request a recovery email, then open the newest link. Request another if it expires.</p><Link href="/forgot-password">Reset your password</Link></div></article>
   </div>
  </section>
  <section className={styles.section}><div className={styles.sectionHead}><p>PLANS AND BILLING</p><h2>Know what happens before you commit.</h2></div>
   <div className={styles.architecture}>
    <article><div><h3>A demo is an enquiry.</h3><p>A demo does not create an account or subscription. Bring one real player, need or deal.</p><Link href="/product#agency-demo">Explore the example agency</Link></div></article>
    <article><div><h3>Plan changes need confirmation.</h3><p>Owners can request a plan change in Billing. The current plan stays active until approved.</p><Link href="/#pricing">See plans and capacities</Link></div></article>
    <article><div><h3>Billing help has a direct route.</h3><p>Manage online billing in the payment portal. For other arrangements, contact ReDream.</p><a href="mailto:team@redreamsystems.com?subject=Billing%20support">Contact billing support</a></div></article>
   </div>
  </section>
  <section className={styles.section}><div className={styles.sectionHead}><p>HELP WITH AN ISSUE</p><h2>Tell us where you got stuck.</h2></div><p>Send your agency name, the page you were using and what happened to <a href="mailto:team@redreamsystems.com">team@redreamsystems.com</a>. Do not send passwords or private player documents by email.</p><p>For information about data access and handling, see <Link href="/security">Security</Link> and <Link href="/privacy">Privacy</Link>.</p></section>
  <section className={styles.final}><div><h2>Work through one real agency situation.</h2><p>Use one real situation to see if ReDream fits your team.</p></div><ReDreamDemoRequestButton className={styles.lightButton} label="Book a demo" trackingKey="support_demo"/></section>
 </ReDreamMarketingShell>;
}
