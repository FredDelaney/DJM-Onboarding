'use client';


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

import JourneyStatus from '@/components/JourneyStatus';
import {usePlayerPageRead} from '@/lib/use-player-page-read';

const readPresentation = async (playerId: string) => {
  const {data,error} = await supabase.from('player_public_profiles').select('*').eq('player_id', playerId).maybeSingle();
  if (error) throw error;
  return data || null;
};

export default function CV() {
  const ctx =
    usePlayerContext();

  const pageRead = usePlayerPageRead(ctx.player?.id, readPresentation);
  const pub = pageRead.data;

  if (ctx.loading || ctx.error) {
    return <LoadingScreen error={ctx.error} onRetry={() => void ctx.refresh()} />;
  }

  if (!ctx.player) {
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus title="No player profile is linked yet" description="Ask your agency to link your profile to this account."/></main></PlayerShell>;
  }

  if (pageRead.loading || pageRead.error) {
    return <PlayerShell><main className="narrow player-shell"><JourneyStatus
      kind={pageRead.error ? 'error' : 'loading'}
      title={pageRead.error ? 'Your presentation could not load' : 'Loading your presentation'}
      description={pageRead.error || 'Loading the profile your agency has prepared for clubs.'}
      onRetry={pageRead.error ? () => void pageRead.retry() : undefined}
    /></main></PlayerShell>;
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
            MY PLAYER PROFILE
          </div>

          <h1 className="page-title">
            Your agency is preparing
            your presentation.
          </h1>

          <p className="page-intro">
            It will appear here after your agency prepares and verifies it.
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
                Pay, passports, personal contacts, check-ins and private files are not automatically shared.
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
                Your Player Profile
              </strong>

              <span>
                This is the
                presentation your agency uses
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
              : 'Your agency preview'}
          </span>
        </div>
      </div>

      <PublicProfile
        profile={pub}
      />
    </PlayerShell>
  );
}
