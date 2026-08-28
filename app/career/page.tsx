'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileCheck2,
  Film,
  Flag,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';

import ProfessionalToolkit from '@/components/ProfessionalToolkit';
import PlayerCareerNavigator from '@/components/PlayerCareerNavigator';
import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';
import {
  calculateCareerReadiness,
  getContractSignal,
  getRecommendedPlaybook,
} from '@/lib/player-career';
import { fmtDate, supabase } from '@/lib/supabase';

type CareerData = {
  careerEntries: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  videos: Array<Record<string, any>>;
  agreements: Array<Record<string, any>>;
  publicProfile: Record<string, any> | null;
  resources: Array<Record<string, any>>;
};

const EMPTY_DATA: CareerData = {
  careerEntries: [],
  documents: [],
  videos: [],
  agreements: [],
  publicProfile: null,
  resources: [],
};

const statusLabel = (value?: string | null) => {
  if (!value) return 'Not confirmed';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function CareerPage() {
  const ctx = usePlayerContext();
  const [data, setData] = useState<CareerData>(EMPTY_DATA);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!ctx.player) return;

    let active = true;

    const load = async () => {
      setDataLoading(true);
      setLoadError(false);

      const [
        careerResult,
        documentResult,
        videoResult,
        agreementResult,
        profileResult,
        resourceResult,
      ] = await Promise.all([
        supabase
          .from('career_entries')
          .select('*')
          .eq('player_id', ctx.player.id)
          .order('sort_order', { ascending: true })
          .order('start_date', { ascending: false }),
        supabase
          .from('player_documents')
          .select(
            'id,title,document_type,country,expires_at,club_shareable,created_at',
          )
          .eq('player_id', ctx.player.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('player_videos')
          .select('id,title,video_type,featured,updated_at')
          .eq('player_id', ctx.player.id)
          .order('featured', { ascending: false })
          .order('sort_order', { ascending: true }),
        supabase
          .from('player_agreements')
          .select(
            'id,title,agreement_type,status,start_date,end_date,territory,visible_to_player',
          )
          .eq('player_id', ctx.player.id)
          .eq('visible_to_player', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('player_public_profiles')
          .select('*')
          .eq('player_id', ctx.player.id)
          .maybeSingle(),
        supabase
          .from('resources')
          .select(
            'id,title,description,category,resource_type,url,featured,sort_order',
          )
          .eq('published', true)
          .order('featured', { ascending: false })
          .order('sort_order', { ascending: true }),
      ]);

      if (!active) return;

      const failed = [
        careerResult.error,
        documentResult.error,
        videoResult.error,
        agreementResult.error,
        profileResult.error,
        resourceResult.error,
      ].some(Boolean);

      setData({
        careerEntries: careerResult.data || [],
        documents: documentResult.data || [],
        videos: videoResult.data || [],
        agreements: agreementResult.data || [],
        publicProfile: profileResult.data || null,
        resources: resourceResult.data || [],
      });
      setLoadError(failed);
      setDataLoading(false);
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
        videoCount: data.videos.length,
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
      data.videos.length,
    ],
  );

  if (ctx.loading) return <LoadingScreen />;

  if (!ctx.player) {
    return (
      <PlayerShell>
        <main className="narrow player-shell">
          <section className="card pad-lg">
            <h1>Your career space is being prepared.</h1>
            <p className="muted">
              Contact DJM if this does not update shortly.
            </p>
          </section>
        </main>
      </PlayerShell>
    );
  }

  const player = ctx.player;
  const firstName =
    player.preferred_name || player.first_name || 'Player';
  const contract = getContractSignal(player);
  const recommended = getRecommendedPlaybook({
    player,
    latestCheckin: ctx.latestCheckin,
    readiness,
  });
  const nextReadinessAction = readiness.components
    .filter((component) => component.score < 100)
    .sort(
      (a, b) =>
        b.weight * (1 - b.score / 100) -
        a.weight * (1 - a.score / 100),
    )[0];

  const expiringDocuments = data.documents.filter((document) => {
    if (!document.expires_at) return false;
    const expiry = new Date(`${document.expires_at}T12:00:00`);
    const days =
      (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 365;
  });

  return (
    <PlayerShell inboxCount={ctx.openRequests.length}>
      <main className="container player-shell player-career-page">
        <header className="career-hub-hero">
          <div className="career-hub-copy">
            <div className="career-hub-kicker">
              <Sparkles size={14} />
              MY PRIVATE PROFESSIONAL CENTRE
            </div>
            <h1>Build the career, not just the profile.</h1>
            <p>
              {firstName}, use this space to manage the work that matters to
              you: your week, development, season, decisions, records and
              private documents.
            </p>

            <div className="career-hub-actions">
              {nextReadinessAction ? (
                <Link
                  href={nextReadinessAction.href}
                  className="btn btn-yellow"
                >
                  Improve {nextReadinessAction.label.toLowerCase()}
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link href="/cv" className="btn btn-yellow">
                  Review club profile
                  <ArrowRight size={16} />
                </Link>
              )}
              <Link href="/inbox?compose=1" className="btn career-ghost-btn">
                Talk to DJM
              </Link>
            </div>
          </div>

          <div className="career-score-panel">
            <div
              className="career-score-ring"
              style={
                {
                  '--career-score': `${readiness.score * 3.6}deg`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>{readiness.score}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <div>
              <span>OPPORTUNITY READINESS</span>
              <strong>{readiness.label}</strong>
              <p>Preparation score-not a rating of your ability.</p>
            </div>
          </div>
        </header>

        <PlayerCareerNavigator current="career" />

        {loadError && (
          <div className="career-load-warning" role="status">
            <CircleAlert size={17} />
            Some live career information could not refresh. Your
            saved record has not been changed.
          </div>
        )}

        <section className="career-control-strip">
          <div>
            <span>
              <BriefcaseBusiness size={15} />
              CURRENT STATUS
            </span>
            <strong>{statusLabel(player.football_status)}</strong>
            <small>
              {player.current_club || 'No current club recorded'}
            </small>
          </div>
          <div>
            <span>
              <CalendarDays size={15} />
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
              <Flag size={15} />
              MOVE BRIEF
            </span>
            <strong>
              {ctx.privateInfo?.market_preferences
                ? 'Preferences recorded'
                : 'Needs your input'}
            </strong>
            <small>
              {ctx.privateInfo?.preferred_move_timing ||
                'No move timing recorded'}
            </small>
          </div>
          <div>
            <span>
              <ShieldCheck size={15} />
              CLUB PROFILE
            </span>
            <strong>
              {data.publicProfile?.published
                ? 'Live and approved'
                : data.publicProfile
                  ? 'In DJM review'
                  : 'Not prepared yet'}
            </strong>
            <small>
              {data.publicProfile?.verified_at
                ? `Verified ${fmtDate(data.publicProfile.verified_at)}`
                : 'DJM controls publication'}
            </small>
          </div>
        </section>

        <section id="readiness" className="career-readiness-section">
          <div className="career-section-heading">
            <div>
              <div className="section-kicker">PROFESSIONAL READINESS</div>
              <h2>Remove avoidable stress before an important moment.</h2>
              <p>{readiness.summary}</p>
            </div>
            <span className="career-readiness-total">
              {readiness.components.filter(
                (component) => component.score === 100,
              ).length}
              /{readiness.components.length} ready
            </span>
          </div>

          <div className="career-readiness-grid">
            {readiness.components.map((component) => (
              <Link
                key={component.id}
                href={component.href}
                className={`career-readiness-item tone-${component.tone}`}
              >
                <span className="career-readiness-icon">
                  {component.score === 100 ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <Target size={17} />
                  )}
                </span>
                <div>
                  <strong>{component.label}</strong>
                  <small>{component.detail}</small>
                </div>
                <span className="career-readiness-score">
                  {component.score}%
                </span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>

          <div className="career-assets-grid">
            <Link href="/profile?edit=media" className="career-asset-card">
              <Film size={20} />
              <span>FOOTAGE</span>
              <strong>
                {data.videos.length > 0
                  ? `${data.videos.length} video${
                      data.videos.length === 1 ? '' : 's'
                    } ready`
                  : 'No current footage'}
              </strong>
              <small>
                {data.videos.some((video) => video.featured)
                  ? 'Featured clip selected'
                  : 'Choose the evidence that represents you now'}
              </small>
              <ArrowRight size={15} />
            </Link>
            <Link href="/documents" className="career-asset-card">
              <FileCheck2 size={20} />
              <span>SECURE DOCUMENTS</span>
              <strong>
                {data.documents.length > 0
                  ? `${data.documents.length} stored securely`
                  : 'No documents stored'}
              </strong>
              <small>
                {expiringDocuments.length > 0
                  ? `${expiringDocuments.length} expire within 12 months`
                  : 'Private unless deliberately approved for sharing'}
              </small>
              <ArrowRight size={15} />
            </Link>
            <Link href="/cv" className="career-asset-card">
              <ShieldCheck size={20} />
              <span>WHAT CLUBS SEE</span>
              <strong>
                {data.publicProfile?.published
                  ? 'Club profile live'
                  : 'Private preview'}
              </strong>
              <small>
                Review the exact DJM-approved football information
              </small>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <section id="record" className="career-record-section">
          <div className="career-section-heading">
            <div>
              <div className="section-kicker">PROFESSIONAL RECORD</div>
              <h2>Your career, with evidence attached.</h2>
              <p>
                Club history and season numbers remain source-aware.
                Unknown data stays unknown-it is never turned into a zero.
              </p>
            </div>
            <Link href="/profile" className="btn btn-quiet btn-sm">
              Update record
              <ArrowRight size={14} />
            </Link>
          </div>

          {dataLoading ? (
            <div className="career-record-loading">
              <div className="loader" />
            </div>
          ) : data.careerEntries.length > 0 ? (
            <div className="career-timeline">
              {data.careerEntries.map((entry, index) => {
                const metrics = [
                  ['Apps', entry.appearances],
                  ['Starts', entry.starts],
                  ['Minutes', entry.minutes],
                  ['Goals', entry.goals],
                  ['Assists', entry.assists],
                ].filter(([, value]) => value !== null && value !== undefined);

                return (
                  <article key={entry.id} className="career-timeline-item">
                    <div className="career-timeline-rail">
                      <span>{index + 1}</span>
                    </div>
                    <div className="career-timeline-card">
                      <div className="career-timeline-head">
                        <div>
                          <span>
                            {entry.is_international
                              ? 'INTERNATIONAL'
                              : entry.season_label || 'CAREER RECORD'}
                          </span>
                          <h3>{entry.club_name}</h3>
                          <p>
                            <MapPin size={13} />
                            {[entry.league, entry.country]
                              .filter(Boolean)
                              .join(' · ') || 'Competition not recorded'}
                          </p>
                        </div>
                        <small>
                          {[fmtDate(entry.start_date), fmtDate(entry.end_date)]
                            .filter((value) => value !== '-')
                            .join(' - ') || 'Dates not recorded'}
                        </small>
                      </div>

                      {metrics.length > 0 && (
                        <div className="career-timeline-metrics">
                          {metrics.map(([label, value]) => (
                            <div key={String(label)}>
                              <strong>
                                {Number(value).toLocaleString('en-GB')}
                              </strong>
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="career-timeline-source">
                        {entry.source_name ? (
                          <>
                            <ShieldCheck size={14} />
                            Source: {entry.source_name}
                            {entry.source_reviewed_at &&
                              ` · Reviewed ${fmtDate(
                                entry.source_reviewed_at,
                              )}`}
                          </>
                        ) : (
                          <>
                            <Clock3 size={14} />
                            Source verification not yet recorded
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="career-record-empty">
              <Trophy size={22} />
              <div>
                <strong>Build a career record worth carrying.</strong>
                <span>
                  Add clubs and seasons once, then use the same trusted
                  record in your DJM profile and club presentation.
                </span>
              </div>
              <Link href="/profile">
                Add career history
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {data.agreements.length > 0 && (
            <div className="career-agreement-strip">
              <ShieldCheck size={18} />
              <div>
                <span>REPRESENTATION RECORD</span>
                <strong>
                  {data.agreements[0].title ||
                    statusLabel(data.agreements[0].agreement_type)}
                </strong>
                <small>
                  {statusLabel(data.agreements[0].status)}
                  {data.agreements[0].end_date &&
                    ` · Ends ${fmtDate(data.agreements[0].end_date)}`}
                </small>
              </div>
              <Link href="/documents">
                View
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>

        <ProfessionalToolkit
          recommendedId={recommended.id}
          publishedResources={data.resources}
        />
      </main>
    </PlayerShell>
  );
}
