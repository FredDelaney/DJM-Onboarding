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
  dossierContractExpiry,
  dossierHeadline,
  dossierCareer,
  dossierCareerStatLine,
  dossierHeadlineStats,
  dossierHeadlineStatContext,
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
  agency?: any;
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
      paddingTop: 24,
      paddingBottom: 44,
    },

    /* PAGE ONE */

    hero: {
      marginTop: -24,
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
      paddingTop: 20,
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
      paddingBottom: 0,
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
    statSolo: {flex: 1},

    statValue: {
      color: NAVY,
      fontSize: 17,
      lineHeight: 1,
      fontWeight: 700,
    },

    statLabel: {
      color: MUTED,
      marginTop: 4,
      fontSize: 6.8,
      fontWeight: 700,
    },
    statContext: {color: MUTED, marginTop: 5, fontSize: 6.8, lineHeight: 1.4},
    statEvidence: {color: MUTED, marginTop: 3, marginBottom: 8, fontSize: 7.2, lineHeight: 1.4},

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
      marginTop: -24,
      height: 82,
      backgroundColor: NAVY,
      paddingHorizontal: 34,
      paddingTop: 25,
      paddingBottom: 18,
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
      paddingBottom: 38,
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
      minHeight: 38,
      paddingVertical: 6,
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
      marginTop: 15,
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
      marginTop: 16,
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor: LINE,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
    },

    contactKicker: {
      color: MUTED,
      fontSize: 6.4,
      fontWeight: 700,
      letterSpacing: .7,
    },

    contactTitle: {
      color: NAVY,
      marginTop: 3,
      fontSize: 8.4,
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
      fontSize: 7.4,
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
  agency,
  photoUrl,
  logoUrl,
}: {
  profile: any;
  agency?: any;
  photoUrl?: string | null;
  logoUrl?: string | null;
}) {
  const name =
    profile?.display_name ||
    'Player';

  const agencyName =
    String(
      agency?.display_name ||
        'Agency',
    ).trim() || 'Agency';

  const agencyShortName =
    String(
      agency?.short_name ||
        agencyName,
    ).trim() || agencyName;

  const agencyPortalName =
    String(
      agency?.portal_name ||
        `${agencyShortName} Player`,
    ).trim() ||
    `${agencyShortName} Player`;

  const agencyEmail =
    String(
      agency?.support_email ||
        '',
    ).trim();

  const brandMark =
    agencyShortName
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (part: string) =>
          part[0],
      )
      .join('')
      .slice(0, 3)
      .toUpperCase() ||
    'A';

  const cleanBrandColour = (
    value: unknown,
    fallback: string,
  ) => {
    const colour =
      String(value || '').trim();

    return /^#[0-9a-f]{6}$/i.test(
      colour,
    )
      ? colour
      : fallback;
  };

  const primaryColor =
    cleanBrandColour(
      agency?.primary_color,
      NAVY,
    );

  const accentColor =
    cleanBrandColour(
      agency?.accent_color,
      YELLOW,
    );

  const brandStyles =
    StyleSheet.create({
      hero: {
        backgroundColor:
          primaryColor,
      },
      accent: {
        backgroundColor:
          accentColor,
      },
      accentText: {
        color: accentColor,
      },
      logoFallback: {
        backgroundColor:
          accentColor,
      },
      logoFallbackText: {
        color: primaryColor,
      },
      primaryText: {
        color: primaryColor,
      },
      primaryBackground: {
        backgroundColor:
          primaryColor,
      },
      contactEmail: {
        backgroundColor:
          accentColor,
        color: primaryColor,
      },
    });

  const verified =
    dossierVerifiedDate(
      profile?.verified_at,
    );

  const nationality =
    dossierNationality(
      profile?.nationalities,
    );

  const currentStatus =
    String(profile?.current_status || '')
      .trim()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const contractExpiry = dossierContractExpiry(profile?.contract_expiry);
  const headline = dossierHeadline(profile);

  const stats =
    dossierHeadlineStats(
      profile,
      6,
    );

  const quickStats =
    stats.slice(0, 4);
  const statContext = dossierHeadlineStatContext(profile);

  const detailStats =
    stats.slice(4);

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
    ).slice(0, 5);

  const notable =
    dossierList(
      profile?.notable_experience,
    ).slice(0, 4);

  const selectedVideos =
    dossierList(
      profile?.selected_videos,
    )
      .filter(
        (item: any) =>
          item?.url,
      );

  const primaryVideo =
    profile?.primary_video_url ||
    selectedVideos?.[0]?.url ||
    null;

  const primaryVideoTitle =
    selectedVideos.find(
      (item: any) =>
        String(item?.url || '').trim() ===
        String(primaryVideo || '').trim(),
    )?.title ||
    'Player highlights';

  const videos = [
    ...(primaryVideo
      ? [{
          url: primaryVideo,
          title: primaryVideoTitle,
        }]
      : []),
    ...selectedVideos.filter(
      (item: any) =>
        String(item?.url || '').trim() !==
        String(primaryVideo || '').trim(),
    ),
  ].slice(0, 3);

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

    profile?.market_value_source_url &&
      !sameResearchUrl(
        profile.market_value_source_url,
        profile.transfermarkt_url,
      ) &&
      !sameResearchUrl(
        profile.market_value_source_url,
        profile.stats_url,
      ) && {
      label: 'Market value source',
      url:
        profile.market_value_source_url,
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
      nationality !== '-'
        ? nationality
        : null,
    ],
  ].filter(
    ([, value]) =>
      !!value,
  );

  const showPageTwo =
    Boolean(profile?.career_summary && !hidden(profile, 'summary')) ||
    career.length > 0 ||
    performance.rows.length > 0 ||
    notable.length > 0 ||
    videos.length > 0 ||
    sources.length > 0;

  const email =
    agencyEmail;

  return (
    <Document
      title={`${name} - ${agencyName} Player Profile`}
      author={agencyName}
      subject="Professional Player Profile"
      creator={agencyPortalName}
    >
      <Page
        size="A4"
        style={styles.page}
      >
        <View
          style={[styles.hero, brandStyles.hero]}
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
                  style={[styles.logoFallback, brandStyles.logoFallback]}
                >
                  <Text
                    style={[styles.logoFallbackText, brandStyles.logoFallbackText]}
                  >
                    {brandMark}
                  </Text>
                </View>
              )}

              <Text
                style={
                  styles.brandName
                }
              >
                {agencyName.toUpperCase()}
              </Text>
            </View>

            <Text
              style={
                styles.heroVerified
              }
            >
              {verified
                ? `${agencyShortName.toUpperCase()} REVIEWED · ${verified.toUpperCase()}`
                : 'PLAYER PROFILE'}
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
                style={[styles.yellowLine, brandStyles.accent]}
              />

              <Text
                style={
                  styles.kickerDark
                }
              >
                PLAYER PROFILE
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

              {headline && (
                <Text
                  style={
                    styles.headline
                  }
                >
                  {clip(
                    headline,
                    170,
                  )}
                </Text>
              )}

              <View
                style={
                  styles.statusRow
                }
              >
                {currentStatus && (
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
                        currentStatus,
                        34,
                      )}
                    </Text>
                  </View>
                )}

                {profile?.market_value_display &&
                  (profile?.market_value_source_url || profile?.transfermarkt_url) &&
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

              {contractExpiry && (
                <Text style={styles.statusText}>Contract until {contractExpiry}</Text>
              )}

              {primaryVideo && !hidden(profile, 'videos') && (
                <Link
                  src={primaryVideo}
                  style={[styles.heroSourceLink, brandStyles.accentText]}
                >
                  WATCH FOOTAGE ↗
                </Link>
              )}

              {profile?.transfermarkt_url && (
                <Link
                  src={profile.transfermarkt_url}
                  style={[styles.heroSourceLink, brandStyles.accentText]}
                >
                  TRANSFERMARKT PROFILE ↗
                </Link>
              )}
            </View>
            
            {photoUrl && (
              <Image
                src={photoUrl}
                style={
                  styles.photo
                }
              />
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
                      style={[styles.factValue, brandStyles.primaryText]}
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

          {quickStats.length > 0 &&
            !hidden(
              profile,
              'stats',
            ) && (
              <View
                style={styles.section}
                wrap={false}
              >
                <Text style={styles.kicker}>
                  HEADLINE FIGURES
                </Text>
                <Text style={styles.statEvidence}>{statContext.period}{' · '}{statContext.source}{' · '}{statContext.date}</Text>

                <View style={styles.statBand}>
                  {quickStats.map((item, index) => (
                    <View
                      key={index}
                      style={
                        quickStats.length === 1 ? styles.statSolo : index === 0
                          ? styles.statFirst
                          : index === quickStats.length - 1
                            ? styles.statLast
                            : styles.stat
                      }
                    >
                      <Text
                        style={[styles.statValue, brandStyles.primaryText]}
                      >
                        {clip(item.value, 12)}
                      </Text>

                      <Text style={styles.statLabel}>
                        {clip(item.label, 22).toUpperCase()}
                      </Text>
                      {statContext.notes[index] ? <Text style={styles.statContext}>{statContext.notes[index]}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

          {(positionSpots.length > 0 ||
            !hidden(profile, 'why_review')) && (
            <View style={styles.playerProfile}>
              <View style={styles.playerProfileCopy}>
                <Text style={styles.kicker}>PLAYER PROFILE</Text>
                <Text style={[styles.roleTitle, brandStyles.primaryText]}>
                  {clip(profile?.primary_position || 'Professional footballer', 44)}
                </Text>
                <Text style={styles.roleMeta}>
                  {clip(
                    [
                      dossierList(profile?.secondary_positions).length
                        ? `Also: ${dossierList(profile.secondary_positions).join(' · ')}`
                        : null,
                      profile?.preferred_foot ? `${profile.preferred_foot} foot` : null,
                      currentStatus,
                    ]
                      .filter(Boolean)
                      .join('  ·  '),
                    120,
                  )}
                </Text>

                {!hidden(profile, 'why_review') && (
                  <Text style={styles.playerOverview} orphans={3} widows={3}>
                    {profile?.why_review || profile?.headline ||
                      `${agencyName} can provide the player profile, current availability and full-match footage.`}
                  </Text>
                )}
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
            {agencyName.toUpperCase()}
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
            style={[styles.pageTwoHeader, brandStyles.hero]}
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
                PLAYER PROFILE
              </Text>
            </View>
          </View>

          <View
            style={
              styles.pageTwoBody
            }
          >
          {profile?.career_summary &&
            !hidden(
              profile,
              'summary',
            ) && (
              <View
                style={
                  styles.section
                }
              >
                <Text
                  style={
                    styles.kicker
                  }
                  minPresenceAhead={36}
                >
                  PLAYER SNAPSHOT
                </Text>

                <Text
                  style={
                    styles.summary
                  }
                  orphans={3}
                  widows={3}
                >
                  {profile.career_summary}
                </Text>
              </View>
            )}
          {(detailStats.length > 0 ||
            performance.rows.length > 0) &&
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
                  PERFORMANCE DETAIL
                </Text>
                <Text style={styles.statEvidence}>{statContext.period}{' · '}{statContext.source}{' · '}{statContext.date}</Text>

                {detailStats.length > 0 ? (
                  <View
                    style={
                      styles.statBand
                    }
                  >
                    {detailStats.map(
                      (
                        item,
                        index,
                      ) => (
                        <View
                          key={
                            index
                          }
                          style={
                            detailStats.length === 1 ? styles.statSolo : index ===
                            0
                              ? styles.statFirst
                              : index ===
                                  detailStats.length -
                                    1
                                ? styles.statLast
                                : styles.stat
                          }
                        >
                          <Text
                            style={[styles.statValue, brandStyles.primaryText]}
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
                          {statContext.notes[index+4] ? <Text style={styles.statContext}>{statContext.notes[index+4]}</Text> : null}
                        </View>
                      ),
                    )}
                  </View>
                ) : null}

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
                                  brandStyles.primaryBackground,
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


            {career.length >
              0 &&
              !hidden(
                profile,
                'career',
              ) && (
                <View
                  style={styles.section}
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
                    style={[styles.pageTitle, brandStyles.primaryText]}
                  >
                    Recent career record.
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
                          style={[styles.careerSeason, brandStyles.primaryText]}
                        >
                          {row.season_label ||
                            row.season ||
                            row.start_date?.slice(
                              0,
                              4,
                            ) ||
                            '-'}
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
                                '-',
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
                      style={[styles.sourceLink, brandStyles.primaryText]}
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
              style={styles.contact}
              wrap={false}
            >
              <View>
                <Text
                  style={styles.contactKicker}
                >
                  CONTACT {agencyShortName.toUpperCase()}
                </Text>

                <Text
                  style={styles.contactTitle}
                >
                  Discuss {clip(name, 28)} with the agency.
                </Text>
              </View>

              <Link
                src={`mailto:${email}`}
                style={[styles.contactEmail, brandStyles.primaryText]}
              >
                {email}
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
              {agencyName.toUpperCase()}
            </Text>

            <Text
              style={
                styles.footerText
              }
            >
              {verified
                ? `REVIEWED ${verified.toUpperCase()}`
                : 'PROFESSIONAL PLAYER PROFILE'}
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function downloadClubCv({
  profile,
  agency,
  photoUrl,
  logoUrl,
  filename,
}: DownloadArgs) {
  // Reuse the document exporters' bounded image conversion. SVG logos can
  // contain browser CSS font stacks that React PDF cannot render directly.
  const exportLogo = logoUrl
    ? await (await import('@/lib/document-logo')).documentLogo(logoUrl)
    : undefined;
  const pdfDocument =
  (
    <ClubCvPdfDocument
      profile={profile}
      agency={agency}
      photoUrl={
        photoUrl || null
      }
      logoUrl={
        exportLogo?.dataUrl || null
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
    `${profile?.display_name || 'Player'}-${agency?.short_name || agency?.display_name || 'Agency'}-Player-Profile.pdf`;

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
