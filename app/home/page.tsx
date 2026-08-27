'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

import MySeason from '@/components/MySeason';
import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';
import {
  buildWeeklyPlan,
  calculateCareerReadiness,
  getContractSignal,
  getRecommendedPlaybook,
} from '@/lib/player-career';
import {
  fmtDate,
  publicFile,
  supabase,
  weekStartISO,
} from '@/lib/supabase';

type HomeData = {
  announcement: Record<string, any> | null;
  videoCount: number;
  checkins: Array<Record<string, any>>;
  publicProfile: Record<string, any> | null;
  documents: Array<Record<string, any>>;
  latestDjmUpdate: Record<string, any> | null;
};

const EMPTY_DATA: HomeData = {
  announcement: null,
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

const displayStatus = (value?: string | null) => {
  if (!value) return 'Not updated';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function Home() {
  const ctx = usePlayerContext();
  const [data, setData] = useState<HomeData>(EMPTY_DATA);
  const [refreshIssue, setRefreshIssue] = useState(false);

  useEffect(() => {
    if (!ctx.player) return;

    let active = true;

    const load = async () => {
      const [
        announcementResult,
        videoResult,
        checkinResult,
        profileResult,
        documentResult,
        updateResult,
      ] = await Promise.all([
        supabase
          .from('announcements')
          .select('id,title,body,created_at')
          .eq('published', true)
          .order('created_at', { ascending: false })
          .limit(1),
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
          .select(
            'id,title,message,request_type,status,created_by,created_at,completed_at',
          )
          .eq('player_id', ctx.player.id)
          .neq('request_type', 'signal')
          .not('created_by', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (!active) return;

      setData({
        announcement: announcementResult.data?.[0] || null,
        videoCount: videoResult.count || 0,
        checkins: checkinResult.data || [],
        publicProfile: profileResult.data || null,
        documents: documentResult.data || [],
        latestDjmUpdate: updateResult.data?.[0] || null,
      });
      setRefreshIssue(
        [
          announcementResult.error,
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
    [
      ctx.player,
      ctx.privateInfo,
      ctx.latestCheckin,
      data.documents,
      data.publicProfile,
      data.videoCount,
    ],
  );

  if (ctx.loading) return <LoadingScreen />;

  if (!ctx.player) {
    return (
      <PlayerShell>
        <div className="narrow" style={{ paddingTop: 60 }}>
          <div className="card pad-lg">
            <h2>We’re setting up your player record.</h2>
            <p className="muted">
              If you just joined, refresh in a moment or contact DJM.
            </p>
          </div>
        </div>
      </PlayerShell>
    );
  }

  const player = ctx.player;
  const firstName =
    player.preferred_name || player.first_name || 'there';
  const checkinDue =
    !ctx.latestCheckin ||
    ctx.latestCheckin.week_start !== weekStartISO();
  const weeklyPlan = buildWeeklyPlan({
    readiness,
    openRequests: ctx.openRequests,
    checkinDue,
  });
  const topAction = weeklyPlan[0];
  const contract = getContractSignal(player);
  const recommended = getRecommendedPlaybook({
    player,
    latestCheckin: ctx.latestCheckin,
    readiness,
  });
  const heroPhoto = publicFile(
    'player-public',
    data.publicProfile?.hero_image_path ||
      data.publicProfile?.profile_photo_path ||
      player.profile_photo_path,
  );
  const lastCheckin = data.checkins[data.checkins.length - 1] || null;
  const djmUpdate = data.latestDjmUpdate || data.announcement;

  return (
    <PlayerShell inboxCount={ctx.openRequests.length}>
      <main className="container player-shell player-home-command">
        <header
          className={`player-command-hero ${
            heroPhoto ? 'has-photo' : 'no-photo'
          }`}
        >
          {heroPhoto && (
            <Image
              className="player-command-photo"
              src={heroPhoto}
              alt=""
              fill
              priority
              sizes="(max-width: 700px) 100vw, 900px"
            />
          )}
          <div className="player-command-shade" />

          <div className="player-command-main">
            <div className="player-command-kicker">
              <span>DJM PLAYER</span>
              <i />
              <span>{displayStatus(player.football_status)}</span>
            </div>
            <h1>
              {greeting()},
              <br />
              {firstName}.
            </h1>
            <p>
              {[player.primary_position, player.current_club]
                .filter(Boolean)
                .join(' · ') || 'Your private career command centre'}
            </p>

            <div className="player-command-primary">
              <span>{topAction.eyebrow}</span>
              <strong>{topAction.title}</strong>
              <small>{topAction.detail}</small>
              <Link href={topAction.href} className="btn btn-yellow">
                {topAction.cta}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <Link href="/career#readiness" className="player-command-score">
            <div
              className="player-command-score-ring"
              style={
                {
                  '--career-score': `${readiness.score * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <strong>{readiness.score}</strong>
            </div>
            <div>
              <span>OPPORTUNITY READINESS</span>
              <strong>{readiness.label}</strong>
              <small>Preparation, not ability</small>
            </div>
            <ArrowRight size={15} />
          </Link>
        </header>

        {refreshIssue && (
          <div className="career-load-warning" role="status">
            <Clock3 size={16} />
            Some live information could not refresh. Nothing in your
            record was changed.
          </div>
        )}

        <section className="player-pulse-grid">
          <div>
            <span>
              <CheckCircle2 size={14} />
              THIS WEEK
            </span>
            <strong>
              {checkinDue ? 'Check-in due' : 'Check-in complete'}
            </strong>
            <small>
              {lastCheckin
                ? displayStatus(lastCheckin.availability_status)
                : 'DJM needs your current availability'}
            </small>
          </div>
          <div>
            <span>
              <CalendarDays size={14} />
              CONTRACT
            </span>
            <strong>{contract.label}</strong>
            <small>
              {player.contract_expiry
                ? `Ends ${fmtDate(player.contract_expiry)}`
                : contract.detail}
            </small>
          </div>
          <div>
            <span>
              <ShieldCheck size={14} />
              CLUB PROFILE
            </span>
            <strong>
              {data.publicProfile?.published
                ? 'Live and approved'
                : data.publicProfile
                  ? 'In DJM review'
                  : 'Not prepared yet'}
            </strong>
            <small>Open the exact club-facing version</small>
          </div>
          <div>
            <span>
              <Film size={14} />
              FOOTBALL EVIDENCE
            </span>
            <strong>
              {data.videoCount > 0
                ? `${data.videoCount} video${
                    data.videoCount === 1 ? '' : 's'
                  } connected`
                : 'Footage needed'}
            </strong>
            <small>Your strongest current evidence</small>
          </div>
        </section>

        <section className="player-week-grid">
          <div className="player-week-plan">
            <div className="player-week-head">
              <div>
                <span>MY WEEK</span>
                <h2>A plan that keeps you ready.</h2>
              </div>
              <Link href="/career#readiness">
                Full readiness
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="player-week-list">
              {weeklyPlan.slice(0, 3).map((item, index) => (
                <Link href={item.href} key={item.id}>
                  <span className="player-week-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <small>{item.eyebrow}</small>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          </div>

          <aside className="player-agent-desk">
            <div className="player-agent-desk-head">
              <span className="player-agent-mark">DJM</span>
              <div>
                <span>YOUR AGENT DESK</span>
                <strong>Connected to your representation.</strong>
              </div>
            </div>

            {djmUpdate ? (
              <div className="player-agent-update">
                <span>
                  {data.latestDjmUpdate ? 'LATEST DJM UPDATE' : 'FROM DJM'}
                </span>
                <strong>{djmUpdate.title}</strong>
                <p>{djmUpdate.message || djmUpdate.body}</p>
                {djmUpdate.created_at && (
                  <small>{fmtDate(djmUpdate.created_at)}</small>
                )}
              </div>
            ) : (
              <div className="player-agent-update">
                <span>DJM CONNECTION</span>
                <strong>Your private line to the agency.</strong>
                <p>
                  Share a change, ask a direct question or prepare the
                  next conversation.
                </p>
              </div>
            )}

            <div className="player-agent-actions">
              <Link href="/inbox">
                <MessageCircle size={16} />
                Open DJM updates
                <ArrowRight size={14} />
              </Link>
              <Link href="/inbox?compose=1">
                Send a private note
                <ArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </section>

        <MySeason
          checkins={data.checkins}
          seasonLabel={player.current_season_label}
          seasonStart={player.current_season_start}
          verifiedProfile={data.publicProfile}
        />

        <section className="player-value-grid">
          <Link href="/career#toolkit" className="player-toolkit-spotlight">
            <div className="player-toolkit-icon">
              <Sparkles size={22} />
            </div>
            <span>RECOMMENDED PLAYER PLAYBOOK</span>
            <h2>{recommended.title}</h2>
            <p>{recommended.description}</p>
            <div>
              <strong>{recommended.minutes} minutes</strong>
              <span>
                Start playbook
                <ArrowRight size={15} />
              </span>
            </div>
          </Link>

          <div className="player-career-shortcuts">
            <div>
              <span>CAREER CONTROL</span>
              <h2>Everything important, connected.</h2>
            </div>
            <Link href="/career">
              <BriefcaseBusiness size={18} />
              My career record
              <ArrowRight size={15} />
            </Link>
            <Link href="/documents">
              <FileText size={18} />
              Secure documents
              <ArrowRight size={15} />
            </Link>
            <Link href="/profile?edit=media">
              <Target size={18} />
              Footage and sources
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <Link href="/cv" className="player-club-view-strip">
          <ShieldCheck size={22} />
          <div>
            <span>YOUR CLUB-FACING PROFILE</span>
            <strong>
              {data.publicProfile?.published
                ? 'See exactly what clubs can see.'
                : 'Preview the presentation DJM is preparing.'}
            </strong>
          </div>
          <ArrowRight size={18} />
        </Link>

        <section className="player-privacy-note player-privacy-premium">
          <ShieldCheck size={18} />
          <div>
            <strong>Private by default</strong>
            <span>
              Contact details, passports, salary expectations,
              check-ins and private documents stay private unless DJM
              deliberately prepares approved information for a club.
            </span>
          </div>
        </section>
      </main>
    </PlayerShell>
  );
}
