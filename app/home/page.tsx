'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import MySeason from '@/components/MySeason';
import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';
import { calculateCareerReadiness } from '@/lib/player-career';
import { fmtDate, publicFile, supabase, weekStartISO } from '@/lib/supabase';

type HomeData = {
  videoCount: number;
  checkins: Array<Record<string, any>>;
  publicProfile: Record<string, any> | null;
  documents: Array<Record<string, any>>;
  latestDjmUpdate: Record<string, any> | null;
};

const EMPTY_DATA: HomeData = {
  videoCount: 0,
  checkins: [],
  publicProfile: null,
  documents: [],
  latestDjmUpdate: null,
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const humanStatus = (value?: string | null) =>
  value
    ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Not updated';

export default function Home() {
  const ctx = usePlayerContext();
  const [data, setData] = useState<HomeData>(EMPTY_DATA);
  const [refreshIssue, setRefreshIssue] = useState(false);

  useEffect(() => {
    if (!ctx.player) return;
    let active = true;

    const load = async () => {
      const [videoResult, checkinResult, profileResult, documentResult, updateResult] =
        await Promise.all([
          supabase
            .from('player_videos')
            .select('id', { count: 'exact', head: true })
            .eq('player_id', ctx.player.id),
          supabase
            .from('weekly_checkins')
            .select(
              'id,week_start,availability_status,fitness_status,club_situation_changed,matches_played,minutes_played,goals,assists,submitted_at',
            )
            .eq('player_id', ctx.player.id)
            .order('week_start', { ascending: true })
            .limit(40),
          supabase
            .from('player_public_profiles')
            .select('*')
            .eq('player_id', ctx.player.id)
            .maybeSingle(),
          supabase
            .from('player_documents')
            .select('id,document_type,expires_at,club_shareable')
            .eq('player_id', ctx.player.id),
          supabase
            .from('player_requests')
            .select('id,title,message,request_type,status,created_by,created_at,completed_at')
            .eq('player_id', ctx.player.id)
            .neq('request_type', 'signal')
            .not('created_by', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

      if (!active) return;
      setData({
        videoCount: videoResult.count || 0,
        checkins: checkinResult.data || [],
        publicProfile: profileResult.data || null,
        documents: documentResult.data || [],
        latestDjmUpdate: updateResult.data?.[0] || null,
      });
      setRefreshIssue(
        [
          videoResult.error,
          checkinResult.error,
          profileResult.error,
          documentResult.error,
          updateResult.error,
        ].some(Boolean),
      );
    };

    void load();
    return () => {
      active = false;
    };
  }, [ctx.player?.id]);

  const readiness = useMemo(
    () =>
      calculateCareerReadiness({
        player: ctx.player,
        privateInfo: ctx.privateInfo,
        videoCount: data.videoCount,
        documents: data.documents,
        publicProfile: data.publicProfile,
        latestCheckin: ctx.latestCheckin,
      }),
    [ctx.player, ctx.privateInfo, ctx.latestCheckin, data],
  );

  if (ctx.loading) return <LoadingScreen />;

  if (!ctx.player) {
    return (
      <PlayerShell>
        <main className="ux-player-page ux-player-empty">
          <section className="ux-player-card">
            <h1>Your DJM profile is being prepared.</h1>
            <p>There is nothing you need to do yet.</p>
          </section>
        </main>
      </PlayerShell>
    );
  }

  const player = ctx.player;
  const firstName = player.preferred_name || player.first_name || 'there';
  const checkinDue = !ctx.latestCheckin || ctx.latestCheckin.week_start !== weekStartISO();
  const heroPhoto = publicFile(
    'player-public',
    data.publicProfile?.hero_image_path ||
      data.publicProfile?.profile_photo_path ||
      player.profile_photo_path,
  );
  const lastCheckin = data.checkins[data.checkins.length - 1] || null;

  const expiringDocument = data.documents
    .filter((document) => document.expires_at)
    .map((document) => ({
      ...document,
      days: Math.ceil((new Date(document.expires_at).getTime() - Date.now()) / 86400000),
    }))
    .filter((document) => document.days >= 0 && document.days <= 60)
    .sort((a, b) => a.days - b.days)[0];

  const primary = ctx.openRequests[0]
    ? {
        eyebrow: 'DJM NEEDS ONE THING',
        title: ctx.openRequests[0].title || 'DJM needs an update',
        detail: ctx.openRequests[0].message || 'Open the request and send DJM what is needed.',
        href: '/inbox',
        cta: 'Open DJM',
      }
    : expiringDocument
      ? {
          eyebrow: 'PLEASE REVIEW',
          title: 'A document expires soon',
          detail: `${humanStatus(expiringDocument.document_type)} expires ${fmtDate(expiringDocument.expires_at)}.`,
          href: '/documents',
          cta: 'Open files',
        }
      : checkinDue
        ? {
            eyebrow: 'DJM NEEDS ONE THING',
            title: 'Weekly check-in due',
            detail: 'Tell DJM how you are, what has changed and whether you need anything.',
            href: '/check-in',
            cta: 'Check in',
          }
        : {
            eyebrow: "YOU'RE ALL GOOD",
            title: 'DJM has everything we need right now.',
            detail: 'We will only ask you when something actually needs your attention.',
            href: '/inbox',
            cta: 'Open DJM',
          };

  const outstandingReadiness = readiness.components.filter(
    (component) => component.score < 100,
  ).length;
  const profileState = data.publicProfile?.published
    ? 'Ready for clubs'
    : readiness.score >= 80
      ? 'Ready for DJM review'
      : `${outstandingReadiness} thing${outstandingReadiness === 1 ? '' : 's'} to finish`;

  return (
    <PlayerShell inboxCount={ctx.openRequests.length}>
      <main className="ux-player-page">
        <section className={`ux-player-hero ${heroPhoto ? 'has-photo' : ''}`}>
          {heroPhoto ? (
            <Image
              src={heroPhoto}
              alt=""
              fill
              priority
              sizes="(max-width: 700px) 100vw, 980px"
              className="ux-player-hero-image"
            />
          ) : null}
          <div className="ux-player-hero-shade" />
          <div className="ux-player-hero-copy">
            <span className="ux-kicker">DJM PLAYER</span>
            <h1>{greeting()}, {firstName}.</h1>
            <p>
              {[player.current_club, player.primary_position].filter(Boolean).join(' · ') ||
                'Your private connection to DJM'}
            </p>
          </div>

          <div className="ux-player-primary-action">
            <span>{primary.eyebrow}</span>
            <strong>{primary.title}</strong>
            <p>{primary.detail}</p>
            <Link href={primary.href} className="ux-primary-button">
              {primary.cta}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        {refreshIssue ? (
          <div className="ux-soft-warning" role="status">
            <Clock3 size={16} />
            Some live information could not refresh. Your saved record was not changed.
          </div>
        ) : null}

        <section className="ux-player-three">
          <Link href={checkinDue ? '/check-in' : '/home'} className="ux-player-card ux-player-summary-card">
            <span className="ux-kicker">THIS WEEK</span>
            <CheckCircle2 size={20} />
            <strong>{checkinDue ? 'Check-in due' : 'You are up to date'}</strong>
            <p>
              {lastCheckin
                ? humanStatus(lastCheckin.availability_status)
                : 'DJM will ask only for information we cannot collect automatically.'}
            </p>
          </Link>

          <Link href="/inbox" className="ux-player-card ux-player-summary-card">
            <span className="ux-kicker">FROM DJM</span>
            <MessageCircle size={20} />
            <strong>{data.latestDjmUpdate?.title || 'Your private agency line'}</strong>
            <p>
              {data.latestDjmUpdate?.message ||
                'Messages, requests and meaningful representation updates live here.'}
            </p>
          </Link>

          <Link href="/profile" className="ux-player-card ux-player-summary-card">
            <span className="ux-kicker">MY PROFILE</span>
            <UserRound size={20} />
            <strong>{profileState}</strong>
            <p>Career, club profile and secure files are all under Me.</p>
          </Link>
        </section>

        <section className="ux-player-card ux-player-club-card">
          <div>
            <span className="ux-kicker">WHAT CLUBS SEE</span>
            <h2>Your DJM club profile.</h2>
            <p>
              {data.publicProfile?.published
                ? 'Your approved profile is live. You can preview the exact club-facing version.'
                : 'DJM is building one clean, verified profile from your current information.'}
            </p>
          </div>
          <Link href="/cv" className="ux-secondary-button">
            <ShieldCheck size={16} />
            Preview profile
          </Link>
        </section>

        <details className="ux-player-season-fold">
          <summary>
            <span>
              <strong>My season</strong>
              <small>Verified football information</small>
            </span>
            <ChevronDown size={18} />
          </summary>
          <div>
            <MySeason
              checkins={data.checkins}
              seasonLabel={player.current_season_label}
              seasonStart={player.current_season_start}
              verifiedProfile={data.publicProfile}
            />
          </div>
        </details>

        <p className="ux-player-privacy-line">
          <ShieldCheck size={15} />
          Private by default. DJM controls what can be shared externally.
        </p>
      </main>
    </PlayerShell>
  );
}
