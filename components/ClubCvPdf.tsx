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

type DownloadArgs = {
  profile: any;
  photoUrl?: string | null;
  logoUrl?: string | null;
  filename?: string;
};

const NAVY = '#061f3a';
const NAVY_LIGHT = '#0a3157';
const YELLOW = '#f5e900';
const WHITE = '#ffffff';
const INK = '#15181c';
const MUTED = '#707780';
const LIGHT = '#f4f5f7';
const LINE = '#e4e7ea';

const clip = (
  value: any,
  max: number,
) => {
  const text =
    String(value || '').trim();

  if (
    text.length <= max
  ) {
    return text;
  }

  return `${text
    .slice(0, max - 1)
    .trim()}…`;
};

const hidden = (
  profile: any,
  key: string,
) =>
  dossierList(
    profile?.hidden_sections,
  ).includes(key);

const styles =
  StyleSheet.create({
    page: {
      backgroundColor: WHITE,
      color: INK,
      fontFamily: 'Helvetica',
      fontSize: 9.5,
    },

    /* PAGE ONE */

    hero: {
      height: 250,
      backgroundColor: NAVY,
      paddingTop: 27,
      paddingHorizontal: 34,
      paddingBottom: 27,
    },

    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    brand: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    logo: {
      width: 35,
      height: 35,
      objectFit: 'contain',
      marginRight: 10,
    },

    logoFallback: {
      width: 35,
      height: 35,
      borderRadius: 8,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 10,
    },

    logoFallbackText: {
      color: NAVY,
      fontSize: 9,
      fontWeight: 700,
    },

    brandName: {
      color: WHITE,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.25,
    },

    heroVerified: {
      color: '#b8c4cf',
      fontSize: 7.3,
      letterSpacing: .65,
    },

    heroMain: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flex: 1,
      paddingTop: 24,
    },

    heroCopy: {
      flex: 1,
      paddingRight: 24,
    },

    yellowLine: {
      width: 46,
      height: 3,
      borderRadius: 2,
      backgroundColor: YELLOW,
      marginBottom: 12,
    },

    kickerDark: {
      color: '#8fa1b1',
      fontSize: 6.8,
      fontWeight: 700,
      letterSpacing: 1,
    },

    playerName: {
      color: WHITE,
      marginTop: 8,
      fontSize: 34,
      lineHeight: .95,
      fontWeight: 700,
      letterSpacing: -1.4,
    },

    position: {
      color: WHITE,
      marginTop: 10,
      fontSize: 11,
      fontWeight: 700,
    },

    headline: {
      color: '#cbd4dc',
      marginTop: 8,
      maxWidth: 315,
      fontSize: 9.4,
      lineHeight: 1.4,
    },

    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 11,
    },

    statusPill: {
      marginRight: 6,
      marginBottom: 4,
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 7,
      backgroundColor:
        NAVY_LIGHT,
    },

    statusText: {
      color: '#e8edf1',
      fontSize: 6.8,
    },

    heroSourceLink: {
  color: YELLOW,

  marginTop: 8,

  fontSize: 7.2,

  fontWeight: 700,

  letterSpacing: .35,

  textDecoration: 'none',
},
    
    photo: {
      width: 145,
      height: 174,
      borderRadius: 16,
      objectFit: 'cover',
      backgroundColor:
        NAVY_LIGHT,
    },

    photoFallback: {
      width: 145,
      height: 174,
      borderRadius: 16,
      backgroundColor:
        NAVY_LIGHT,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    photoInitial: {
      color: WHITE,
      fontSize: 47,
      fontWeight: 700,
    },

    body: {
      paddingHorizontal: 34,
      paddingTop: 22,
      paddingBottom: 28,
    },

    facts: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: LINE,
      paddingBottom: 17,
    },

    fact: {
      flex: 1,
      paddingRight: 10,
    },

    factLabel: {
      color: MUTED,
      fontSize: 6.7,
      fontWeight: 700,
      letterSpacing: .55,
    },

    factValue: {
      color: NAVY,
      marginTop: 4,
      fontSize: 10,
      fontWeight: 700,
    },

    section: {
      marginTop: 21,
    },

    kicker: {
      color: MUTED,
      fontSize: 6.8,
      fontWeight: 700,
      letterSpacing: .95,
      marginBottom: 7,
    },

    why: {
      color: NAVY,
      maxWidth: 510,
      fontSize: 15.5,
      lineHeight: 1.34,
      fontWeight: 700,
      letterSpacing: -.25,
    },

    playerProfile: {
      flexDirection: 'row',
      marginTop: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: LINE,
      borderRadius: 12,
      backgroundColor: '#f7f9fa',
    },

    playerProfileCopy: {
      flex: 1,
      paddingRight: 20,
      justifyContent: 'center',
    },

    roleTitle: {
      marginTop: 5,
      color: NAVY,
      fontSize: 19,
      fontWeight: 700,
      letterSpacing: -.35,
    },

    roleMeta: {
      marginTop: 5,
      color: MUTED,
      fontSize: 7.2,
      lineHeight: 1.4,
    },

    playerOverview: {
      marginTop: 12,
      color: '#354553',
      fontSize: 9.2,
      lineHeight: 1.48,
    },

    pitch: {
      position: 'relative',
      width: 104,
      height: 160,
      overflow: 'hidden',
      borderWidth: 1.2,
      borderColor: '#d8e3e3',
      borderRadius: 5,
      backgroundColor: '#0b4650',
    },

    pitchHalf: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 79.5,
      height: .7,
      backgroundColor: '#b8cdcf',
    },

    pitchCircle: {
      position: 'absolute',
      left: 39,
      top: 64,
      width: 26,
      height: 32,
      borderWidth: .7,
      borderColor: '#b8cdcf',
      borderRadius: 13,
    },

    pitchBoxTop: {
      position: 'absolute',
      left: 27,
      top: 0,
      width: 50,
      height: 23,
      borderLeftWidth: .7,
      borderRightWidth: .7,
      borderBottomWidth: .7,
      borderColor: '#b8cdcf',
    },

    pitchBoxBottom: {
      position: 'absolute',
      left: 27,
      bottom: 0,
      width: 50,
      height: 23,
      borderLeftWidth: .7,
      borderRightWidth: .7,
      borderTopWidth: .7,
      borderColor: '#b8cdcf',
    },

    pitchSpot: {
      position: 'absolute',
      width: 19,
      height: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: WHITE,
      borderRadius: 10,
      backgroundColor: WHITE,
    },

    pitchSpotPrimary: {
      borderColor: YELLOW,
      backgroundColor: YELLOW,
    },

    pitchSpotText: {
      color: NAVY,
      fontSize: 5.5,
      fontWeight: 700,
    },

    statBand: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: LINE,
      paddingVertical: 12,
    },

    stat: {
      flex: 1,
      paddingHorizontal: 8,
      borderRightWidth: 1,
      borderRightColor: LINE,
    },

    statFirst: {
      flex: 1,
      paddingRight: 8,
      borderRightWidth: 1,
      borderRightColor: LINE,
    },

    statLast: {
      flex: 1,
      paddingLeft: 8,
    },

    statValue: {
      color: NAVY,
      fontSize: 20,
      lineHeight: 1,
      fontWeight: 700,
    },

    statLabel: {
      color: MUTED,
      marginTop: 4,
      fontSize: 6.8,
      fontWeight: 700,
    },

    performanceWrap: {
      marginTop: 12,
      padding: 12,
      borderRadius: 10,
      backgroundColor: LIGHT,
    },

    performanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 34,
      borderTopWidth: 1,
      borderTopColor: LINE,
    },

    performanceRowFirst: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 34,
    },

    performanceMeta: {
      width: 125,
      paddingRight: 10,
    },

    performanceSeason: {
      color: NAVY,
      fontSize: 7.5,
      fontWeight: 700,
    },

    performanceClub: {
      color: MUTED,
      marginTop: 2,
      fontSize: 6.5,
    },

    barArea: {
      flex: 1,
      paddingRight: 12,
    },

    bar: {
      height: 6,
      overflow: 'hidden',
      borderRadius: 4,
      backgroundColor:
        '#dce1e5',
    },

    barFill: {
      height: 6,
      borderRadius: 4,
      backgroundColor: NAVY,
    },

    performanceValue: {
      width: 66,
      color: NAVY,
      fontSize: 7.5,
      fontWeight: 700,
      textAlign: 'right',
    },

    summary: {
      color: '#454b52',
      fontSize: 8.6,
      lineHeight: 1.5,
    },

    /* PAGE TWO */

    pageTwoHeader: {
      height: 92,
      backgroundColor: NAVY,
      paddingHorizontal: 34,
      paddingTop: 25,
      paddingBottom: 21,
    },

    pageTwoTop: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'flex-start',
    },

    pageTwoName: {
      color: WHITE,
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: -.7,
    },

    pageTwoMeta: {
      color: '#bdc8d1',
      marginTop: 5,
      fontSize: 8,
    },

    pageTwoBody: {
      paddingHorizontal: 34,
      paddingTop: 24,
      paddingBottom: 42,
    },

    pageTitle: {
      color: NAVY,
      fontSize: 17,
      fontWeight: 700,
      marginBottom: 12,
    },

    careerHeader: {
      flexDirection: 'row',
      paddingBottom: 7,
      borderBottomWidth: 1,
      borderBottomColor:
        '#cfd4d9',
    },

    careerHeaderSeason: {
      width: 65,
      color: MUTED,
      fontSize: 6.3,
      fontWeight: 700,
      letterSpacing: .5,
    },

    careerHeaderClub: {
      width: 175,
      color: MUTED,
      fontSize: 6.3,
      fontWeight: 700,
      letterSpacing: .5,
    },

    careerHeaderStats: {
      flex: 1,
      color: MUTED,
      fontSize: 6.3,
      fontWeight: 700,
      letterSpacing: .5,
    },

    careerRow: {
      flexDirection: 'row',
      minHeight: 43,
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: LINE,
    },

    careerSeason: {
      width: 65,
      color: NAVY,
      fontSize: 7.8,
      fontWeight: 700,
      paddingRight: 8,
    },

    careerClub: {
      width: 175,
      paddingRight: 12,
    },

    careerClubName: {
      color: INK,
      fontSize: 8.2,
      fontWeight: 700,
    },

    careerClubMeta: {
      color: MUTED,
      marginTop: 3,
      fontSize: 6.4,
    },

    careerSource: {
      color: '#7d858d',
      marginTop: 3,
      fontSize: 5.9,
    },

    careerStats: {
      flex: 1,
      color: '#444b52',
      fontSize: 7.2,
      lineHeight: 1.45,
    },

    pageTwoColumns: {
      flexDirection: 'row',
      marginTop: 20,
    },

    column: {
      flex: 1,
    },

    columnLeft: {
      flex: 1,
      paddingRight: 16,
    },

    miniTitle: {
      color: NAVY,
      fontSize: 10,
      fontWeight: 700,
      marginBottom: 8,
    },

    notableItem: {
      flexDirection: 'row',
      marginBottom: 7,
    },

    notableNumber: {
      width: 22,
      color: '#9a9fa5',
      fontSize: 6.5,
      fontWeight: 700,
    },

    notableText: {
      flex: 1,
      color: '#3f454b',
      fontSize: 7.5,
      lineHeight: 1.4,
    },

    video: {
      marginBottom: 7,
      borderWidth: 1,
      borderColor: LINE,
      borderRadius: 7,
      padding: 8,
    },

    videoTitle: {
      color: NAVY,
      fontSize: 7.8,
      fontWeight: 700,
    },

    videoLink: {
      color: MUTED,
      marginTop: 3,
      fontSize: 6.2,
      textDecoration: 'none',
    },

    sourceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 14,
    },

    sourceLink: {
      color: NAVY,
      marginRight: 13,
      marginBottom: 5,
      fontSize: 7,
      fontWeight: 700,
      textDecoration: 'none',
    },

    contact: {
      marginTop: 20,
      borderRadius: 10,
      padding: 16,
      backgroundColor: NAVY,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
    },

    contactKicker: {
      color: '#93a4b4',
      fontSize: 6.4,
      fontWeight: 700,
      letterSpacing: .7,
    },

    contactTitle: {
      color: WHITE,
      marginTop: 5,
      fontSize: 13,
      fontWeight: 700,
    },

    contactCopy: {
      color: '#c0cad3',
      marginTop: 4,
      maxWidth: 320,
      fontSize: 7,
      lineHeight: 1.4,
    },

    contactEmail: {
      color: NAVY,
      backgroundColor: YELLOW,
      borderRadius: 12,
      paddingVertical: 7,
      paddingHorizontal: 10,
      fontSize: 7.2,
      fontWeight: 700,
      textDecoration: 'none',
    },

    footer: {
      position: 'absolute',
      left: 34,
      right: 34,
      bottom: 18,
      paddingTop: 7,
      borderTopWidth: 1,
      borderTopColor: LINE,
      flexDirection: 'row',
      justifyContent:
        'space-between',
    },

    footerDark: {
      position: 'absolute',
      left: 34,
      right: 34,
      bottom: 18,
      paddingTop: 7,
      borderTopWidth: 1,
      borderTopColor:
        '#24405b',
      flexDirection: 'row',
      justifyContent:
        'space-between',
    },

    footerText: {
      color: '#8b939b',
      fontSize: 6.2,
    },
  });

export function ClubCvPdfDocument({
  profile,
  photoUrl,
  logoUrl,
}: {
  profile: any;
  photoUrl?: string | null;
  logoUrl?: string | null;
}) {
  const name =
    profile?.display_name ||
    'DJM Player';

  const verified =
    dossierVerifiedDate(
      profile?.verified_at,
    );

  const nationality =
    dossierNationality(
      profile?.nationalities,
    );

  const stats =
    dossierHeadlineStats(
      profile,
      4,
    );

  const performance =
    dossierPerformance(
      profile,
      3,
    );

  const positionSpots =
    dossierPositionMap(
      profile,
    );

  const career =
    dossierCareer(
      profile,
    ).slice(0, 9);

  const notable =
    dossierList(
      profile?.notable_experience,
    ).slice(0, 4);

  const videos =
    dossierList(
      profile?.selected_videos,
    )
      .filter(
        (item: any) =>
          item?.url,
      )
      .slice(0, 3);

  const sources = [
    profile?.transfermarkt_url && {
      label: 'Transfermarkt',
      url:
        profile.transfermarkt_url,
    },

    profile?.wyscout_url && {
      label: 'Wyscout',
      url:
        profile.wyscout_url,
    },

    profile?.stats_url &&
      !sameResearchUrl(
        profile.stats_url,
        profile.transfermarkt_url,
      ) && {
      label: researchSourceLabel(
        profile.stats_url,
      ),
      url:
        profile.stats_url,
    },
  ].filter(Boolean) as {
    label: string;
    url: string;
  }[];

  const facts = [
    [
      'AGE',
      profile?.age_display,
    ],
    [
      'HEIGHT',
      profile?.height_display,
    ],
    [
      'FOOT',
      profile?.preferred_foot,
    ],
    [
      'NATIONALITY',
      nationality !== '—'
        ? nationality
        : null,
    ],
  ].filter(
    ([, value]) =>
      !!value,
  );

  const showPageTwo =
    career.length > 0 ||
    notable.length > 0 ||
    videos.length > 0 ||
    sources.length > 0;

  const email =
    profile?.contact_email ||
    'jesse.edge@djmsports.com';

  return (
    <Document
      title={`${name} - DJM Player Dossier`}
      author="DJM Sports Management"
      subject="Professional player dossier"
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
          <View
            style={
              styles.heroTop
            }
          >
            <View
              style={
                styles.brand
              }
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  style={
                    styles.logo
                  }
                />
              ) : (
                <View
                  style={
                    styles.logoFallback
                  }
                >
                  <Text
                    style={
                      styles.logoFallbackText
                    }
                  >
                    DJM
                  </Text>
                </View>
              )}

              <Text
                style={
                  styles.brandName
                }
              >
                DJM SPORTS MANAGEMENT
              </Text>
            </View>

            <Text
              style={
                styles.heroVerified
              }
            >
              {verified
                ? `DJM REVIEWED · ${verified.toUpperCase()}`
                : 'PLAYER DOSSIER'}
            </Text>
          </View>

          <View
            style={
              styles.heroMain
            }
          >
            <View
              style={
                styles.heroCopy
              }
            >
              <View
                style={
                  styles.yellowLine
                }
              />

              <Text
                style={
                  styles.kickerDark
                }
              >
                DJM PLAYER DOSSIER
              </Text>

              <Text
                style={
                  styles.playerName
                }
              >
                {clip(
                  name,
                  34,
                )}
              </Text>

              <Text
                style={
                  styles.position
                }
              >
                {[
                  profile?.primary_position,
                  profile?.current_club,
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                  'Professional footballer'}
              </Text>

              {profile?.headline && (
                <Text
                  style={
                    styles.headline
                  }
                >
                  {clip(
                    profile.headline,
                    170,
                  )}
                </Text>
              )}

              <View
                style={
                  styles.statusRow
                }
              >
                {profile?.current_status && (
                  <View
                    style={
                      styles.statusPill
                    }
                  >
                    <Text
                      style={
                        styles.statusText
                      }
                    >
                      {clip(
                        profile.current_status,
                        34,
                      )}
                    </Text>
                  </View>
                )}

                {profile?.market_value_display &&
                  profile?.transfermarkt_url &&
                  !profile?.hide_market_value && (
                    <View
                      style={
                        styles.statusPill
                      }
                    >
                      <Text
                        style={
                          styles.statusText
                        }
                      >
                        Market reference{' '}
                        {
                          profile.market_value_display
                        }
                      </Text>
                    </View>
                  )}
              </View>

              {profile?.transfermarkt_url && (
                <Link
                  src={profile.transfermarkt_url}
                  style={styles.heroSourceLink}
                >
                  TRANSFERMARKT PROFILE ↗
                </Link>
              )}
            </View>
            
            {photoUrl ? (
              <Image
                src={photoUrl}
                style={
                  styles.photo
                }
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
                  {name
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={styles.body}
        >
          {facts.length >
            0 && (
            <View
              style={
                styles.facts
              }
            >
              {facts.map(
                (
                  [
                    label,
                    value,
                  ],
                  index,
                ) => (
                  <View
                    key={
                      index
                    }
                    style={
                      styles.fact
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
                      {clip(
                        value,
                        28,
                      )}
                    </Text>
                  </View>
                ),
              )}
            </View>
          )}

          {(positionSpots.length > 0 ||
            !hidden(profile, 'why_review')) && (
            <View style={styles.playerProfile} wrap={false}>
              <View style={styles.playerProfileCopy}>
                <Text style={styles.kicker}>PLAYER PROFILE</Text>
                <Text style={styles.roleTitle}>
                  {clip(profile?.primary_position || 'Professional footballer', 44)}
                </Text>
                <Text style={styles.roleMeta}>
                  {clip(
                    [
                      dossierList(profile?.secondary_positions).length
                        ? `Also: ${dossierList(profile.secondary_positions).join(' · ')}`
                        : null,
                      profile?.preferred_foot ? `${profile.preferred_foot} foot` : null,
                      profile?.current_status,
                    ]
                      .filter(Boolean)
                      .join('  ·  '),
                    120,
                  )}
                </Text>

                {!hidden(profile, 'why_review') ? (
                  <Text style={styles.playerOverview}>
                    {clip(
                      profile?.why_review ||
                        profile?.headline ||
                        'Contact DJM Sports Management for the player profile, current availability and full-match footage.',
                      330,
                    )}
                  </Text>
                ) : null}
              </View>

              {positionSpots.length > 0 ? (
                <View style={styles.pitch}>
                  <View style={styles.pitchHalf} />
                  <View style={styles.pitchCircle} />
                  <View style={styles.pitchBoxTop} />
                  <View style={styles.pitchBoxBottom} />
                  {positionSpots.map((spot) => (
                    <View
                      key={`${spot.x}-${spot.y}`}
                      style={[
                        styles.pitchSpot,
                        spot.primary ? styles.pitchSpotPrimary : {},
                        {
                          left: (spot.x / 100) * 104 - 9.5,
                          top: (spot.y / 100) * 160 - 9.5,
                        },
                      ]}
                    >
                      <Text style={styles.pitchSpotText}>{spot.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}

          {stats.length > 0 &&
            !hidden(
              profile,
              'stats',
            ) && (
              <View
                style={
                  styles.section
                }
                wrap={false}
              >
                <Text
                  style={
                    styles.kicker
                  }
                >
                  PERFORMANCE
                </Text>

                <View
                  style={
                    styles.statBand
                  }
                >
                  {stats.map(
                    (
                      item,
                      index,
                    ) => (
                      <View
                        key={
                          index
                        }
                        style={
                          index ===
                          0
                            ? styles.statFirst
                            : index ===
                                stats.length -
                                  1
                              ? styles.statLast
                              : styles.stat
                        }
                      >
                        <Text
                          style={
                            styles.statValue
                          }
                        >
                          {clip(
                            item.value,
                            12,
                          )}
                        </Text>

                        <Text
                          style={
                            styles.statLabel
                          }
                        >
                          {clip(
                            item.label,
                            22,
                          ).toUpperCase()}
                        </Text>
                      </View>
                    ),
                  )}
                </View>

                {performance.rows
                  .length > 0 && (
                  <View
                    style={
                      styles.performanceWrap
                    }
                  >
                    {performance.rows.map(
                      (
                        row: any,
                        index: number,
                      ) => (
                        <View
                          key={
                            index
                          }
                          style={
                            index ===
                            0
                              ? styles.performanceRowFirst
                              : styles.performanceRow
                          }
                        >
                          <View
                            style={
                              styles.performanceMeta
                            }
                          >
                            <Text
                              style={
                                styles.performanceSeason
                              }
                            >
                              {row.season_label ||
                                row.season ||
                                'Season'}
                            </Text>

                            <Text
                              style={
                                styles.performanceClub
                              }
                            >
                              {clip(
                                [
                                  row.club_name ||
                                    row.club,
                                  row.league,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    ' · ',
                                  ),
                                38,
                              )}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.barArea
                            }
                          >
                            <View
                              style={
                                styles.bar
                              }
                            >
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    width:
                                      `${row.visualPercentage}%`,
                                  },
                                ]}
                              />
                            </View>
                          </View>

                          <Text
                            style={
                              styles.performanceValue
                            }
                          >
                            {
                              row.visualLabel
                            }
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                )}
              </View>
            )}

          {profile?.career_summary &&
            !hidden(
              profile,
              'summary',
            ) && (
              <View
                style={
                  styles.section
                }
                wrap={false}
              >
                <Text
                  style={
                    styles.kicker
                  }
                >
                  PLAYER SNAPSHOT
                </Text>

                <Text
                  style={
                    styles.summary
                  }
                >
                  {clip(
                    profile.career_summary,
                    300,
                  )}
                </Text>
              </View>
            )}
        </View>

        <View
          style={
            styles.footer
          }
          fixed
        >
          <Text
            style={
              styles.footerText
            }
          >
            DJM SPORTS MANAGEMENT
          </Text>

          <Text
            style={
              styles.footerText
            }
          >
            CONFIDENTIAL CLUB PRESENTATION
          </Text>
        </View>
      </Page>

      {showPageTwo && (
        <Page
          size="A4"
          style={styles.page}
        >
          <View
            style={
              styles.pageTwoHeader
            }
          >
            <View
              style={
                styles.pageTwoTop
              }
            >
              <View>
                <Text
                  style={
                    styles.pageTwoName
                  }
                >
                  {clip(
                    name,
                    42,
                  )}
                </Text>

                <Text
                  style={
                    styles.pageTwoMeta
                  }
                >
                  {[
                    profile?.primary_position,
                    profile?.current_club,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>

              <Text
                style={
                  styles.heroVerified
                }
              >
                DJM PLAYER DOSSIER
              </Text>
            </View>
          </View>

          <View
            style={
              styles.pageTwoBody
            }
          >
            {career.length >
              0 &&
              !hidden(
                profile,
                'career',
              ) && (
                <View
                  wrap={false}
                >
                  <Text
                    style={
                      styles.kicker
                    }
                  >
                    CAREER RECORD
                  </Text>

                  <Text
                    style={
                      styles.pageTitle
                    }
                  >
                    Season by season.
                  </Text>

                  <View
                    style={
                      styles.careerHeader
                    }
                  >
                    <Text
                      style={
                        styles.careerHeaderSeason
                      }
                    >
                      SEASON
                    </Text>

                    <Text
                      style={
                        styles.careerHeaderClub
                      }
                    >
                      CLUB / COMPETITION
                    </Text>

                    <Text
                      style={
                        styles.careerHeaderStats
                      }
                    >
                      RECORD
                    </Text>
                  </View>

                  {career.map(
                    (
                      row: any,
                      index: number,
                    ) => (
                      <View
                        key={
                          index
                        }
                        style={
                          styles.careerRow
                        }
                      >
                        <Text
                          style={
                            styles.careerSeason
                          }
                        >
                          {row.season_label ||
                            row.season ||
                            row.start_date?.slice(
                              0,
                              4,
                            ) ||
                            '—'}
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
                              row.club_name ||
                                row.club ||
                                '—',
                              36,
                            )}
                          </Text>

                          <Text
                            style={
                              styles.careerClubMeta
                            }
                          >
                            {clip(
                              [
                                row.league,
                                row.country,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' · ',
                                ),
                              48,
                            )}
                          </Text>

                          {row.source_name && (
                            <Text
                              style={
                                styles.careerSource
                              }
                            >
                              Source:{' '}
                              {
                                row.source_name
                              }
                            </Text>
                          )}
                        </View>

                        <Text
                          style={
                            styles.careerStats
                          }
                        >
                          {
                            dossierCareerStatLine(
                              row,
                            )
                          }
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              )}

            {(notable.length >
              0 ||
              videos.length >
                0) && (
              <View
                style={
                  styles.pageTwoColumns
                }
                wrap={false}
              >
                {notable.length >
                  0 &&
                  !hidden(
                    profile,
                    'experience',
                  ) && (
                    <View
                      style={
                        styles.columnLeft
                      }
                    >
                      <Text
                        style={
                          styles.miniTitle
                        }
                      >
                        Selected
                        experience
                      </Text>

                      {notable.map(
                        (
                          item: any,
                          index: number,
                        ) => (
                          <View
                            key={
                              index
                            }
                            style={
                              styles.notableItem
                            }
                          >
                            <Text
                              style={
                                styles.notableNumber
                              }
                            >
                              0
                              {index +
                                1}
                            </Text>

                            <Text
                              style={
                                styles.notableText
                              }
                            >
                              {clip(
                                typeof item ===
                                  'string'
                                  ? item
                                  : item.label ||
                                      item.title ||
                                      item.value,
                                100,
                              )}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}

                {videos.length >
                  0 &&
                  !hidden(
                    profile,
                    'videos',
                  ) && (
                    <View
                      style={
                        styles.column
                      }
                    >
                      <Text
                        style={
                          styles.miniTitle
                        }
                      >
                        Player footage
                      </Text>

                      {videos.map(
                        (
                          video: any,
                          index: number,
                        ) => (
                          <View
                            key={
                              index
                            }
                            style={
                              styles.video
                            }
                          >
                            <Text
                              style={
                                styles.videoTitle
                              }
                            >
                              {clip(
                                video.title ||
                                  `Player footage ${index + 1}`,
                                42,
                              )}
                            </Text>

                            <Link
                              src={
                                video.url
                              }
                              style={
                                styles.videoLink
                              }
                            >
                              Open video
                            </Link>
                          </View>
                        ),
                      )}
                    </View>
                  )}
              </View>
            )}

            {sources.length >
              0 && (
              <View
                style={
                  styles.sourceRow
                }
                wrap={false}
              >
                {sources.map(
                  (source) => (
                    <Link
                      key={
                        source.label
                      }
                      src={
                        source.url
                      }
                      style={
                        styles.sourceLink
                      }
                    >
                      {
                        source.label
                      }
                    </Link>
                  ),
                )}
              </View>
            )}

            <View
              style={
                styles.contact
              }
              wrap={false}
            >
              <View>
                <Text
                  style={
                    styles.contactKicker
                  }
                >
                  DJM SPORTS MANAGEMENT
                </Text>

                <Text
                  style={
                    styles.contactTitle
                  }
                >
                  Discuss {clip(
                    name,
                    28,
                  )} with DJM.
                </Text>

                <Text
                  style={
                    styles.contactCopy
                  }
                >
                  For current
                  availability,
                  contractual
                  information,
                  financial parameters,
                  full-match footage or
                  a direct player
                  discussion.
                </Text>
              </View>

              <Link
                src={`mailto:${email}`}
                style={
                  styles.contactEmail
                }
              >
                Contact DJM
              </Link>
            </View>
          </View>

          <View
            style={
              styles.footer
            }
            fixed
          >
            <Text
              style={
                styles.footerText
              }
            >
              DJM SPORTS MANAGEMENT
            </Text>

            <Text
              style={
                styles.footerText
              }
            >
              {verified
                ? `REVIEWED ${verified.toUpperCase()}`
                : 'PROFESSIONAL PLAYER DOSSIER'}
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function downloadClubCv({
  profile,
  photoUrl,
  logoUrl,
  filename,
}: DownloadArgs) {
  const pdfDocument =
  (
    <ClubCvPdfDocument
      profile={profile}
      photoUrl={
        photoUrl || null
      }
      logoUrl={
        logoUrl || null
      }
    />
  );

const blob =
  await pdf(
    pdfDocument,
  ).toBlob();

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    documentElement();

  link.href = url;

  link.download =
    filename ||
    `${profile?.display_name || 'DJM-Player'}-DJM-Player-Dossier.pdf`;

  document.body.appendChild(
    link,
  );

  link.click();

  link.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        url,
      ),
    1000,
  );
}

function documentElement() {
  return document.createElement(
    'a',
  );
}
