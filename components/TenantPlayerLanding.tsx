'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  FolderLock,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';

import Brand from '@/components/Brand';
import { useTenantRuntime } from '@/components/TenantRuntimeProvider';

export default function TenantPlayerLanding() {
  const runtime = useTenantRuntime();

  const supportEmail = runtime.resolved
    ? runtime.branding.support_email
    : null;

  return (
    <main className="landing">
      <div className="container topbar">
        <Brand light />

        <Link className="btn btn-white btn-sm" href="/sign-in">
          Sign in
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="container landing-main">
        <section>
          <div className="caps" style={{ color: 'var(--yellow)' }}>
            PRIVATE WORKSPACE
          </div>

          <h1>Your career, in one place.</h1>

          <p>
            Represented players get a simple private career space. Agency staff
            use the same secure sign-in to open the full agency workspace for
            players, market work, relationships and deals.
          </p>

          <div
            className="row"
            style={{
              marginTop: 30,
              flexWrap: 'wrap',
            }}
          >
            <Link className="btn btn-yellow" href="/sign-in">
              Open workspace
              <ArrowRight size={17} />
            </Link>

            {supportEmail ? (
              <a
                className="btn"
                style={{
                  color: '#fff',
                  background: 'rgba(255,255,255,.08)',
                }}
                href={`mailto:${supportEmail}`}
              >
                Contact the agency
              </a>
            ) : null}
          </div>
        </section>

        <aside className="landing-panel">
          <div className="caps" style={{ color: 'rgba(255,255,255,.45)' }}>
            ROLE-AWARE ACCESS
          </div>

          <div className="landing-list">
            <div className="landing-item">
              <BriefcaseBusiness size={21} color="#f5e900" />
              <div>
                <b>Agency staff</b>
                <span>
                  Your agency workspace opens automatically from your tenant
                  membership.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <ShieldCheck size={21} color="#f5e900" />
              <div>
                <b>Represented players</b>
                <span>
                  Players see only their private career workspace and the
                  information their agency needs from them.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <MessageCircle size={21} color="#f5e900" />
              <div>
                <b>One secure account</b>
                <span>
                  No separate legacy admin login and no global role switcher.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <Activity size={21} color="#f5e900" />
              <div>
                <b>Tenant-native from sign-in onward</b>
                <span>
                  Access follows the agency membership, permissions and player
                  relationship recorded for this workspace.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <FolderLock size={21} color="#f5e900" />
              <div>
                <b>Private by default</b>
                <span>
                  Agency and player experiences stay separate without splitting
                  the workspace into separate systems.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
