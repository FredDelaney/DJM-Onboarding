'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  Eye,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

import PublicProfile
  from '@/components/PublicProfile';

import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';

import {
  supabase,
} from '@/lib/supabase';

export default function CV() {
  const ctx =
    usePlayerContext();

  const [
    pub,
    setPub,
  ] =
    useState<any>(
      undefined,
    );

  useEffect(() => {
    if (!ctx.player) {
      return;
    }

    supabase
      .from(
        'player_public_profiles',
      )
      .select('*')
      .eq(
        'player_id',
        ctx.player.id,
      )
      .maybeSingle()
      .then(
        ({ data }) =>
          setPub(
            data ||
              null,
          ),
      );
  }, [
    ctx.player?.id,
  ]);

  if (
    ctx.loading ||
    pub === undefined
  ) {
    return (
      <LoadingScreen />
    );
  }

  if (!ctx.player) {
    return null;
  }

  if (!pub) {
    return (
      <PlayerShell
        inboxCount={
          ctx.openRequests
            .length
        }
      >
        <main className="narrow player-shell player-dossier-empty">
          <div className="section-kicker">
            MY CLUB DOSSIER
          </div>

          <h1 className="page-title">
            DJM is preparing
            your presentation.
          </h1>

          <p className="page-intro">
            Your club-facing
            dossier appears here
            once DJM has prepared
            the verified
            presentation.
          </p>

          <div className="card pad-lg player-dossier-empty-card">
            <LockKeyhole
              size={22}
            />

            <div>
              <strong>
                Private information
                stays private.
              </strong>

              <span>
                Salary expectations,
                passports, personal
                contact information,
                check-ins and private
                documents are not
                automatically included
                in your club dossier.
              </span>
            </div>
          </div>
        </main>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell
      inboxCount={
        ctx.openRequests
          .length
      }
    >
      <div className="player-dossier-preview">
        <div className="player-dossier-preview-inner">
          <div>
            <div className="player-dossier-preview-icon">
              <Eye
                size={17}
              />
            </div>

            <div>
              <strong>
                Your club-facing
                dossier
              </strong>

              <span>
                This is the
                presentation DJM uses
                for clubs.
              </span>
            </div>
          </div>

          <span
            className={`player-dossier-status ${
              pub.published
                ? 'is-live'
                : ''
            }`}
          >
            <ShieldCheck
              size={13}
            />

            {pub.published
              ? 'Live'
              : 'DJM preview'}
          </span>
        </div>
      </div>

      <PublicProfile
        profile={pub}
      />
    </PlayerShell>
  );
}
