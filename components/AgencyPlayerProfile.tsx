'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import PublicProfile from '@/components/PublicProfile';
import {
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';
import { publicFile } from '@/lib/supabase';

import styles from './AgencyPlayerProfile.module.css';

type AgencyInvoke = <T = any>(
  action: string,
  body?: Record<string, unknown>,
) => Promise<T>;

type Props = {
  playerId: string;
  backHref: string;
  role: string;
  fallbackAgency: Record<string, any>;
  invoke: AgencyInvoke;
  onOpenIntelligence: (
    playerId: string,
    title: string,
    context: string,
  ) => void;
};

type ProfileForm = {
  intro_line: string;
  why_review: string;
  career_summary: string;
  key_stats_text: string;
  experience_text: string;
  hide_market_value: boolean;
  market_value_display: string;
  market_value_source_url: string;
  hidden_sections: string[];
};

const emptyForm: ProfileForm = {
  intro_line: '',
  why_review: '',
  career_summary: '',
  key_stats_text: '',
  experience_text: '',
  hide_market_value: true,
  market_value_display: '',
  market_value_source_url: '',
  hidden_sections: [],
};

const text = (value: unknown) =>
  String(value || '').trim();

const human = (value: unknown) =>
  text(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const age = (value: unknown) => {
  const raw = text(value);
  if (!raw) return null;
  const born = new Date(raw);
  if (Number.isNaN(born.getTime())) return null;
  return String(
    Math.floor(
      (Date.now() - born.getTime()) /
        (365.2425 * 86400000),
    ),
  );
};

const parseKeyStats = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => {
      const split = line.indexOf(':');
      if (split < 1) {
        return {
          label: line.slice(0, 50),
          value: '',
        };
      }
      return {
        label: line.slice(0, split).trim().slice(0, 50),
        value: line.slice(split + 1).trim().slice(0, 50),
      };
    })
    .filter((item) => item.label && item.value);

const parseLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => line.slice(0, 180));

const formFromProfile = (profile: any): ProfileForm => {
  const settings = profile?.settings || {};
  return {
    intro_line: text(settings.intro_line),
    why_review: text(settings.why_review),
    career_summary: text(settings.career_summary),
    key_stats_text: Array.isArray(settings.key_stats)
      ? settings.key_stats
          .filter((item: any) => item?.label && item?.value)
          .map((item: any) => `${item.label}: ${item.value}`)
          .join('\n')
      : '',
    experience_text: Array.isArray(settings.notable_experience)
      ? settings.notable_experience
          .map((item: any) =>
            typeof item === 'string'
              ? item
              : item?.label || item?.title || item?.value || '',
          )
          .filter(Boolean)
          .join('\n')
      : '',
    hide_market_value: settings.hide_market_value !== false,
    market_value_display: text(settings.market_value_display),
    market_value_source_url: text(settings.market_value_source_url),
    hidden_sections: Array.isArray(settings.hidden_sections)
      ? settings.hidden_sections
      : [],
  };
};

const makeDraftProfile = (
  bundle: any,
  form: ProfileForm,
) => {
  const player = bundle?.player || {};
  const career = Array.isArray(bundle?.career)
    ? bundle.career
    : [];
  const videos = Array.isArray(bundle?.videos)
    ? bundle.videos
    : [];
  const published = bundle?.published || {};
  const customStats = parseKeyStats(form.key_stats_text);
  const keyStats = customStats.length
    ? customStats
    : Array.isArray(bundle?.auto_key_stats)
      ? bundle.auto_key_stats
      : [];
  const selectedVideos = videos.filter((item: any) => item.featured).length
    ? videos.filter((item: any) => item.featured).slice(0, 4)
    : videos.slice(0, 4);
  const name =
    [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ') ||
    player.preferred_name ||
    published.display_name ||
    'Player';

  return {
    ...published,
    display_name: name,
    headline:
      form.intro_line ||
      [player.primary_position, player.current_club]
        .filter(Boolean)
        .join(' · ') ||
      'Professional footballer',
    primary_position: player.primary_position,
    secondary_positions: player.secondary_positions || [],
    preferred_foot: player.preferred_foot,
    age_display: age(player.date_of_birth),
    height_display: player.height_cm
      ? `${player.height_cm} cm`
      : null,
    nationalities: player.nationalities || [],
    current_status: player.contract_status,
    current_club: player.current_club,
    key_stats: keyStats,
    why_review: form.why_review || null,
    career_summary: form.career_summary || null,
    profile_photo_path: player.profile_photo_path,
    primary_video_url: selectedVideos[0]?.url || null,
    transfermarkt_url: player.transfermarkt_url,
    wyscout_url: player.wyscout_url,
    stats_url: player.stats_url,
    career_timeline: career,
    selected_videos: selectedVideos.map((item: any) => ({
      title: item.title,
      url: item.url,
      video_type: item.video_type,
    })),
    notable_experience: parseLines(form.experience_text),
    market_value_display: form.hide_market_value
      ? null
      : form.market_value_display || null,
    market_value_source_url: form.hide_market_value
      ? null
      : form.market_value_source_url || null,
    hidden_sections: form.hidden_sections,
    hide_market_value: form.hide_market_value,
    verified_at: player.verified_at || null,
  };
};

const shareStatus = (share: any) => {
  if (!share?.active || share?.revoked_at) return 'Revoked';
  if (
    share?.expires_at &&
    new Date(share.expires_at).getTime() < Date.now()
  ) {
    return 'Expired';
  }
  if (Number(share?.view_count || 0) > 0) return 'Opened';
  return 'Ready';
};

export default function AgencyPlayerProfile({
  playerId,
  backHref,
  role,
  fallbackAgency,
  invoke,
  onOpenIntelligence,
}: Props) {
  const [bundle, setBundle] = useState<any>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [shareClub, setShareClub] = useState('');
  const [shareDeal, setShareDeal] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareExpiry, setShareExpiry] = useState('30');
  const [shareResultUrl, setShareResultUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await invoke<any>('player_profile', {
        player_id: playerId,
      });
      const profile = response?.profile || null;
      if (!profile) {
        throw new Error('Player Profile could not be loaded.');
      }
      setBundle(profile);
      setForm(formFromProfile(profile));
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [invoke, playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const player = bundle?.player || {};
  const agency = {
    ...fallbackAgency,
    ...(bundle?.branding || {}),
  };
  const published = bundle?.published || null;
  const career = Array.isArray(bundle?.career)
    ? bundle.career
    : [];
  const videos = Array.isArray(bundle?.videos)
    ? bundle.videos
    : [];
  const shares = Array.isArray(bundle?.shares)
    ? bundle.shares
    : [];
  const clubs = Array.isArray(bundle?.clubs)
    ? bundle.clubs
    : [];
  const deals = Array.isArray(bundle?.deals)
    ? bundle.deals
    : [];
  const documents = Array.isArray(bundle?.documents)
    ? bundle.documents
    : [];
  const name =
    [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ') ||
    player.preferred_name ||
    'Player';
  const photo = publicFile(
    'player-public',
    player.profile_photo_path,
  );
  const draftProfile = useMemo(
    () => makeDraftProfile(bundle, form),
    [bundle, form],
  );

  const checks = [
    {
      label: 'Player data verified',
      ok:
        player.verification_status === 'verified' &&
        Boolean(player.verified_at),
      important: true,
    },
    {
      label: 'Position recorded',
      ok: Boolean(player.primary_position),
      important: true,
    },
    {
      label: 'Agency contact ready',
      ok: Boolean(agency.support_email),
      important: true,
    },
    {
      label: 'Profile photo',
      ok: Boolean(player.profile_photo_path),
      important: false,
    },
    {
      label: 'Career history',
      ok: career.length > 0,
      important: false,
    },
    {
      label: 'Current video',
      ok: videos.length > 0,
      important: false,
    },
    {
      label: 'Agency positioning',
      ok: Boolean(form.why_review || form.intro_line),
      important: false,
    },
  ];

  const missingCount = checks.filter((item) => !item.ok).length;
  const canPublish = checks
    .filter((item) => item.important)
    .every((item) => item.ok);
  const canEdit = ['owner', 'admin', 'agent', 'operations'].includes(
    role,
  );

  const setField = <K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

  const saveSettings = async (showNotice = true) => {
    if (!canEdit || actionBusy) return false;
    setActionBusy('save');
    setError('');
    if (showNotice) setNotice('');
    try {
      await invoke('player_profile_save', {
        player_id: playerId,
        settings: {
          intro_line: form.intro_line,
          why_review: form.why_review,
          career_summary: form.career_summary,
          key_stats: parseKeyStats(form.key_stats_text),
          notable_experience: parseLines(form.experience_text),
          hide_market_value: form.hide_market_value,
          market_value_display: form.market_value_display,
          market_value_source_url: form.market_value_source_url,
          hidden_sections: form.hidden_sections,
        },
      });
      if (showNotice) {
        setNotice('Player Profile saved.');
      }
      return true;
    } catch (saveError) {
      setError(friendlyError(saveError));
      return false;
    } finally {
      setActionBusy('');
    }
  };

  const publishProfile = async () => {
    if (!canEdit || actionBusy) return;
    if (!(await saveSettings(false))) return;
    setActionBusy('publish');
    setError('');
    setNotice('');
    try {
      await invoke('player_profile_publish', {
        player_id: playerId,
      });
      setNotice(
        published?.published
          ? 'Live Player Profile updated.'
          : 'Player Profile is live and ready to share.',
      );
      setEditOpen(false);
      await load();
    } catch (publishError) {
      setError(friendlyError(publishError));
    } finally {
      setActionBusy('');
    }
  };

  const unpublishProfile = async () => {
    if (!canEdit || actionBusy) return;
    setActionBusy('unpublish');
    setError('');
    try {
      await invoke('player_profile_unpublish', {
        player_id: playerId,
      });
      setNotice('Player Profile unpublished.');
      await load();
    } catch (publishError) {
      setError(friendlyError(publishError));
    } finally {
      setActionBusy('');
    }
  };

  const downloadPdf = async () => {
    if (actionBusy) return;
    setActionBusy('pdf');
    setError('');
    try {
      const { downloadClubCv } = await import(
        '@/components/ClubCvPdf'
      );
      const rawLogo =
        agency.light_logo_asset ||
        agency.logo_asset ||
        agency.compact_logo_asset ||
        null;
      const logoUrl = rawLogo
        ? new URL(
            String(rawLogo),
            window.location.origin,
          ).toString()
        : null;
      await downloadClubCv({
        profile: draftProfile,
        agency,
        photoUrl: photo || null,
        logoUrl,
        filename: `${name}-${agency.short_name || agency.display_name || 'Agency'}-Player-Profile.pdf`,
      });
      setNotice('Player Profile PDF downloaded.');
    } catch (pdfError) {
      setError(friendlyError(pdfError));
    } finally {
      setActionBusy('');
    }
  };

  const createShare = async () => {
    if (!canEdit || actionBusy) return;
    const selectedDeal = deals.find(
      (deal: any) => String(deal.id) === shareDeal,
    );
    const organisationId =
      selectedDeal?.organisation_id || shareClub;
    if (!organisationId) {
      setError('Choose the club this profile is being shared with.');
      return;
    }
    setActionBusy('share');
    setError('');
    setNotice('');
    try {
      const response = await invoke<any>(
        'player_profile_share_create',
        {
          player_id: playerId,
          organisation_id: organisationId,
          deal_room_id: shareDeal || null,
          pitch_message: shareMessage || null,
          expires_days: Number(shareExpiry) || 30,
        },
      );
      const token = response?.share?.token;
      if (!token) {
        throw new Error('The profile link was not created.');
      }
      const url = `${window.location.origin}/s/${token}`;
      setShareResultUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setNotice('Private Player Profile link created and copied.');
      } catch {
        setNotice('Private Player Profile link created.');
      }
      await load();
    } catch (shareError) {
      setError(friendlyError(shareError));
    } finally {
      setActionBusy('');
    }
  };

  const revokeShare = async (shareId: string) => {
    if (!canEdit || actionBusy) return;
    setActionBusy(`revoke:${shareId}`);
    setError('');
    try {
      await invoke('player_profile_share_revoke', {
        player_id: playerId,
        share_id: shareId,
      });
      setNotice('Profile link revoked.');
      await load();
    } catch (shareError) {
      setError(friendlyError(shareError));
    } finally {
      setActionBusy('');
    }
  };

  const copyShare = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Player Profile link copied.');
    } catch {
      setShareResultUrl(url);
      setShareOpen(true);
    }
  };

  const addVideo = async () => {
    if (!canEdit || actionBusy || !videoUrl.trim()) return;
    setActionBusy('video-add');
    setError('');
    try {
      await invoke('player_profile_video_add', {
        player_id: playerId,
        title: videoTitle || 'Player video',
        url: videoUrl,
      });
      setVideoTitle('');
      setVideoUrl('');
      setNotice('Video added to the player record.');
      await load();
    } catch (videoError) {
      setError(friendlyError(videoError));
    } finally {
      setActionBusy('');
    }
  };

  const removeVideo = async (videoId: string) => {
    if (!canEdit || actionBusy) return;
    setActionBusy(`video-remove:${videoId}`);
    setError('');
    try {
      await invoke('player_profile_video_remove', {
        player_id: playerId,
        video_id: videoId,
      });
      setNotice('Video removed.');
      await load();
    } catch (videoError) {
      setError(friendlyError(videoError));
    } finally {
      setActionBusy('');
    }
  };

  const openShareComposer = () => {
    setShareResultUrl('');
    setShareMessage('');
    setShareExpiry('30');
    setShareDeal('');
    setShareClub('');
    setShareOpen(true);
  };

  const toggleSection = (key: string) => {
    setField(
      'hidden_sections',
      form.hidden_sections.includes(key)
        ? form.hidden_sections.filter((item) => item !== key)
        : [...form.hidden_sections, key],
    );
  };

  if (loading && !bundle) {
    return (
      <section className={styles.loading}>
        <LoaderCircle className={styles.spin} size={22} />
        Loading Player Profile...
      </section>
    );
  }

  if (!bundle) {
    return (
      <section className={styles.errorCard}>
        <strong>Player Profile unavailable</strong>
        <p>{error || 'This player could not be loaded.'}</p>
        <Link href={backHref}>Back to Players</Link>
      </section>
    );
  }

  const theme = {
    '--profile-primary':
      agency.primary_color || '#111827',
    '--profile-accent':
      agency.accent_color || '#64748B',
  } as React.CSSProperties;

  return (
    <div className={styles.root} style={theme}>
      <div className={styles.topbar}>
        <Link href={backHref} className={styles.back}>
          <ArrowLeft size={15} />
          Players
        </Link>

        <button
          type="button"
          className={styles.quietButton}
          onClick={() =>
            onOpenIntelligence(
              playerId,
              name,
              human(player.football_status),
            )
          }
        >
          <BarChart3 size={15} />
          Player intelligence
        </button>
      </div>

      {error ? (
        <div className={styles.error}>
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className={styles.notice}>
          <Check size={15} />
          {notice}
        </div>
      ) : null}

      <section className={styles.hero}>
        <div className={styles.heroIdentity}>
          <div className={styles.photo}>
            {photo ? (
              <img src={photo} alt="" />
            ) : (
              <span>
                {name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part: string) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
            )}
          </div>

          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              PLAYER PROFILE
            </div>
            <h2>{name}</h2>
            <p>
              {[
                player.primary_position,
                player.current_club,
                player.current_country,
              ]
                .filter(Boolean)
                .join(' · ') || 'Player details'}
            </p>

            <div className={styles.statusRow}>
              <span
                className={
                  published?.published
                    ? styles.liveStatus
                    : styles.draftStatus
                }
              >
                <ShieldCheck size={13} />
                {published?.published ? 'Live' : 'Draft'}
              </span>

              <span>
                {player.verification_status === 'verified'
                  ? 'Data verified'
                  : 'Verification needed'}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.readiness}>
          <div className={styles.readinessTop}>
            <div>
              <span>Profile status</span>
              <strong>
                {published?.published
                  ? 'Live'
                  : canPublish
                    ? 'Ready to publish'
                    : `${missingCount} ${missingCount === 1 ? 'thing' : 'things'} to finish`}
              </strong>
            </div>
          </div>

          <p>
            {published?.published
              ? 'Ready to share with clubs.'
              : canPublish
                ? 'The required player information is ready.'
                : 'Finish the important items before publishing.'}
          </p>
        </div>

        <div className={styles.heroActions}>
          {published?.published ? (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={openShareComposer}
              disabled={!canEdit}
            >
              <Send size={16} />
              Share Player Profile
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={publishProfile}
              disabled={!canEdit || !canPublish || Boolean(actionBusy)}
            >
              {actionBusy === 'publish' ? (
                <LoaderCircle className={styles.spin} size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              Publish Player Profile
            </button>
          )}

          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={15} />
            Preview
          </button>

          <button
            type="button"
            className={styles.secondaryAction}
            onClick={downloadPdf}
            disabled={actionBusy === 'pdf'}
          >
            <Download size={15} />
            PDF
          </button>

          {canEdit ? (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => setEditOpen(true)}
            >
              <Pencil size={15} />
              Edit
            </button>
          ) : null}
        </div>
      </section>

      <section className={styles.readinessGrid}>
        {checks.map((item) => (
          <div
            key={item.label}
            className={
              item.ok ? styles.checkDone : styles.checkPending
            }
          >
            <span>
              {item.ok ? <Check size={13} /> : <i />}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {item.ok
                  ? 'Ready'
                  : item.important
                    ? 'Needed before publishing'
                    : 'Recommended'}
              </small>
            </div>
          </div>
        ))}
      </section>

      <div className={styles.columns}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <span className={styles.eyebrow}>WHAT CLUBS SEE</span>
              <h3>Built automatically from the player record.</h3>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setPreviewOpen(true)}
              aria-label="Preview Player Profile"
            >
              <Eye size={16} />
            </button>
          </div>

          <div className={styles.facts}>
            <div>
              <span>Position</span>
              <strong>{player.primary_position || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Current club</span>
              <strong>{player.current_club || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Contract</span>
              <strong>
                {human(player.contract_status) || 'Not recorded'}
              </strong>
            </div>
            <div>
              <span>Nationality</span>
              <strong>
                {Array.isArray(player.nationalities)
                  ? player.nationalities.join(' · ') || 'Not recorded'
                  : 'Not recorded'}
              </strong>
            </div>
          </div>

          <div className={styles.story}>
            <span>Profile headline</span>
            <strong>
              {form.intro_line ||
                draftProfile.headline ||
                'Generated from current player details'}
            </strong>

            <span>Why this player</span>
            <p>
              {form.why_review ||
                'Optional. Add a short factual agency view when it helps a club understand the player quickly.'}
            </p>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <span className={styles.eyebrow}>PROOF</span>
              <h3>Current evidence, not manual admin.</h3>
            </div>
            <RefreshCw size={17} />
          </div>

          <div className={styles.proofStats}>
            <div>
              <strong>{career.length}</strong>
              <span>career records</span>
            </div>
            <div>
              <strong>{videos.length}</strong>
              <span>videos</span>
            </div>
            <div>
              <strong>{documents.length}</strong>
              <span>shareable docs</span>
            </div>
          </div>

          <div className={styles.keyStats}>
            {(draftProfile.key_stats || []).slice(0, 6).map(
              (item: any, index: number) => (
                <div key={`${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ),
            )}

            {!draftProfile.key_stats?.length ? (
              <p>
                Verified current-season numbers will appear automatically
                when reviewed stats are available.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>PROFILE ACTIVITY</span>
            <h3>Know what happened after you sent it.</h3>
          </div>

          {published?.published ? (
            <button
              type="button"
              className={styles.quietButton}
              onClick={openShareComposer}
            >
              <Link2 size={15} />
              New club link
            </button>
          ) : null}
        </div>

        <div className={styles.shareList}>
          {shares.slice(0, 12).map((share: any) => (
            <div className={styles.shareRow} key={share.id}>
              <div className={styles.shareState}>
                <i
                  data-state={shareStatus(share).toLowerCase()}
                />
              </div>

              <div className={styles.shareCopy}>
                <strong>
                  {share.club_name || share.label || 'Club share'}
                </strong>
                <span>
                  {Number(share.view_count || 0)} view
                  {Number(share.view_count || 0) === 1 ? '' : 's'}
                  {share.last_viewed_at
                    ? ` · last ${relativeDate(share.last_viewed_at)}`
                    : ' · not opened yet'}
                </span>
                <small>
                  {share.deal_title
                    ? `Linked to ${share.deal_title}`
                    : shareStatus(share)}
                </small>
              </div>

              <div className={styles.shareActions}>
                {share.active && !share.revoked_at ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => copyShare(share.token)}
                    aria-label="Copy profile link"
                  >
                    <Copy size={15} />
                  </button>
                ) : null}

                {share.active && !share.revoked_at && canEdit ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => revokeShare(String(share.id))}
                    aria-label="Revoke profile link"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {!shares.length ? (
            <div className={styles.empty}>
              <Link2 size={19} />
              <strong>No profile links sent yet.</strong>
              <span>
                Once you share this Player Profile, views and follow-up
                context appear here.
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {published?.published && canEdit ? (
        <div className={styles.bottomActions}>
          <button
            type="button"
            className={styles.textButton}
            onClick={unpublishProfile}
            disabled={Boolean(actionBusy)}
          >
            Unpublish Player Profile
          </button>
        </div>
      ) : null}

      {editOpen ? (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal}>
            <header>
              <div>
                <span className={styles.eyebrow}>EDIT PLAYER PROFILE</span>
                <h2>Only edit what needs agency judgement.</h2>
                <p>
                  Core player data, verified stats, career history and agency
                  branding are pulled in automatically.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setEditOpen(false)}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>

            <div className={styles.form}>
              <label>
                <span>Profile headline</span>
                <input
                  value={form.intro_line}
                  onChange={(event) =>
                    setField('intro_line', event.target.value)
                  }
                  placeholder={draftProfile.headline}
                />
                <small>
                  Leave blank to use the automatic position and current club
                  headline.
                </small>
              </label>

              <label>
                <span>Why this player?</span>
                <textarea
                  rows={4}
                  value={form.why_review}
                  onChange={(event) =>
                    setField('why_review', event.target.value)
                  }
                  placeholder="A short, factual agency view that helps a club understand the player quickly."
                />
              </label>

              <label>
                <span>Career summary</span>
                <textarea
                  rows={3}
                  value={form.career_summary}
                  onChange={(event) =>
                    setField('career_summary', event.target.value)
                  }
                  placeholder="Optional. Use only when the career story benefits from context."
                />
              </label>

              <label>
                <span>Custom key numbers</span>
                <textarea
                  rows={4}
                  value={form.key_stats_text}
                  onChange={(event) =>
                    setField('key_stats_text', event.target.value)
                  }
                  placeholder={'Goals: 8\nAssists: 6'}
                />
                <small>
                  Optional. Leave blank and reviewed current-season numbers are
                  used automatically.
                </small>
              </label>

              <label>
                <span>Selected experience</span>
                <textarea
                  rows={4}
                  value={form.experience_text}
                  onChange={(event) =>
                    setField('experience_text', event.target.value)
                  }
                  placeholder={'National team experience\nPromotion campaign'}
                />
                <small>One factual proof point per line.</small>
              </label>

              <div className={styles.sectionChooser}>
                <span>Sections shown to clubs</span>
                <div>
                  {[
                    ['why_review', 'Why this player'],
                    ['stats', 'Key numbers'],
                    ['career', 'Career'],
                    ['videos', 'Video'],
                    ['experience', 'Experience'],
                  ].map(([key, label]) => {
                    const shown = !form.hidden_sections.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={shown ? styles.sectionOn : styles.sectionOff}
                        onClick={() => toggleSection(key)}
                      >
                        {shown ? <Check size={12} /> : null}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.marketValue}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={!form.hide_market_value}
                    onChange={(event) =>
                      setField(
                        'hide_market_value',
                        !event.target.checked,
                      )
                    }
                  />
                  <span>Show a sourced market value</span>
                </label>

                {!form.hide_market_value ? (
                  <div className={styles.twoFields}>
                    <label>
                      <span>Market value</span>
                      <input
                        value={form.market_value_display}
                        onChange={(event) =>
                          setField(
                            'market_value_display',
                            event.target.value,
                          )
                        }
                        placeholder="€500k"
                      />
                    </label>

                    <label>
                      <span>Source URL</span>
                      <input
                        value={form.market_value_source_url}
                        onChange={(event) =>
                          setField(
                            'market_value_source_url',
                            event.target.value,
                          )
                        }
                        placeholder="https://..."
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className={styles.mediaEditor}>
                <div>
                  <span className={styles.eyebrow}>VIDEO</span>
                  <h3>Current player footage</h3>
                </div>

                <div className={styles.videoList}>
                  {videos.map((video: any) => (
                    <div key={video.id}>
                      <Play size={15} />
                      <span>
                        <strong>{video.title || 'Player video'}</strong>
                        <small>
                          {video.featured ? 'Featured · ' : ''}
                          {human(video.video_type || 'video')}
                        </small>
                      </span>
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open video"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeVideo(String(video.id))}
                        aria-label="Remove video"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.addVideo}>
                  <input
                    value={videoTitle}
                    onChange={(event) =>
                      setVideoTitle(event.target.value)
                    }
                    placeholder="Video title"
                  />
                  <input
                    value={videoUrl}
                    onChange={(event) =>
                      setVideoUrl(event.target.value)
                    }
                    placeholder="YouTube, Vimeo or Wyscout URL"
                  />
                  <button
                    type="button"
                    onClick={addVideo}
                    disabled={!videoUrl.trim() || actionBusy === 'video-add'}
                  >
                    Add video
                  </button>
                </div>
              </div>
            </div>

            <footer>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => void saveSettings()}
                disabled={actionBusy === 'save'}
              >
                Save
              </button>

              <button
                type="button"
                className={styles.primaryAction}
                onClick={publishProfile}
                disabled={!canPublish || Boolean(actionBusy)}
              >
                {published?.published
                  ? 'Save and update live profile'
                  : 'Save and publish'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {shareOpen ? (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.shareModal}`}>
            <header>
              <div>
                <span className={styles.eyebrow}>SHARE PLAYER PROFILE</span>
                <h2>Who is this profile for?</h2>
                <p>
                  Create one private link for the club. Opens are tracked and the
                  link stays attached to the player.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setShareOpen(false)}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>

            {shareResultUrl ? (
              <div className={styles.shareSuccess}>
                <Check size={20} />
                <strong>Profile link ready.</strong>
                <p>{shareResultUrl}</p>
                <button
                  type="button"
                  onClick={() => copyShare(shareResultUrl.split('/').pop() || '')}
                >
                  <Copy size={15} />
                  Copy link
                </button>
              </div>
            ) : (
              <div className={styles.form}>
                <label>
                  <span>Club</span>
                  <select
                    value={shareClub}
                    onChange={(event) => {
                      setShareClub(event.target.value);
                      setShareDeal('');
                    }}
                  >
                    <option value="">Choose club</option>
                    {clubs.map((club: any) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                        {club.country ? ` · ${club.country}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Existing deal or opportunity</span>
                  <select
                    value={shareDeal}
                    onChange={(event) => {
                      const value = event.target.value;
                      setShareDeal(value);
                      const deal = deals.find(
                        (item: any) => String(item.id) === value,
                      );
                      if (deal?.organisation_id) {
                        setShareClub(String(deal.organisation_id));
                      }
                    }}
                  >
                    <option value="">No deal selected</option>
                    {deals.map((deal: any) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.club_name || 'Club'} · {deal.title || human(deal.stage)}
                      </option>
                    ))}
                  </select>
                  <small>
                    Optional. Linking a live deal carries profile activity into that
                    opportunity.
                  </small>
                </label>

                <label>
                  <span>Short introduction</span>
                  <textarea
                    rows={3}
                    value={shareMessage}
                    onChange={(event) =>
                      setShareMessage(event.target.value)
                    }
                    placeholder="Optional note for this club."
                  />
                </label>

                <label>
                  <span>Link expires</span>
                  <select
                    value={shareExpiry}
                    onChange={(event) =>
                      setShareExpiry(event.target.value)
                    }
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </label>
              </div>
            )}

            <footer>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShareOpen(false)}
              >
                {shareResultUrl ? 'Done' : 'Cancel'}
              </button>

              {!shareResultUrl ? (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={createShare}
                  disabled={
                    !shareClub ||
                    actionBusy === 'share'
                  }
                >
                  <Link2 size={15} />
                  Create and copy link
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}

      {previewOpen ? (
        <div className={styles.previewBackdrop}>
          <div className={styles.previewBar}>
            <div>
              <span>PLAYER PROFILE PREVIEW</span>
              <strong>Exactly what a club sees</strong>
            </div>

            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
            >
              <X size={17} />
              Close
            </button>
          </div>

          <div className={styles.previewScroll}>
            <PublicProfile
              profile={draftProfile}
              agency={agency}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
