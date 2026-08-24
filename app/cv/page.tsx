'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowRight,
  Download,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

import {
  PlayerShell,
  usePlayerContext,
  LoadingScreen,
} from '@/components/PlayerShell';

import {
  downloadClubCv,
} from '@/components/ClubCvPdf';

import {
  publicFile,
  supabase,
} from '@/lib/supabase';

export default function CV() {
  const ctx = usePlayerContext();

  const [pub, setPub] =
    useState<any>(null);

  const [
    downloading,
    setDownloading,
  ] = useState(false);

  const [
    downloadError,
    setDownloadError,
  ] = useState('');

  useEffect(() => {
    if (!ctx.player) return;

    supabase
      .from('player_public_profiles')
      .select('*')
      .eq(
        'player_id',
        ctx.player.id
      )
      .maybeSingle()
      .then(({ data }) => {
        setPub(data);
      });
  }, [ctx.player?.id]);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  const p = ctx.player;

  if (!p) {
    return null;
  }

  const photo = publicFile(
    'player-public',
    pub?.profile_photo_path ||
      p.profile_photo_path
  );

  const name =
    pub?.display_name ||
    [
      p.first_name,
      p.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    p.preferred_name ||
    'Player';

  const downloadPdf = async () => {
    if (!pub) {
      setDownloadError(
        'DJM is still preparing your club CV.'
      );
      return;
    }

    setDownloading(true);
    setDownloadError('');

    try {
      await downloadClubCv({
        profile: pub,
        photoUrl:
          photo || null,
        logoUrl: `${window.location.origin}/djm-mark.png`,
        filename:
          `${name}-DJM-CV.pdf`,
      });
    } catch (error: any) {
      setDownloadError(
        error?.message ||
          'Could not build the PDF.'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <PlayerShell
      inboxCount={
        ctx.openRequests.length
      }
    >
      <main className="container player-shell">
        <div
          className="row-between no-print"
          style={{
            alignItems: 'flex-end',
            margin:
              '14px 0 28px',
          }}
        >
          <div>
            <div className="section-kicker">
              CLUB PROFILE
            </div>

            <h1
              className="page-title"
              style={{
                marginBottom: 0,
              }}
            >
              What clubs can see.
            </h1>
          </div>

          <button
            className="btn btn-navy btn-sm"
            onClick={downloadPdf}
            disabled={
              downloading || !pub
            }
          >
            <Download size={15} />

            {downloading
              ? 'Building PDF…'
              : 'Download CV'}
          </button>
        </div>

        <div
          className="card pad no-print"
          style={{
            marginBottom: 22,
          }}
        >
          <div className="row-between">
            <div className="row">
              <LockKeyhole
                size={18}
              />

              <strong>
                DJM controls
                publishing.
              </strong>
            </div>

            <span
              className={`pill ${
                p.verification_status ===
                'verified'
                  ? 'pill-good'
                  : p.verification_status ===
                      'reviewing'
                    ? 'pill-warn'
                    : ''
              }`}
            >
              <ShieldCheck
                size={13}
              />

              {p.verification_status ===
              'verified'
                ? 'DJM verified'
                : p.verification_status ===
                    'reviewing'
                  ? 'Reviewing latest update'
                  : 'Awaiting verification'}
            </span>
          </div>

          <p
            className="small muted"
            style={{
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Your private career
            information is never
            included here. DJM
            controls the club-facing
            version and verifies the
            information before it is
            shared.
          </p>

          {!pub && (
            <p
              className="small"
              style={{
                margin:
                  '12px 0 0',
                fontWeight: 700,
              }}
            >
              Your downloadable DJM
              CV will appear here once
              the club profile has
              been prepared.
            </p>
          )}

          {downloadError && (
            <p
              className="small"
              style={{
                margin:
                  '12px 0 0',
                fontWeight: 700,
              }}
            >
              {downloadError}
            </p>
          )}
        </div>

        <article
          style={{
            borderRadius: 30,
            overflow: 'hidden',
            background: '#fff',
            boxShadow:
              'var(--shadow)',
          }}
        >
          <div
            className="hero-public"
            style={{
              minHeight: 470,
            }}
          >
            <div className="container">
              <div className="public-top">
                <strong>
                  DJM SPORTS
                  MANAGEMENT
                </strong>

                <div className="row">
                  <span
                    className="tiny"
                    style={{
                      color:
                        'rgba(255,255,255,.62)',
                    }}
                  >
                    {pub?.verified_at
                      ? `VERIFIED ${new Date(
                          pub.verified_at
                        )
                          .toLocaleDateString(
                            'en-GB',
                            {
                              day: 'numeric',
                              month:
                                'short',
                              year: 'numeric',
                            }
                          )
                          .toUpperCase()}`
                      : 'UNVERIFIED PREVIEW'}
                  </span>

                  <span
                    className="pill"
                    style={{
                      background:
                        'rgba(255,255,255,.1)',
                      color: '#fff',
                    }}
                  >
                    {pub?.published
                      ? 'LIVE'
                      : 'PREVIEW'}
                  </span>
                </div>
              </div>

              <div
                className="public-hero-grid"
                style={{
                  paddingTop: 52,
                }}
              >
                <div>
                  <div className="yellow-line" />

                  <h2
                    className="public-name"
                    style={{
                      fontSize: 58,
                    }}
                  >
                    {name}
                  </h2>

                  <p className="public-headline">
                    {pub?.headline ||
                      [
                        p.primary_position,
                        p.current_club,
                      ]
                        .filter(Boolean)
                        .join(' · ') ||
                      'Professional footballer represented by DJM Sports Management'}
                  </p>
                </div>

                <div
                  className="public-photo"
                  style={{
                    maxHeight: 380,
                  }}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                    />
                  ) : (
                    name[0]
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="container">
            <div
              className="fact-row"
              style={{
                marginTop: -24,
              }}
            >
              <div className="fact">
                <small>
                  Position
                </small>

                <strong>
                  {pub?.primary_position ||
                    p.primary_position ||
                    '—'}
                </strong>
              </div>

              <div className="fact">
                <small>Foot</small>

                <strong>
                  {pub?.preferred_foot ||
                    p.preferred_foot ||
                    '—'}
                </strong>
              </div>

              <div className="fact">
                <small>
                  Height
                </small>

                <strong>
                  {pub?.height_display ||
                    (p.height_cm
                      ? `${p.height_cm} cm`
                      : '—')}
                </strong>
              </div>

              <div className="fact">
                <small>
                  Status
                </small>

                <strong>
                  {pub?.current_status ||
                    p.contract_status ||
                    '—'}
                </strong>
              </div>
            </div>

            <section
              className="public-section"
              style={{
                paddingBottom: 42,
              }}
            >
              <div className="section-kicker">
                WHY REVIEW
              </div>

              <div
                className="why-box"
                style={{
                  fontSize: 26,
                }}
              >
                {pub?.why_review ||
                  'DJM will add the concise club-facing recruitment positioning here once the profile is verified and ready.'}
              </div>
            </section>
          </div>
        </article>

        <div
          className="row no-print"
          style={{
            justifyContent:
              'center',
            marginTop: 26,
          }}
        >
          <Link
            href="/profile"
            className="btn btn-quiet"
          >
            Update my source
            information
            <ArrowRight
              size={16}
            />
          </Link>
        </div>
      </main>
    </PlayerShell>
  );
}
