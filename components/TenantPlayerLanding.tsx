'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
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

        <Link
          className="btn btn-white btn-sm"
          href="/sign-in"
        >
          Player access
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="container landing-main">
        <section>
          <div
            className="caps"
            style={{ color: 'var(--yellow)' }}
          >
            PLAYER WORKSPACE
          </div>

          <h1>Your career, in one place.</h1>

          <p>
            A private career space for represented players. Keep your
            football information current, check in with your agent, share
            what your agency needs and stay ready when opportunities move
            quickly.
          </p>

          <div
            className="row"
            style={{
              marginTop: 30,
              flexWrap: 'wrap',
            }}
          >
            <Link
              className="btn btn-yellow"
              href="/sign-in"
            >
              Open Player Workspace
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
                Contact your agency
              </a>
            ) : null}
          </div>
        </section>

        <aside className="landing-panel">
          <div
            className="caps"
            style={{ color: 'rgba(255,255,255,.45)' }}
          >
            YOUR PRIVATE CAREER APP
          </div>

          <div className="landing-list">
            <div className="landing-item">
              <ShieldCheck
                size={21}
                color="#f5e900"
              />

              <div>
                <b>Your live player profile</b>
                <span>
                  Football data, preferences, documents and verified
                  club-facing information.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <MessageCircle
                size={21}
                color="#f5e900"
              />

              <div>
                <b>Direct agency inbox</b>
                <span>
                  Requests, questions and anything your agent needs from
                  you.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <Activity
                size={21}
                color="#f5e900"
              />

              <div>
                <b>60-second weekly check-in</b>
                <span>
                  Availability, fitness and anything that changed this
                  week.
                </span>
              </div>
            </div>

            <div className="landing-item">
              <FolderLock
                size={21}
                color="#f5e900"
              />

              <div>
                <b>Private by default</b>
                <span>
                  You and your agency control what stays private and what
                  clubs can see.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
