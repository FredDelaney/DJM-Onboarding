'use client';

import {
  useState,
} from 'react';

import {
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Play,
  ShieldCheck,
} from 'lucide-react';

import {
  publicFile,
  supabase,
} from '@/lib/supabase';

import {
  dossierCareer,
  dossierCareerStatLine,
  dossierHeadlineStats,
  dossierList,
  dossierNationality,
  dossierPerformance,
  dossierPositionMap,
  dossierVerifiedDate,
} from '@/lib/dossier';
import {
  researchSourceLabel,
  sameResearchUrl,
} from '@/lib/research-links';

export default function PublicProfile({
  profile,
  documents = [],
  shareToken,
}: {
  profile: any;
  documents?: any[];
  shareToken?: string;
}) {
  const [
    pdfBusy,
    setPdfBusy,
  ] = useState(false);

  const [
    notice,
    setNotice,
  ] = useState('');

  if (!profile) {
    return (
      <div className="center">
        <div className="card pad">
          Profile unavailable.
        </div>
      </div>
    );
  }

  const photo =
    publicFile(
      'player-public',
      profile.profile_photo_path,
    );

  const hidden =
    new Set(
      dossierList(
        profile.hidden_sections,
      ),
    );

  const verified =
    dossierVerifiedDate(
      profile.verified_at,
    );

  const career =
    dossierCareer(profile);

  const latestCareerSeason =
    career[0]?.season_label ||
    career[0]?.season ||
    career[0]?.start_date?.slice(
      0,
      4,
    ) ||
    null;

  const headlineStats =
    dossierHeadlineStats(
      profile,
      4,
    );

  const performance =
    dossierPerformance(
      profile,
      5,
    );

  const positionSpots =
    dossierPositionMap(
      profile,
    );

  const notable =
    dossierList(
      profile.notable_experience,
    );

  const videos =
    dossierList(
      profile.selected_videos,
    ).filter(
      (video: any) =>
        video?.url,
    );

  const primaryVideo =
    profile.primary_video_url ||
    videos?.[0]?.url ||
    null;

  const email =
    profile.contact_email ||
    'jesse.edge@djmsports.com';

  const nationality =
    dossierNationality(
      profile.nationalities,
    );

  const facts = [
    {
      label: 'Age',
      value:
        profile.age_display,
    },
    {
      label: 'Height',
      value:
        profile.height_display,
    },
    {
      label: 'Foot',
      value:
        profile.preferred_foot,
    },
    {
      label: 'Nationality',
      value:
        nationality !== '—'
          ? nationality
          : null,
    },
  ].filter(
    (item) => item.value,
  );

  const sources = [
    profile.transfermarkt_url && {
      label:
        'Transfermarkt',
      url:
        profile.transfermarkt_url,
    },

    profile.wyscout_url && {
      label:
        'Wyscout',
      url:
        profile.wyscout_url,
    },

    profile.stats_url &&
      !sameResearchUrl(
        profile.stats_url,
        profile.transfermarkt_url,
      ) && {
      label:
        researchSourceLabel(
          profile.stats_url,
        ),
      url:
        profile.stats_url,
    },
  ].filter(Boolean) as {
    label: string;
    url: string;
  }[];

  const mailto =
    `mailto:${email}?subject=${encodeURIComponent(
      `${profile.display_name} - Club enquiry`,
    )}`;

  const downloadPdf =
    async () => {
      setPdfBusy(true);
      setNotice('');

      try {
        const {
          downloadClubCv,
        } =
          await import(
            '@/components/ClubCvPdf'
          );

        await downloadClubCv({
          profile,
          photoUrl:
            photo || null,
          logoUrl:
            `${window.location.origin}/djm-mark.png`,
          filename:
            `${profile.display_name || 'DJM-Player'}-DJM-Player-Dossier.pdf`,
        });
      } catch (
        error: any
      ) {
        setNotice(
          error?.message ||
            'The player dossier PDF could not be created.',
        );
      } finally {
        setPdfBusy(false);
      }
    };

  const openDoc =
    async (document: any) => {
      if (!shareToken) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .functions
          .invoke(
            'club-document',
            {
              body: {
                token:
                  shareToken,

                document_id:
                  document.id,
              },
            },
          );

      if (
        error ||
        !data?.url
      ) {
        setNotice(
          'That secure document could not be opened.',
        );

        return;
      }

      window.open(
        data.url,
        '_blank',
      );
    };

  return (
    <main className="dossier-root">
      <section className="dossier-hero">
        <div className="dossier-container">
          <div className="dossier-top">
            <div className="dossier-brand">
              <span className="dossier-brand-mark">
                <img
                  src="/djm-mark.png"
                  alt=""
                />
              </span>

              <div>
                <strong>
                  DJM
                </strong>

                <span>
                  SPORTS MANAGEMENT
                </span>
              </div>
            </div>

            <button
              type="button"
              className="dossier-top-download no-print"
              onClick={
                downloadPdf
              }
              disabled={
                pdfBusy
              }
            >
              <Download
                size={15}
              />

              <span>
                {pdfBusy
                  ? 'Building…'
                  : 'PDF'}
              </span>
            </button>
          </div>

          <div className="dossier-hero-grid">
            <div className="dossier-hero-copy">
              <div className="dossier-accent" />

              <div className="dossier-eyebrow">
                DJM PLAYER DOSSIER
              </div>

              <h1 className="dossier-name">
                {
                  profile.display_name
                }
              </h1>

              <div className="dossier-position">
                {[
                  profile.primary_position,
                  profile.current_club,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              {profile.headline && (
                <p className="dossier-headline">
                  {
                    profile.headline
                  }
                </p>
              )}

              <div className="dossier-hero-badges">
                {profile.verified_at && (
                  <span>
                    <ShieldCheck
                      size={13}
                    />
                    DJM reviewed
                    {verified
                      ? ` · ${verified}`
                      : ''}
                  </span>
                )}

                {profile.current_status && (
                  <span>
                    {
                      profile.current_status
                    }
                  </span>
                )}

                {profile.market_value_display &&
                  profile.transfermarkt_url &&
                  !profile.hide_market_value && (
                    <span>
                      Market reference{' '}
                      {
                        profile.market_value_display
                      }
                    </span>
                  )}
              </div>

              <div className="dossier-hero-actions no-print">
                {primaryVideo && (
                  <a
                    className="dossier-hero-btn dossier-hero-btn-primary"
                    href={
                      primaryVideo
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Play
                      size={16}
                    />
                    Watch player
                  </a>
                )}

{profile.transfermarkt_url && (
  <a
    className="dossier-hero-btn dossier-hero-btn-secondary"
    href={
      profile.transfermarkt_url
    }
    target="_blank"
    rel="noreferrer"
  >
    <ExternalLink
      size={16}
    />

    Transfermarkt
  </a>
)}
                
                <button
                  type="button"
                  className="dossier-hero-btn dossier-hero-btn-secondary"
                  onClick={
                    downloadPdf
                  }
                  disabled={
                    pdfBusy
                  }
                >
                  <Download
                    size={16}
                  />
                  Download player dossier
                </button>

                <a
                  className="dossier-hero-btn dossier-hero-btn-secondary"
                  href={
                    mailto
                  }
                >
                  <Mail
                    size={16}
                  />
                  Speak to DJM
                </a>
              </div>
            </div>

            <div className="dossier-photo">
              {photo ? (
                <img
                  src={photo}
                  alt={
                    profile.display_name
                  }
                />
              ) : (
                <span>
                  {String(
                    profile.display_name ||
                      'P',
                  )
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="dossier-container dossier-content">
        {facts.length > 0 && (
          <section className="dossier-facts">
            {facts.map(
              (fact) => (
                <div
                  key={
                    fact.label
                  }
                >
                  <span>
                    {
                      fact.label
                    }
                  </span>

                  <strong>
                    {String(
                      fact.value,
                    )}
                  </strong>
                </div>
              ),
            )}
          </section>
        )}

        {notice && (
          <div
            className="dossier-notice no-print"
            role="status"
          >
            {notice}
          </div>
        )}

        {positionSpots.length > 0 && (
          <section className="dossier-player-profile">
            <div className="dossier-player-profile-head">
              <div>
                <span>PLAYER PROFILE</span>
                <h2>Position &amp; role.</h2>
              </div>
              <small>Primary and secondary playing positions</small>
            </div>

            <div className="dossier-player-profile-grid">
              <div className="dossier-pitch" aria-label="Player position map">
                <span className="dossier-pitch-half" />
                <span className="dossier-pitch-circle" />
                <span className="dossier-pitch-box dossier-pitch-box-top" />
                <span className="dossier-pitch-box dossier-pitch-box-bottom" />
                {positionSpots.map((spot) => (
                  <span
                    key={`${spot.x}-${spot.y}`}
                    className={`dossier-position-spot${spot.primary ? ' is-primary' : ''}`}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    title={`${spot.primary ? 'Primary' : 'Secondary'} position: ${spot.sourceLabel}`}
                  >
                    {spot.label}
                  </span>
                ))}
              </div>

              <div className="dossier-role-card">
                <span>PRIMARY ROLE</span>
                <h3>{profile.primary_position || 'Professional footballer'}</h3>
                <p>{profile.headline || [profile.primary_position, profile.current_club].filter(Boolean).join(' · ')}</p>

                <div className="dossier-role-facts">
                  <div><span>Current club</span><strong>{profile.current_club || 'Available through DJM'}</strong></div>
                  <div><span>Additional positions</span><strong>{dossierList(profile.secondary_positions).join(' · ') || '—'}</strong></div>
                  <div><span>Preferred foot</span><strong>{profile.preferred_foot || '—'}</strong></div>
                  <div><span>Status</span><strong>{profile.current_status || 'Contact DJM'}</strong></div>
                </div>

                <div className="dossier-position-key">
                  <span><i className="is-primary" />Primary</span>
                  {positionSpots.some((spot) => !spot.primary) ? <span><i />Secondary</span> : null}
                </div>
              </div>
            </div>
          </section>
        )}

        {!hidden.has(
          'why_review',
        ) && (
          <section className="dossier-section dossier-why-layout">
            <div>
              <div className="dossier-kicker">
                PLAYER OVERVIEW
              </div>

              <div className="dossier-why">
                {profile.why_review ||
                  'Contact DJM Sports Management for the player’s current profile and availability information.'}
              </div>
            </div>

            <aside className="dossier-contact-mini">
              <span>
                REPRESENTATION
              </span>

              <strong>
                DJM Sports
                Management
              </strong>

              <p>
                For availability,
                financial parameters,
                full-match footage or a
                direct conversation.
              </p>

              <a
                href={mailto}
              >
                {email}
                <ArrowRight
                  size={14}
                />
              </a>
            </aside>
          </section>
        )}

        {profile.career_summary &&
          !hidden.has(
            'summary',
          ) && (
            <section className="dossier-section dossier-snapshot">
              <div className="dossier-kicker">
                PLAYER SNAPSHOT
              </div>

              <p>
                {
                  profile.career_summary
                }
              </p>
            </section>
          )}

        {(headlineStats.length >
          0 ||
          performance.rows.length >
            0) &&
          !hidden.has(
            'stats',
          ) && (
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div>
                  <div className="dossier-kicker">
                    PERFORMANCE
                  </div>

                  <h2>
                    Season output.
                  </h2>
                </div>

                <span>
                  {latestCareerSeason
                    ? `Recorded through ${latestCareerSeason}`
                    : 'Reviewed source data'}
                </span>
              </div>

              {headlineStats.length >
                0 && (
                <div className="dossier-stat-grid">
                  {headlineStats.map(
                    (
                      stat,
                      index,
                    ) => (
                      <div
                        className="dossier-stat"
                        key={
                          index
                        }
                      >
                        <strong>
                          {
                            stat.value
                          }
                        </strong>

                        <span>
                          {
                            stat.label
                          }
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}

              {performance.rows
                .length > 0 && (
                <div className="dossier-performance">
                  <div className="dossier-performance-labels">
                    <span>
                      RECENT SEASONS
                    </span>

                    <span>
                      {performance.metric ===
                      'minutes'
                        ? 'MINUTES'
                        : 'APPEARANCES'}
                    </span>
                  </div>

                  <p className="dossier-chart-note">
                    Bar length compares only the seasons shown. The value at
                    right is the exact recorded total; unknown values are not
                    treated as zero.
                  </p>

                  {performance.rows.map(
                    (
                      row: any,
                      index: number,
                    ) => (
                      <div
                        className="dossier-performance-row"
                        key={
                          index
                        }
                      >
                        <div className="dossier-performance-meta">
                          <strong>
                            {row.season_label ||
                              row.season ||
                              row.start_date?.slice(
                                0,
                                4,
                              ) ||
                              'Season'}
                          </strong>

                          <span>
                            {[
                              row.club_name ||
                                row.club,
                              row.league,
                            ]
                              .filter(
                                Boolean,
                              )
                              .join(
                                ' · ',
                              )}
                          </span>
                        </div>

                        <div className="dossier-performance-bar-wrap">
                          <div className="dossier-performance-bar">
                            <span
                              style={{
                                width:
                                  `${row.visualPercentage}%`,
                              }}
                            />
                          </div>

                          <small>
                            {[
                              row.goals !=
                              null
                                ? `${row.goals}G`
                                : null,

                              row.assists !=
                              null
                                ? `${row.assists}A`
                                : null,
                            ]
                              .filter(
                                Boolean,
                              )
                              .join(
                                ' · ',
                              )}
                          </small>
                        </div>

                        <strong className="dossier-performance-value">
                          {
                            row.visualLabel
                          }
                        </strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          )}

        {notable.length > 0 &&
          !hidden.has(
            'experience',
          ) && (
            <section className="dossier-section">
              <div className="dossier-kicker">
                SELECTED EXPERIENCE
              </div>

              <div className="dossier-notable-grid">
                {notable
                  .slice(
                    0,
                    6,
                  )
                  .map(
                    (
                      item: any,
                      index: number,
                    ) => (
                      <div
                        key={
                          index
                        }
                      >
                        <span>
                          0
                          {index +
                            1}
                        </span>

                        <strong>
                          {typeof item ===
                          'string'
                            ? item
                            : item.label ||
                              item.title ||
                              item.value}
                        </strong>
                      </div>
                    ),
                  )}
              </div>
            </section>
          )}

        {career.length > 0 &&
          !hidden.has(
            'career',
          ) && (
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div>
                  <div className="dossier-kicker">
                    CAREER RECORD
                  </div>

                  <h2>
                    Season by season.
                  </h2>
                </div>
              </div>

              <div className="dossier-career">
                <div className="dossier-career-header">
                  <span>
                    Season
                  </span>

                  <span>
                    Club /
                    competition
                  </span>

                  <span>
                    Record
                  </span>
                </div>

                {career.map(
                  (
                    row: any,
                    index: number,
                  ) => (
                    <div
                      className="dossier-career-row"
                      key={
                        index
                      }
                    >
                      <div className="dossier-career-season">
                        {row.season_label ||
                          row.season ||
                          row.start_date?.slice(
                            0,
                            4,
                          ) ||
                          '—'}
                      </div>

                      <div className="dossier-career-club">
                        <strong>
                          {row.club_name ||
                            row.club ||
                            '—'}
                        </strong>

                        <span>
                          {[
                            row.league,
                            row.country,
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' · ',
                            )}
                        </span>

                        {row.source_name && (
                          <small>
                            {row.source_url ? (
                              <a
                                href={
                                  row.source_url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                Source:{' '}
                                {
                                  row.source_name
                                }
                                <ExternalLink
                                  size={
                                    10
                                  }
                                />
                              </a>
                            ) : (
                              <>
                                Source:{' '}
                                {
                                  row.source_name
                                }
                              </>
                            )}
                          </small>
                        )}
                      </div>

                      <div className="dossier-career-stats">
                        {
                          dossierCareerStatLine(
                            row,
                          )
                        }
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

        {videos.length > 0 &&
          !hidden.has(
            'videos',
          ) && (
            <section className="dossier-section no-print">
              <div className="dossier-kicker">
                FOOTAGE
              </div>

              <h2 className="dossier-video-title">
                See the player.
              </h2>

              <div className="dossier-video-grid">
                {videos
                  .slice(
                    0,
                    4,
                  )
                  .map(
                    (
                      video: any,
                      index: number,
                    ) => (
                      <a
                        href={
                          video.url
                        }
                        target="_blank"
                        rel="noreferrer"
                        className={`dossier-video-card ${
                          index ===
                          0
                            ? 'is-primary'
                            : ''
                        }`}
                        key={
                          index
                        }
                      >
                        <span className="dossier-video-icon">
                          <Play
                            size={
                              18
                            }
                          />
                        </span>

                        <div>
                          <strong>
                            {video.title ||
                              'Player footage'}
                          </strong>

                          <span>
                            Watch video
                          </span>
                        </div>

                        <ExternalLink
                          size={
                            16
                          }
                        />
                      </a>
                    ),
                  )}
              </div>
            </section>
          )}

        {documents.length > 0 &&
          shareToken && (
            <section className="dossier-section no-print">
              <div className="dossier-kicker">
                APPROVED MATERIAL
              </div>

              <div className="dossier-material-grid">
                {documents.map(
                  (
                    document: any,
                  ) => (
                    <button
                      type="button"
                      onClick={() =>
                        openDoc(
                          document,
                        )
                      }
                      key={
                        document.id
                      }
                    >
                      <FileText
                        size={
                          18
                        }
                      />

                      <div>
                        <strong>
                          {
                            document.title
                          }
                        </strong>

                        <span>
                          Secure DJM
                          document
                        </span>
                      </div>

                      <ExternalLink
                        size={
                          15
                        }
                      />
                    </button>
                  ),
                )}
              </div>
            </section>
          )}

        {sources.length > 0 && (
          <section className="dossier-section dossier-sources">
            <div className="dossier-kicker">
              PLAYER SOURCES
            </div>

            <div>
              {sources.map(
                (source) => (
                  <a
                    key={
                      source.label
                    }
                    href={
                      source.url
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {
                      source.label
                    }

                    <ExternalLink
                      size={
                        12
                      }
                    />
                  </a>
                ),
              )}
            </div>
          </section>
        )}
      </div>

      <section className="dossier-contact">
        <div className="dossier-container dossier-contact-inner">
          <div>
            <div className="dossier-contact-kicker">
              DJM SPORTS MANAGEMENT
            </div>

            <h2>
              Discuss{' '}
              {
                profile.display_name
              }
              .
            </h2>

            <p>
              For current availability,
              contractual information,
              financial parameters,
              full-match footage or a
              direct player discussion,
              speak with DJM.
            </p>
          </div>

          <a
            className="dossier-contact-button"
            href={mailto}
          >
            <Mail
              size={17}
            />

            Contact DJM
          </a>
        </div>
      </section>

      <footer className="dossier-footer">
        <div className="dossier-container">
          <strong>
            DJM SPORTS MANAGEMENT
          </strong>

          <span>
            {verified
              ? `Player information reviewed ${verified}`
              : 'Professional player dossier prepared by DJM Sports Management'}
          </span>
        </div>
      </footer>
    </main>
  );
}
