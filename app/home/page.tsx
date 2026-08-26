'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';

import MySeason from '@/components/MySeason';

import {
  publicFile,
  supabase,
  weekStartISO,
} from '@/lib/supabase';

function readiness(
  player: any,
  privateInfo: any,
  videoCount: number,
) {
  if (!player) {
    return {
      score: 0,
      label: 'Getting started',
      missing: [] as any[],
    };
  }

  const checks = [
    {
      ok: !!(
        player.first_name &&
        player.last_name &&
        player.date_of_birth &&
        player.primary_position &&
        player.preferred_foot
      ),
      label: 'Complete your football basics',
href: '/profile?edit=football',
    },
    {
      ok: !!(
        player.current_club ||
        player.football_status === 'free_agent' ||
        String(player.contract_status || '')
          .toLowerCase()
          .includes('free')
      ),
    label: 'Confirm your current club or status',
href: '/profile?edit=football',
    },
    {
      ok: !!(
        privateInfo?.phone ||
        privateInfo?.whatsapp
      ),
     label: 'Add a contact number',
href: '/profile?edit=career',
    },
    {
      ok: !!privateInfo?.passports_held?.length,
      label: 'Add your passports',
href: '/profile?edit=career',
    },
    {
      ok: !!privateInfo?.market_preferences,
    label: 'Tell DJM which markets you would consider',
href: '/profile?edit=career',
    },
    {
      ok: !!player.profile_photo_path,
      label: 'Add a current player photo',
      href: '/profile',
    },
    {
      ok: !!(
        player.transfermarkt_url ||
        player.wyscout_url ||
        player.stats_url
      ),
     label: 'Add a trusted football source',
href: '/profile?edit=sources',
    },
    {
      ok: videoCount > 0,
      label: 'Add current player footage',
      href: '/profile?edit=media',
    },
  ];

  const score = Math.round(
    (checks.filter((item) => item.ok).length /
      checks.length) *
      100,
  );

  return {
    score,
    label:
      score === 100
        ? 'Player side ready'
        : score >= 75
          ? 'Nearly ready'
          : 'Needs a few details',
    missing: checks.filter((item) => !item.ok),
  };
}

export default function Home() {
  const ctx = usePlayerContext();

  const [announcement, setAnnouncement] =
    useState<any>(null);

  const [videoCount, setVideoCount] =
    useState(0);

  const [checkins, setCheckins] =
    useState<any[]>([]);

  useEffect(() => {
    if (!ctx.player) return;

    (async () => {
      const [
        { data: announcements },
        { count: videos },
        { data: weekly },
      ] = await Promise.all([
        supabase
          .from('announcements')
          .select('*')
          .eq('published', true)
          .order('created_at', {
            ascending: false,
          })
          .limit(1),

        supabase
          .from('player_videos')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('player_id', ctx.player.id),

        supabase
          .from('weekly_checkins')
          .select(
            'id,week_start,matches_played,minutes_played,goals,assists,submitted_at',
          )
          .eq('player_id', ctx.player.id)
          .order('week_start', {
            ascending: true,
          })
          .limit(40),
      ]);

      setAnnouncement(
        announcements?.[0] || null,
      );

      setVideoCount(videos || 0);
      setCheckins(weekly || []);
    })();
  }, [ctx.player?.id]);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  if (!ctx.player) {
    return (
      <PlayerShell>
        <div
          className="narrow"
          style={{ paddingTop: 60 }}
        >
          <div className="card pad-lg">
            <h2>
              We’re setting up your player record.
            </h2>

            <p className="muted">
              If you just joined, refresh in a moment
              or contact DJM.
            </p>
          </div>
        </div>
      </PlayerShell>
    );
  }

  const player = ctx.player;
  const privateInfo = ctx.privateInfo;

  const ready = readiness(
    player,
    privateInfo,
    videoCount,
  );

  const firstRequest =
    ctx.openRequests?.[0];

  const checkDue =
    !ctx.latestCheckin ||
    ctx.latestCheckin.week_start !==
      weekStartISO();

  const firstName =
    player.preferred_name ||
    player.first_name ||
    'there';

  const photo = publicFile(
    'player-public',
    player.profile_photo_path,
  );

  const focus = firstRequest
    ? {
        label: 'DJM NEEDS YOU',
        title: firstRequest.title,
        copy:
          firstRequest.message ||
          'There is a request waiting for you.',
        href: '/inbox',
        cta: 'Open request',
      }
    : checkDue
      ? {
          label: 'THIS WEEK',
          title:
            'Your weekly update is ready.',
          copy:
            'A quick check-in keeps your agent current and builds your private season tracker.',
          href: '/check-in',
          cta: 'Check in now',
        }
      : ready.score < 100
        ? {
            label: 'KEEP YOUR PROFILE READY',
            title:
              ready.missing[0]?.label ||
              'Keep your information current.',
            copy:
              'One small update now means less chasing when an opportunity moves quickly.',
            href:
              ready.missing[0]?.href ||
              '/profile',
            cta: 'Update now',
          }
        : {
            label: 'ALL GOOD',
            title: 'You’re up to date.',
            copy:
              'DJM has what it needs right now. Your season tracker will keep building as you check in.',
            href: '/cv',
            cta: 'View my dossier',
          };

  return (
    <PlayerShell
      inboxCount={ctx.openRequests.length}
    >
      <main className="container player-shell player-home-21">
        <header className="player-head">
          <div>
            <h1 className="greeting">
              Hi {firstName}.
            </h1>

            <div className="sub-greeting">
              Your DJM career space
            </div>
          </div>

          <Link
            href="/profile"
            className="avatar avatar-lg"
            aria-label="Open profile"
          >
            {photo ? (
              <img
                src={photo}
                alt=""
              />
            ) : (
              firstName.charAt(0)
            )}
          </Link>
        </header>

        <div className="player-home-stack">
          <section className="focus-card dark-card">
            <div className="focus-label">
              {focus.label}
            </div>

            <h2 className="focus-title">
              {focus.title}
            </h2>

            <p className="focus-copy">
              {focus.copy}
            </p>

            <div className="focus-actions">
              <Link
                href={focus.href}
                className="btn btn-yellow"
              >
                {focus.cta}
                <ArrowRight size={17} />
              </Link>

              <Link
                href="/inbox?compose=1"
                className="btn player-dark-secondary"
              >
                Message DJM
                <MessageCircle size={16} />
              </Link>
            </div>
          </section>

          <MySeason   checkins={checkins}   seasonLabel={     player.current_season_label   }   seasonStart={     player.current_season_start   } />

          <section className="card pad player-profile-card">
            <div className="player-section-heading">
              <div>
                <div className="section-kicker">
                  MY DJM PROFILE
                </div>

                <h2 className="section-title">
                  Stay ready for opportunities.
                </h2>
              </div>

              <span
                className={`pill ${
                  ready.score === 100
                    ? 'pill-green'
                    : 'pill-blue'
                }`}
              >
                {ready.label}
              </span>
            </div>

            <div className="profile-strip">
              <div className="avatar avatar-xl">
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                  />
                ) : (
                  firstName.charAt(0)
                )}
              </div>

              <div style={{ flex: 1 }}>
                <h3>
                  {[
                    player.first_name,
                    player.last_name,
                  ]
                    .filter(Boolean)
                    .join(' ') || firstName}
                </h3>

                <p>
                  {[
                    player.primary_position,
                    player.current_club,
                  ]
                    .filter(Boolean)
                    .join(' · ') ||
                    'Add your football details'}
                </p>

                <div
                  className={`verify-line ${
                    player.verification_status ===
                    'verified'
                      ? 'verified'
                      : ''
                  }`}
                >
                  <ShieldCheck size={14} />

                  <span>
                    {player.verification_status ===
                    'verified'
                      ? 'Reviewed by DJM'
                      : player.verification_status ===
                          'reviewing'
                        ? 'DJM review in progress'
                        : 'DJM review pending'}
                  </span>
                </div>

                <div className="progress-line">
                  <span
                    style={{
                      width: `${ready.score}%`,
                    }}
                  />
                </div>
              </div>
            </div>

           {ready.missing.length > 0 && (
  <Link
    href={
      ready.missing[0]?.href ||
      '/profile'
    }
    className="readiness-note"
  >
    <CheckCircle2 size={17} />

    <div>
      <strong>
        Best next update
      </strong>

      <span>
        {ready.missing[0].label}
      </span>
    </div>

    <ArrowRight
      size={15}
      className="muted"
    />
  </Link>
)}

            <div
              className="list-clean"
              style={{ marginTop: 12 }}
            >
              <Link
                href="/cv"
                className="list-row"
              >
                <div className="list-icon">
                  <FileText size={18} />
                </div>

                <div className="list-copy">
                  <strong>
                    My club dossier
                  </strong>

                  <span>
                    Preview how DJM presents you
                    to clubs
                  </span>
                </div>

                <ArrowRight
                  size={16}
                  className="muted"
                />
              </Link>

              <Link
                href="/profile"
                className="list-row"
              >
                <div className="list-icon">
                  <UserRound size={18} />
                </div>

                <div className="list-copy">
                  <strong>
                    Career information
                  </strong>

                  <span>
                    Football, preferences, media
                    and sources
                  </span>
                </div>

                <ArrowRight
                  size={16}
                  className="muted"
                />
              </Link>

              <Link
                href="/documents"
                className="list-row"
              >
                <div className="list-icon">
                  <LockKeyhole size={18} />
                </div>

                <div className="list-copy">
                  <strong>
                    Secure documents
                  </strong>

                  <span>
                    Private files available to DJM
                    when needed
                  </span>
                </div>

                <ArrowRight
                  size={16}
                  className="muted"
                />
              </Link>
            </div>
          </section>

          {announcement && (
            <section className="card pad player-from-djm">
              <div className="section-kicker">
                FROM DJM
              </div>

              <h3>{announcement.title}</h3>

              <p>
                {announcement.body}
              </p>
            </section>
          )}

          <section className="player-privacy-note">
            <ShieldCheck size={18} />

            <div>
              <strong>
                Private by default
              </strong>

              <span>
                Contact details, passports,
                salary expectations and private
                career information are not part of
                your club-facing dossier unless DJM
                deliberately prepares them for
                sharing.
              </span>
            </div>
          </section>
        </div>
      </main>
    </PlayerShell>
  );
}
