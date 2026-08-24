'use client';

import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';

type ClubCvDownloadArgs = {
  profile: any;
  photoUrl?: string | null;
  logoUrl?: string | null;
  filename?: string;
};

const NAVY = '#061f3a';
const NAVY_2 = '#0a3157';
const YELLOW = '#f5e900';
const INK = '#111318';
const MUTED = '#66717c';
const LINE = '#e3e7eb';
const SOFT = '#f4f6f8';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  page: {
    backgroundColor: WHITE,
    color: INK,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
  },

  hero: {
    height: 216,
    backgroundColor: NAVY,
    paddingTop: 28,
    paddingHorizontal: 34,
    paddingBottom: 24,
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 34,
    height: 34,
    objectFit: 'contain',
    marginRight: 10,
  },

  brandFallback: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: YELLOW,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandFallbackText: {
    color: NAVY,
    fontSize: 10,
    fontWeight: 700,
  },

  brandName: {
    color: WHITE,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.3,
  },

  verified: {
    color: '#bdc8d2',
    fontSize: 7.8,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },

  heroMain: {
    flexDirection: 'row',
    marginTop: 26,
  },

  heroCopy: {
    flex: 1,
    paddingRight: 22,
  },

  yellowLine: {
    width: 34,
    height: 4,
    backgroundColor: YELLOW,
    marginBottom: 12,
  },

  playerName: {
    color: WHITE,
    fontSize: 31,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: -1.2,
  },

  headline: {
    color: '#d6dee5',
    marginTop: 9,
    fontSize: 11,
    lineHeight: 1.35,
  },

  club: {
    color: WHITE,
    marginTop: 9,
    fontSize: 10,
    fontWeight: 700,
  },

  marketValue: {
    alignSelf: 'flex-start',
    marginTop: 11,
    backgroundColor: NAVY_2,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },

  marketValueText: {
    color: WHITE,
    fontSize: 8,
  },

  photo: {
    width: 118,
    height: 138,
    borderRadius: 12,
    objectFit: 'cover',
    backgroundColor: NAVY_2,
  },

  photoFallback: {
    width: 118,
    height: 138,
    borderRadius: 12,
    backgroundColor: NAVY_2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoInitial: {
    color: WHITE,
    fontSize: 40,
    fontWeight: 700,
  },

  body: {
    paddingHorizontal: 34,
    paddingTop: 22,
    paddingBottom: 26,
  },

  facts: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    marginBottom: 20,
  },

  fact: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: LINE,
  },

  factLast: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  factLabel: {
    color: MUTED,
    fontSize: 6.8,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  factValue: {
    color: INK,
    marginTop: 4,
    fontSize: 9.5,
    fontWeight: 700,
  },

  section: {
    marginTop: 16,
  },

  kicker: {
    color: MUTED,
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 7,
  },

  sectionTitle: {
    color: NAVY,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 7,
  },

  whyBox: {
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 14,
  },

  whyText: {
    color: WHITE,
    fontSize: 12.5,
    lineHeight: 1.4,
    fontWeight: 700,
  },

  summary: {
    color: '#343b43',
    fontSize: 9.5,
    lineHeight: 1.55,
  },

  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },

  stat: {
    width: '33.333%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },

  statInner: {
    backgroundColor: SOFT,
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 11,
  },

  statValue: {
    color: NAVY,
    fontSize: 18,
    fontWeight: 700,
  },

  statLabel: {
    color: MUTED,
    marginTop: 3,
    fontSize: 7.5,
    fontWeight: 700,
  },

  experienceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },

  experience: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 7,
  },

  experienceInner: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },

  experienceText: {
    fontSize: 8.5,
    lineHeight: 1.35,
  },

  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },

  source: {
    color: NAVY,
    fontSize: 7.8,
    textDecoration: 'none',
    marginRight: 14,
    marginBottom: 5,
  },

  contact: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  contactTitle: {
    color: NAVY,
    fontSize: 9,
    fontWeight: 700,
  },

  contactCopy: {
    color: MUTED,
    marginTop: 3,
    fontSize: 7.5,
  },

  contactEmail: {
    color: NAVY,
    fontSize: 8.5,
    fontWeight: 700,
    textDecoration: 'none',
  },

  page2Header: {
    backgroundColor: NAVY,
    paddingHorizontal: 34,
    paddingTop: 26,
    paddingBottom: 22,
  },

  page2Name: {
    color: WHITE,
    fontSize: 23,
    fontWeight: 700,
  },

  page2Sub: {
    color: '#bfcad3',
    fontSize: 8.5,
    marginTop: 5,
  },

  careerList: {
    marginTop: 4,
  },

  careerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 10,
  },

  careerSeason: {
    width: 68,
    color: NAVY,
    fontSize: 8,
    fontWeight: 700,
  },

  careerClub: {
    width: 155,
    paddingRight: 10,
  },

  careerClubName: {
    color: INK,
    fontSize: 9,
    fontWeight: 700,
  },

  careerMeta: {
    color: MUTED,
    marginTop: 3,
    fontSize: 7.2,
  },

  careerStats: {
    flex: 1,
    color: '#3e4750',
    fontSize: 7.8,
    lineHeight: 1.45,
  },

  videoRow: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    padding: 10,
    marginBottom: 7,
  },

  videoTitle: {
    color: NAVY,
    fontSize: 8.8,
    fontWeight: 700,
  },

  videoLink: {
    color: MUTED,
    fontSize: 7.2,
    marginTop: 3,
    textDecoration: 'none',
  },

  footer: {
    position: 'absolute',
    left: 34,
    right: 34,
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 7,
  },

  footerText: {
    color: '#87919a',
    fontSize: 6.8,
  },
});

const text = (
  value: any,
  fallback = '—'
) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }

  return String(value);
};

const clip = (
  value: any,
  max: number
) => {
  const s = text(value, '');

  if (s.length <= max) {
    return s;
  }

  return `${s.slice(0, max - 1).trim()}…`;
};

const arr = (value: any) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : [];

const nationalityText = (value: any) => {
  const values = arr(value);

  if (values.length) {
    return values.join(' / ');
  }

  return text(value);
};

const verificationDate = (
  value: any
) => {
  if (!value) {
    return 'DJM CLUB CV';
  }

  try {
    return `DJM VERIFIED · ${new Intl.DateTimeFormat(
      'en-GB',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    )
      .format(new Date(value))
      .toUpperCase()}`;
  } catch {
    return 'DJM VERIFIED';
  }
};

const careerStats = (row: any) => {
  const items = [
    row.appearances !== null &&
    row.appearances !== undefined
      ? `${row.appearances} apps`
      : null,

    row.starts !== null &&
    row.starts !== undefined
      ? `${row.starts} starts`
      : null,

    row.minutes !== null &&
    row.minutes !== undefined
      ? `${Number(
          row.minutes
        ).toLocaleString('en-GB')} mins`
      : null,

    row.goals !== null &&
    row.goals !== undefined
      ? `${row.goals} goals`
      : null,

    row.assists !== null &&
    row.assists !== undefined
      ? `${row.assists} assists`
      : null,
  ].filter(Boolean);

  return items.length
    ? items.join(' · ')
    : 'Sporting record';
};

const hidden = (
  profile: any,
  section: string
) =>
  arr(profile?.hidden_sections).includes(
    section
  );

export function ClubCvPdfDocument({
  profile,
  photoUrl,
  logoUrl,
}: {
  profile: any;
  photoUrl?: string | null;
  logoUrl?: string | null;
}) {
  const keyStats = arr(
    profile?.key_stats
  ).slice(0, 6);

  const experience = arr(
    profile?.notable_experience
  ).slice(0, 6);

  const career = arr(
    profile?.career_timeline
  ).slice(0, 14);

  const videos = arr(
    profile?.selected_videos
  )
    .filter((v: any) => v?.url)
    .slice(0, 4);

  const sources = [
    profile?.transfermarkt_url && {
      label: 'Transfermarkt',
      url: profile.transfermarkt_url,
    },

    profile?.wyscout_url && {
      label: 'Wyscout',
      url: profile.wyscout_url,
    },

    profile?.stats_url && {
      label: 'Statistics',
      url: profile.stats_url,
    },
  ].filter(Boolean) as {
    label: string;
    url: string;
  }[];

  const facts = [
    [
      'Position',
      profile?.primary_position,
    ],
    [
      'Age',
      profile?.age_display,
    ],
    [
      'Height',
      profile?.height_display,
    ],
    [
      'Foot',
      profile?.preferred_foot,
    ],
    [
      'Nationality',
      nationalityText(
        profile?.nationalities
      ),
    ],
  ];

  const showSecondPage =
    (!hidden(profile, 'career') &&
      career.length > 0) ||
    (!hidden(profile, 'videos') &&
      videos.length > 0);

  const displayName =
    profile?.display_name ||
    'DJM Player';

  return (
    <Document
      title={`${displayName} - DJM Club CV`}
      author="DJM Sports Management"
      subject="Professional football player profile"
      creator="DJM Player"
    >
      <Page
        size="A4"
        style={styles.page}
      >
        <View
          style={styles.hero}
          wrap={false}
        >
          <View style={styles.heroTop}>
            <View style={styles.brand}>
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  style={styles.logo}
                />
              ) : (
                <View
                  style={
                    styles.brandFallback
                  }
                >
                  <Text
                    style={
                      styles.brandFallbackText
                    }
                  >
                    DJM
                  </Text>
                </View>
              )}

              <Text style={styles.brandName}>
                DJM SPORTS MANAGEMENT
              </Text>
            </View>

            <Text style={styles.verified}>
              {verificationDate(
                profile?.verified_at
              )}
            </Text>
          </View>

          <View style={styles.heroMain}>
            <View style={styles.heroCopy}>
              <View
                style={styles.yellowLine}
              />

              <Text
                style={styles.playerName}
              >
                {clip(displayName, 48)}
              </Text>

              <Text style={styles.headline}>
                {clip(
                  profile?.headline ||
                    'Professional footballer represented by DJM Sports Management',
                  170
                )}
              </Text>

              {profile?.current_club ? (
                <Text style={styles.club}>
                  {clip(
                    profile.current_club,
                    70
                  )}
                </Text>
              ) : null}

              {!profile?.hide_market_value &&
              profile?.market_value_display ? (
                <View
                  style={
                    styles.marketValue
                  }
                >
                  <Text
                    style={
                      styles.marketValueText
                    }
                  >
                    Market value ·{' '}
                    {profile.market_value_display}
                  </Text>
                </View>
              ) : null}
            </View>

            {photoUrl ? (
              <Image
                src={photoUrl}
                style={styles.photo}
              />
            ) : (
              <View
                style={
                  styles.photoFallback
                }
              >
                <Text
                  style={
                    styles.photoInitial
                  }
                >
                  {displayName
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.body}>
          <View
            style={styles.facts}
            wrap={false}
          >
            {facts.map(
              ([label, value], index) => (
                <View
                  key={label}
                  style={
                    index ===
                    facts.length - 1
                      ? styles.factLast
                      : styles.fact
                  }
                >
                  <Text
                    style={
                      styles.factLabel
                    }
                  >
                    {label}
                  </Text>

                  <Text
                    style={
                      styles.factValue
                    }
                  >
                    {clip(value, 35)}
                  </Text>
                </View>
              )
            )}
          </View>

          {!hidden(
            profile,
            'why_review'
          ) ? (
            <View
              style={styles.section}
              wrap={false}
            >
              <Text style={styles.kicker}>
                WHY REVIEW THIS PLAYER
              </Text>

              <View style={styles.whyBox}>
                <Text
                  style={styles.whyText}
                >
                  {clip(
                    profile?.why_review ||
                      'DJM Sports Management can provide further sporting and availability information on request.',
                    430
                  )}
                </Text>
              </View>
            </View>
          ) : null}

          {!hidden(profile, 'summary') &&
          profile?.career_summary ? (
            <View
              style={styles.section}
              wrap={false}
            >
              <Text style={styles.kicker}>
                PLAYER SNAPSHOT
              </Text>

              <Text
                style={styles.summary}
              >
                {clip(
                  profile.career_summary,
                  560
                )}
              </Text>
            </View>
          ) : null}

          {!hidden(profile, 'stats') &&
          keyStats.length > 0 ? (
            <View
              style={styles.section}
              wrap={false}
            >
              <Text style={styles.kicker}>
                KEY NUMBERS
              </Text>

              <View style={styles.stats}>
                {keyStats.map(
                  (item: any, index) => (
                    <View
                      key={index}
                      style={styles.stat}
                    >
                      <View
                        style={
                          styles.statInner
                        }
                      >
                        <Text
                          style={
                            styles.statValue
                          }
                        >
                          {clip(
                            item?.value ??
                              item?.stat ??
                              '—',
                            18
                          )}
                        </Text>

                        <Text
                          style={
                            styles.statLabel
                          }
                        >
                          {clip(
                            item?.label ??
                              item?.name ??
                              '',
                            38
                          )}
                        </Text>
                      </View>
                    </View>
                  )
                )}
              </View>
            </View>
          ) : null}

          {!hidden(
            profile,
            'experience'
          ) &&
          experience.length > 0 ? (
            <View
              style={styles.section}
              wrap={false}
            >
              <Text style={styles.kicker}>
                NOTABLE EXPERIENCE
              </Text>

              <View
                style={
                  styles.experienceWrap
                }
              >
                {experience.map(
                  (item: any, index) => {
                    const value =
                      typeof item ===
                      'string'
                        ? item
                        : item?.label ||
                          item?.title ||
                          item?.value ||
                          '';

                    return (
                      <View
                        key={index}
                        style={
                          styles.experience
                        }
                      >
                        <View
                          style={
                            styles.experienceInner
                          }
                        >
                          <Text
                            style={
                              styles.experienceText
                            }
                          >
                            {clip(
                              value,
                              110
                            )}
                          </Text>
                        </View>
                      </View>
                    );
                  }
                )}
              </View>
            </View>
          ) : null}

          {sources.length > 0 ? (
            <View style={styles.sourceRow}>
              {sources.map(source => (
                <Link
                  key={source.label}
                  src={source.url}
                  style={styles.source}
                >
                  {source.label} ↗
                </Link>
              ))}

              {profile?.primary_video_url ? (
                <Link
                  src={
                    profile.primary_video_url
                  }
                  style={styles.source}
                >
                  Watch player ↗
                </Link>
              ) : null}
            </View>
          ) : null}

          <View
            style={styles.contact}
            wrap={false}
          >
            <View>
              <Text
                style={
                  styles.contactTitle
                }
              >
                DJM SPORTS MANAGEMENT
              </Text>

              <Text
                style={
                  styles.contactCopy
                }
              >
                Verified availability,
                contractual information and
                club discussions.
              </Text>
            </View>

            <Link
              src={`mailto:${
                profile?.contact_email ||
                'jesse.edge@djmsports.com'
              }`}
              style={styles.contactEmail}
            >
              {profile?.contact_email ||
                'jesse.edge@djmsports.com'}
            </Link>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            DJM SPORTS MANAGEMENT ·
            PRIVATE RECRUITMENT MATERIAL
          </Text>

          <Text style={styles.footerText}>
            Prepared through DJM Player
          </Text>
        </View>
      </Page>

      {showSecondPage ? (
        <Page
          size="A4"
          style={styles.page}
        >
          <View
            style={styles.page2Header}
          >
            <Text
              style={styles.page2Name}
            >
              {clip(displayName, 55)}
            </Text>

            <Text
              style={styles.page2Sub}
            >
              Career record & recruitment
              material · DJM Sports Management
            </Text>
          </View>

          <View style={styles.body}>
            {!hidden(
              profile,
              'career'
            ) &&
            career.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={styles.kicker}
                >
                  CAREER RECORD
                </Text>

                <View
                  style={
                    styles.careerList
                  }
                >
                  {career.map(
                    (
                      row: any,
                      index
                    ) => (
                      <View
                        key={index}
                        style={
                          styles.careerRow
                        }
                        wrap={false}
                      >
                        <Text
                          style={
                            styles.careerSeason
                          }
                        >
                          {clip(
                            row?.season_label ||
                              row?.season ||
                              row?.start_date?.slice?.(
                                0,
                                4
                              ) ||
                              '—',
                            18
                          )}
                        </Text>

                        <View
                          style={
                            styles.careerClub
                          }
                        >
                          <Text
                            style={
                              styles.careerClubName
                            }
                          >
                            {clip(
                              row?.club_name ||
                                row?.club ||
                                '—',
                              42
                            )}
                          </Text>

                          <Text
                            style={
                              styles.careerMeta
                            }
                          >
                            {clip(
                              [
                                row?.league,
                                row?.country,
                              ]
                                .filter(
                                  Boolean
                                )
                                .join(' · '),
                              60
                            )}
                          </Text>
                        </View>

                        <Text
                          style={
                            styles.careerStats
                          }
                        >
                          {careerStats(row)}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </View>
            ) : null}

            {!hidden(
              profile,
              'videos'
            ) &&
            videos.length > 0 ? (
              <View
                style={styles.section}
              >
                <Text
                  style={styles.kicker}
                >
                  SELECTED VIDEO
                </Text>

                {videos.map(
                  (
                    video: any,
                    index
                  ) => (
                    <View
                      key={index}
                      style={
                        styles.videoRow
                      }
                      wrap={false}
                    >
                      <Text
                        style={
                          styles.videoTitle
                        }
                      >
                        {clip(
                          video?.title ||
                            'Player video',
                          70
                        )}
                      </Text>

                      <Link
                        src={video.url}
                        style={
                          styles.videoLink
                        }
                      >
                        Watch footage ↗
                      </Link>
                    </View>
                  )
                )}
              </View>
            ) : null}

            {sources.length > 0 ? (
              <View
                style={styles.section}
              >
                <Text
                  style={styles.kicker}
                >
                  VERIFICATION SOURCES
                </Text>

                {sources.map(source => (
                  <Link
                    key={source.label}
                    src={source.url}
                    style={{
                      ...styles.source,
                      marginBottom: 8,
                    }}
                  >
                    {source.label} ↗
                  </Link>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Text
              style={styles.footerText}
            >
              DJM SPORTS MANAGEMENT
            </Text>

            <Text
              style={styles.footerText}
            >
              {verificationDate(
                profile?.verified_at
              )}
            </Text>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export async function downloadClubCv({
  profile,
  photoUrl,
  logoUrl,
  filename,
}: ClubCvDownloadArgs) {
  if (!profile) {
    throw new Error(
      'No club profile available'
    );
  }

  const blob = await pdf(
    <ClubCvPdfDocument
      profile={profile}
      photoUrl={photoUrl}
      logoUrl={logoUrl}
    />
  ).toBlob();

  const objectUrl =
    URL.createObjectURL(blob);

  const safeName = (
    filename ||
    `${
      profile.display_name ||
      'DJM-Player'
    }-DJM-CV.pdf`
  )
    .replace(
      /[^a-zA-Z0-9._ -]+/g,
      ''
    )
    .replace(/\s+/g, '-');

  const anchor =
    document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = safeName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1500);
}
