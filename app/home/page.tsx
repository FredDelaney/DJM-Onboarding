'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
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
        ? 'Club ready'
        : score >= 75
          ? 'Nearly ready'
          : 'Build your profile',
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
  const [publicProfile, setPublicProfile] =
    useState<any>(null);

  useEffect(() => {
    if (!ctx.player) return;

    (async () => {
      const [
        { data: announcements },
        { count: videos },
        { data: weekly },
        { data: dossier },
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

        supabase
          .from('player_public_profiles')
          .select('*')
          .eq('player_id', ctx.player.id)
          .maybeSingle(),
      ]);

      setAnnouncement(
        announcements?.[0] || null,
      );
      setVideoCount(videos || 0);
      setCheckins(weekly || []);
      setPublicProfile(dossier || null);
    })();
  }, [ctx.player?.id]);

  const ready = useMemo(
    () =>
      readiness(
        ctx.player,
        ctx.privateInfo,
        videoCount,
      ),
    [
      ctx.player,
      ctx.privateInfo,
      videoCount,
    ],
  );

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
  const firstRequest = ctx.openRequests?.[0];
  const checkDue =
    !ctx.latestCheckin ||
    ctx.latestCheckin.week_start !==
      weekStartISO();

  const fullName =
    [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ') ||
    player.preferred_name ||
    'DJM Player';

  const firstName =
    player.preferred_name ||
    player.first_name ||
    'there';

  const photo = publicFile(
    'player-public',
    player.profile_photo_path,
  );

  const heroPhoto = publicFile(
    'player-public',
    publicProfile?.hero_image_path ||
      publicProfile?.profile_photo_path ||
      player.profile_photo_path,
  );

  const footballLine = [
    player.primary_position,
    player.current_club,
    player.current_country,
  ]
    .filter(Boolean)
    .join(' · ');

  const action = firstRequest
    ? {
        kicker: 'ACTION NEEDED',
        title: firstRequest.title,
        copy:
          firstRequest.message ||
          'DJM needs one thing from you.',
        href: '/inbox',
        cta: 'Open update',
      }
    : checkDue
      ? {
          kicker: 'THIS WEEK',
          title: `How’s your week, ${firstName}?`,
          copy:
            'If everything is good, your weekly update takes one tap.',
          href: '/check-in',
          cta: 'Check in',
        }
      : ready.score < 100
        ? {
            kicker: 'STAY READY',
            title:
              ready.missing[0]?.label ||
              'Keep your profile current.',
            copy:
              'Small updates now mean your profile is ready when a club asks.',
            href:
              ready.missing[0]?.href ||
              '/profile',
            cta: 'Update',
          }
        : {
            kicker: 'YOU’RE UP TO DATE',
            title: 'Your player profile is ready.',
            copy:
              'Nothing needed from you right now.',
            href: '/cv',
            cta: 'View club profile',
          };

  return (
    <PlayerShell
      inboxCount={ctx.openRequests.length}
    >
      <main className="container player-shell player-home-premium">
        <section className="player-identity-hero">
          {heroPhoto && (
            <img
              className="player-identity-bg"
              src={heroPhoto}
              alt=""
            />
          )}
          <div className="player-identity-shade" />

          <div className="player-identity-copy">
            <div className="player-identity-kicker">
              <span>DJM PLAYER</span>
              <span className="player-identity-dot" />
              <span>
                {player.verification_status === 'verified'
                  ? 'DJM VERIFIED'
                  : player.verification_status === 'reviewing'
                    ? 'DJM REVIEWING'
                    : 'PRIVATE CAREER SPACE'}
              </span>
            </div>

            <h1>{fullName}</h1>

            <p>
              {footballLine ||
                'Your football profile is being built'}
            </p>

            <div className="player-identity-badges">
              <span>
                <ShieldCheck size={14} />
                {ready.score}% profile ready
              </span>
              {publicProfile?.published && (
                <span>
                  Club profile live
                </span>
              )}
            </div>
          </div>

          <Link
            href="/profile"
            className="player-identity-edit"
          >
            Profile
            <ArrowRight size={15} />
          </Link>
        </section>

        <section className="player-next-card">
          <div>
            <div className="player-next-kicker">
              {action.kicker}
            </div>
            <h2>{action.title}</h2>
            <p>{action.copy}</p>
          </div>

          <div className="player-next-actions">
            <Link
              href={action.href}
              className="btn btn-navy"
            >
              {action.cta}
              <ArrowRight size={16} />
            </Link>

            <Link
              href="/inbox?compose=1"
              className="btn btn-quiet"
            >
              Send DJM a note
              <MessageCircle size={16} />
            </Link>
          </div>
        </section>

        <MySeason
          checkins={checkins}
          seasonLabel={
            player.current_season_label
          }
          seasonStart={
            player.current_season_start
          }
          verifiedProfile={publicProfile}
        />

        <Link
          href="/cv"
          className="player-dossier-teaser"
        >
          {photo && (
            <img
              src={photo}
              alt=""
            />
          )}
          <div className="player-dossier-teaser-shade" />
          <div className="player-dossier-teaser-copy">
            <div className="player-dossier-teaser-kicker">
              YOUR CLUB PROFILE
            </div>
            <h2>
              {publicProfile
                ? 'See what clubs see.'
                : 'DJM is building your club presentation.'}
            </h2>
            <p>
              {publicProfile
                ? 'Your verified football story, footage and career record in one club-ready presentation.'
                : 'Once DJM finishes the verified version, it will appear here.'}
            </p>
            <span>
              {publicProfile
                ? 'Open club profile'
                : 'View status'}
              <ArrowRight size={16} />
            </span>
          </div>
        </Link>

        <section className="card pad player-ready-card">
          <div className="player-section-heading">
            <div>
              <div className="section-kicker">
                CAREER PROFILE
              </div>
              <h2 className="section-title">
                Keep the important things ready.
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

          <div className="player-ready-progress">
            <span
              style={{ width: `${ready.score}%` }}
            />
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
                <strong>Best next update</strong>
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

          <div className="player-ready-links">
            <Link href="/profile">
              <UserRound size={17} />
              Career information
              <ArrowRight size={15} />
            </Link>
            <Link href="/documents">
              <FileText size={17} />
              Secure documents
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        {announcement && (
          <section className="card pad player-from-djm player-announcement-premium">
            <div className="section-kicker">
              FROM DJM
            </div>
            <h3>{announcement.title}</h3>
            <p>{announcement.body}</p>
          </section>
        )}

        <section className="player-privacy-note player-privacy-premium">
          <ShieldCheck size={18} />
          <div>
            <strong>Private by default</strong>
            <span>
              Your personal contact details,
              passports, salary expectations,
              check-ins and private documents stay
              private unless DJM deliberately prepares
              something for a club.
            </span>
          </div>
        </section>
      </main>
    </PlayerShell>
  );
}
