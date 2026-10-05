'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Clock3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Mail,
  MessageCircleMore,
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
import AgencyOwnershipChip from '@/components/AgencyOwnershipChip';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import {
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';
import {
  getCachedPlayerProfile,
  prefetchPlayerProfile,
  setCachedPlayerProfile,
} from '@/lib/player-profile-cache';
import { publicFile } from '@/lib/supabase';
import { tenantBrandTokens } from '@/lib/tenant-brand-style';

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
  onOpenAction: (request: AgencyActionRequest) => void;
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

type ProfileCheckAction =
  | 'verify-player'
  | 'player-workspace'
  | 'agency-settings'
  | 'profile-positioning'
  | 'profile-video'
  | 'transfermarkt';

type ProfileCheck = {
  key: string;
  label: string;
  ok: boolean;
  important: boolean;
  missingTitle: string;
  missingDetail: string;
  where: string;
  action: ProfileCheckAction;
  actionLabel: string;
};

type VerifyPlayerForm = {
  date_of_birth: string;
  nationalities: string;
  height_cm: string;
  preferred_foot: string;
  primary_position: string;
  current_club: string;
  current_country: string;
  contract_status: string;
  contract_expiry: string;
};

const emptyVerifyForm: VerifyPlayerForm = {
  date_of_birth: '',
  nationalities: '',
  height_cm: '',
  preferred_foot: '',
  primary_position: '',
  current_club: '',
  current_country: '',
  contract_status: '',
  contract_expiry: '',
};

const verifyFormFromPlayer = (player: any): VerifyPlayerForm => ({
  date_of_birth: text(player?.date_of_birth),
  nationalities: Array.isArray(player?.nationalities)
    ? player.nationalities.join(', ')
    : text(player?.nationalities),
  height_cm:
    player?.height_cm === null || player?.height_cm === undefined
      ? ''
      : String(player.height_cm),
  preferred_foot: text(player?.preferred_foot),
  primary_position: text(player?.primary_position),
  current_club: text(player?.current_club),
  current_country: text(player?.current_country),
  contract_status: text(player?.contract_status),
  contract_expiry: text(player?.contract_expiry),
});

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

const validTransfermarktPlayerUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      (host === 'transfermarkt.com' || host.endsWith('.transfermarkt.com')) &&
      /\/profil\/spieler\/\d+\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
};

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

const displayDate = (value: unknown) => {
  const raw = text(value);
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? raw
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
};

const statsFreshnessLabel = (value: unknown) => {
  const raw = text(value);
  if (!raw) return '';
  const checked = new Date(raw);
  if (Number.isNaN(checked.getTime())) return '';
  const hours = Math.max(0, Math.floor((Date.now() - checked.getTime()) / 3600000));
  if (hours < 24) return 'Checked today';
  if (hours < 48) return 'Checked yesterday';
  const days = Math.floor(hours / 24);
  if (days < 7) return `Checked ${days}d ago`;
  return `Checked ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(checked)}`;
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
    primary_video_url: selectedVideos[0]?.url || published.primary_video_url || null,
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
  onOpenAction,
  onOpenIntelligence,
}: Props) {
  const initialProfile = getCachedPlayerProfile(playerId);
  const [bundle, setBundle] = useState<any>(() => initialProfile);
  const [form, setForm] = useState<ProfileForm>(() =>
    initialProfile ? formFromProfile(initialProfile) : emptyForm,
  );
  const [loading, setLoading] = useState(!initialProfile);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyFocus, setVerifyFocus] = useState<'verification' | 'position' | 'contract-status' | 'contract-expiry'>(
    'verification',
  );
  const [verifyForm, setVerifyForm] =
    useState<VerifyPlayerForm>(emptyVerifyForm);
  const [verifyError, setVerifyError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [shareClub, setShareClub] = useState('');
  const [shareNetworkClubs, setShareNetworkClubs] = useState<any[]>([]);
  const [shareClubsBusy, setShareClubsBusy] = useState(false);
  const [shareDeal, setShareDeal] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareExpiry, setShareExpiry] = useState('30');
  const [shareResultUrl, setShareResultUrl] = useState('');
  const [shareResultMessage, setShareResultMessage] = useState('');
  const [transfermarktOpen, setTransfermarktOpen] = useState(false);
  const [transfermarktUrl, setTransfermarktUrl] = useState('');
  const [transfermarktError, setTransfermarktError] = useState('');

  const load = useCallback(async (fresh = false) => {
    const cached = getCachedPlayerProfile(playerId);
    if (!cached) setLoading(true);
    setError('');

    try {
      let profile: any = null;

      try {
        profile = fresh
          ? (await invoke<any>('player_profile_core', {
              player_id: playerId,
            }))?.profile || null
          : await prefetchPlayerProfile(playerId, invoke);
      } catch {
        profile =
          (await invoke<any>('player_profile', {
            player_id: playerId,
          }))?.profile || null;
      }

      if (!profile) {
        throw new Error('Player Profile could not be loaded.');
      }

      setCachedPlayerProfile(playerId, profile);
      setBundle(profile);
      setForm(formFromProfile(profile));
      setLoading(false);

      if (profile.secondary_ready === false) {
        void invoke<any>('player_profile_detail', {
          player_id: playerId,
        })
          .then((response) => {
            const detail = response?.detail || null;
            if (!detail) return;

            setBundle((current: any) => {
              if (!current) return current;
              const next = {
                ...current,
                ...detail,
                branding: {
                  ...(current.branding || {}),
                  ...(detail.branding || {}),
                },
              };
              setCachedPlayerProfile(playerId, next);
              return next;
            });
          })
          .catch(() => undefined);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
      setLoading(false);
    }
  }, [invoke, playerId]);

  useEffect(() => {
    void load(false);
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
  const shareClubOptions = useMemo(() => {
    const merged = new Map<string, any>();

    for (const club of [...clubs, ...shareNetworkClubs]) {
      const id = String(
        club?.id || club?.organisation_id || '',
      ).trim();
      if (!id) continue;

      merged.set(id, {
        id,
        name: club?.name || 'Club',
        country: club?.country || null,
      });
    }

    return [...merged.values()].sort((a, b) =>
      String(a.name).localeCompare(String(b.name)),
    );
  }, [clubs, shareNetworkClubs]);
  const documents = Array.isArray(bundle?.documents)
    ? bundle.documents
    : [];
  const communication =
    bundle?.communication || {};
  const communicationSummary =
    communication?.summary || {};
  const communicationItems = Array.isArray(
    communication?.items,
  )
    ? communication.items
    : [];
  const communicationFollowups = Array.isArray(
    communication?.open_followups,
  )
    ? communication.open_followups
    : [];
  const secondaryReady = bundle?.secondary_ready !== false;
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

  const checks: ProfileCheck[] = [
    {
      key: 'verification',
      label: 'Player data verified',
      ok:
        player.verification_status === 'verified' &&
        Boolean(player.verified_at),
      important: true,
      missingTitle: 'Verify current player data',
      missingDetail:
        'Review the player record, save any corrections, then mark the current data verified.',
      where:
        'Player Profile → Review current data → Confirm & verify',
      action: 'verify-player',
      actionLabel: 'Review & verify',
    },
    {
      key: 'position',
      label: 'Position recorded',
      ok: Boolean(player.primary_position),
      important: true,
      missingTitle: 'Add the primary position',
      missingDetail:
        'The club profile cannot publish without the player’s primary position.',
      where:
        'Player Profile → Review current data → Primary position',
      action: 'verify-player',
      actionLabel: 'Add position',
    },
    {
      key: 'agency-contact',
      label: 'Agency contact ready',
      ok: Boolean(agency.support_email),
      important: true,
      missingTitle: 'Add the agency support email',
      missingDetail:
        'Clubs need a clear reply address on the Player Profile.',
      where:
        'Settings → Agency settings → Workspace identity → Support email',
      action: 'agency-settings',
      actionLabel: 'Add support email',
    },
    {
      key: 'photo',
      label: 'Profile photo',
      ok: Boolean(player.profile_photo_path),
      important: false,
      missingTitle: 'Add a player profile photo',
      missingDetail:
        'A strong player photo makes the club-facing profile feel complete and credible.',
      where:
        `Players → ${name} → player workspace`,
      action: 'player-workspace',
      actionLabel: 'Open player',
    },
    {
      key: 'career',
      label: 'Career history',
      ok: career.length > 0,
      important: false,
      missingTitle: 'Add career history',
      missingDetail:
        'Record at least one career entry so clubs can see the player’s pathway.',
      where:
        `Players → ${name} → Career`,
      action: 'player-workspace',
      actionLabel: 'Open career',
    },
    {
      key: 'video',
      label: 'Current video',
      ok: Boolean(draftProfile.primary_video_url),
      important: false,
      missingTitle: 'Add current player footage',
      missingDetail:
        'Paste a YouTube, Vimeo or Wyscout video so clubs can watch the player immediately.',
      where:
        'Edit Player Profile → Current player footage → Video URL',
      action: 'profile-video',
      actionLabel: 'Add video',
    },
    {
      key: 'transfermarkt',
      label: 'Transfermarkt link',
      ok: Boolean(player.transfermarkt_url),
      important: false,
      missingTitle: 'Add Transfermarkt URL',
      missingDetail:
        'Link the player’s record so a club can verify the career context quickly.',
      where: 'Player Profile → Transfermarkt',
      action: 'transfermarkt',
      actionLabel: 'Add link',
    },
    {
      key: 'contract',
      label: 'Contract details',
      ok: Boolean(player.contract_status) &&
        (Boolean(player.contract_expiry) ||
          !/under contract|contracted|on loan/i.test(text(player.contract_status))),
      important: false,
      missingTitle: player.contract_status
        ? 'Add contract expiry'
        : 'Add contract status',
      missingDetail: player.contract_status
        ? 'Record the expiry date for a player who is under contract.'
        : 'Record the current contract status so clubs understand availability.',
      where: player.contract_status
        ? 'Player Profile → Review current data → Contract expiry'
        : 'Player Profile → Review current data → Contract status',
      action: 'verify-player',
      actionLabel: player.contract_status ? 'Add expiry' : 'Add status',
    },
    {
      key: 'positioning',
      label: 'Agency positioning',
      ok: Boolean(
        form.why_review ||
          form.intro_line ||
          draftProfile.headline,
      ),
      important: false,
      missingTitle: 'Add the agency view',
      missingDetail:
        'Write a short profile headline or “Why this player?” note to explain the player quickly.',
      where:
        'Edit Player Profile → Profile headline / Why this player?',
      action: 'profile-positioning',
      actionLabel: 'Add positioning',
    },
  ];

  const requiredChecks = checks.filter((item) => item.important);
  const optionalChecks = checks.filter((item) => !item.important);
  const missingRequiredChecks = requiredChecks.filter((item) => !item.ok);
  const missingOptionalChecks = optionalChecks.filter((item) => !item.ok);
  const missingShareHighlights = missingOptionalChecks.filter((item) =>
    ['video', 'transfermarkt', 'contract'].includes(item.key),
  );
  const missingRequiredCount = missingRequiredChecks.length;
  const canPublish = missingRequiredCount === 0;
  const verificationOnly =
    missingRequiredCount === 1 &&
    missingRequiredChecks[0]?.key === 'verification';
  const canPublishFromHero = canPublish || verificationOnly;
  const guidedRequiredChecks = verificationOnly ? [] : missingRequiredChecks;
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

  const publishProfile = async (
    options: {
      saveFirst?: boolean;
      confirmCurrentData?: boolean;
    } = {},
  ) => {
    if (!canEdit || actionBusy) return;
    if (options.saveFirst !== false && !(await saveSettings(false))) return;
    setActionBusy('publish');
    setError('');
    setNotice('');
    try {
      await invoke('player_profile_publish', {
        player_id: playerId,
        confirm_current_data: options.confirmCurrentData === true,
      });
      setNotice(
        published?.published
          ? 'Live Player Profile updated.'
          : 'Player Profile is live and ready to share.',
      );
      setEditOpen(false);
      await load(true);
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
      await load(true);
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

  const buildShareMessage = (url: string) => {
    const intro = `Hi, sharing ${name}'s Player Profile for your review.`;
    const clubNote = shareMessage.trim();
    const footballContext = [
      draftProfile.primary_position,
      draftProfile.current_club,
    ]
      .filter(Boolean)
      .join(' · ');

    return [
      intro,
      clubNote || null,
      footballContext,
      url,
    ]
      .filter(Boolean)
      .join('\n\n');
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
      const readyMessage = buildShareMessage(url);
      setShareResultUrl(url);
      setShareResultMessage(readyMessage);
      try {
        await navigator.clipboard.writeText(readyMessage);
        setNotice('Private Player Profile share created and message copied.');
      } catch {
        setNotice('Private Player Profile share created.');
      }
      await load(true);
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
      await load(true);
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

  const copyPreparedShare = async () => {
    if (!shareResultMessage) return;

    try {
      await navigator.clipboard.writeText(shareResultMessage);
      setNotice('Club-ready share message copied.');
    } catch {
      setNotice('Copy was blocked by the browser. You can still copy the message manually.');
    }
  };

  const sharePreparedProfile = async () => {
    if (!shareResultMessage) return;

    if (typeof navigator.share === 'function') {
      try {
        const nativeText = shareResultUrl
          ? shareResultMessage.replace(shareResultUrl, '').trim()
          : shareResultMessage;

        await navigator.share({
          title: `${name} Player Profile`,
          text: nativeText,
          url: shareResultUrl || undefined,
        });
        return;
      } catch (shareError: any) {
        if (shareError?.name === 'AbortError') return;
      }
    }

    await copyPreparedShare();
  };

  const openShareFollowUp = () => {
    if (!shareDeal) return;

    const deal = deals.find(
      (item: any) => String(item?.id || '') === shareDeal,
    );
    if (!deal?.id) return;

    const clubName =
      deal.club_name ||
      clubs.find(
        (club: any) =>
          String(club?.id || '') === String(deal.organisation_id || ''),
      )?.name ||
      'Linked club';
    const shareKey =
      shareResultUrl.split('/').pop() || shareDeal;

    setShareOpen(false);
    onOpenAction({
      key: `player-profile-follow-up:${shareKey}`,
      eyebrow: 'PLAYER PROFILE FOLLOW-UP',
      title: `${name} → ${clubName}`,
      instruction:
        'If you sent this Player Profile, choose the next concrete follow-up and when you will do it. The system will not invent the action or date.',
      label: 'Set follow-up',
      action: 'deal_step_prepare',
      payload: {
        deal_room_id: String(deal.id),
        step_type: 'set_next_action',
      },
      context: 'Private Player Profile link created',
      facts: [
        { label: 'Player', value: name },
        { label: 'Club', value: clubName },
        {
          label: 'External send',
          value: 'Not assumed',
          detail:
            'Only the private link creation is recorded. Confirm follow-up after the profile has actually been sent.',
        },
      ],
      successCondition:
        'The linked deal has one concrete future follow-up action and time owned by an active agency user.',
      confirmationLabel: 'Set follow-up',
    });
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
      await load(true);
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
      await load(true);
    } catch (videoError) {
      setError(friendlyError(videoError));
    } finally {
      setActionBusy('');
    }
  };

  const openShareComposer = () => {
    if (!canEdit) return;

    setShareResultUrl('');
    setShareResultMessage('');
    setShareMessage('');
    setShareExpiry('30');
    setShareDeal('');
    setShareClub('');
    setShareOpen(true);
    setShareClubsBusy(true);

    void invoke<any>('create_options')
      .then((response) => {
        const options = Array.isArray(response?.options?.clubs)
          ? response.options.clubs
          : [];

        setShareNetworkClubs(options);
      })
      .catch(() => undefined)
      .finally(() => setShareClubsBusy(false));
  };

  const toggleSection = (key: string) => {
    setField(
      'hidden_sections',
      form.hidden_sections.includes(key)
        ? form.hidden_sections.filter((item) => item !== key)
        : [...form.hidden_sections, key],
    );
  };

  const openEditor = () => {
    setForm(formFromProfile(bundle));
    setEditOpen(true);
  };

  const openEditorAt = (target: 'positioning' | 'video') => {
    setForm(formFromProfile(bundle));
    setEditOpen(true);
    window.setTimeout(() => {
      document
        .getElementById(`player-profile-${target}`)
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    }, 80);
  };

  const setVerifyField = <K extends keyof VerifyPlayerForm>(
    key: K,
    value: VerifyPlayerForm[K],
  ) =>
    setVerifyForm((current) => ({
      ...current,
      [key]: value,
    }));

  const openVerify = (focus: 'verification' | 'position' | 'contract-status' | 'contract-expiry' = 'verification') => {
    setVerifyForm(verifyFormFromPlayer(player));
    setVerifyFocus(focus);
    setVerifyError('');
    setVerifyOpen(true);
  };

  const openTransfermarkt = () => {
    setTransfermarktUrl(text(player.transfermarkt_url));
    setTransfermarktError('');
    setTransfermarktOpen(true);
  };

  const saveTransfermarkt = async () => {
    if (!canEdit || actionBusy) return;
    const url = transfermarktUrl.trim();
    if (url && !validTransfermarktPlayerUrl(url)) {
      setTransfermarktError('Paste the direct Transfermarkt player profile URL.');
      return;
    }

    setActionBusy('transfermarkt');
    setTransfermarktError('');
    setError('');
    setNotice('');

    try {
      await invoke('player_profile_transfermarkt_save', {
        player_id: playerId,
        url: url || null,
      });
      setTransfermarktOpen(false);
      setNotice(url ? 'Transfermarkt link saved.' : 'Transfermarkt link removed.');
      await load(true);
    } catch (saveError) {
      setTransfermarktError(friendlyError(saveError));
    } finally {
      setActionBusy('');
    }
  };

  const verifyPlayerData = async () => {
    if (!canEdit || actionBusy) return;
    if (!verifyForm.primary_position.trim()) {
      setVerifyError('Add the primary position before verifying this player.');
      return;
    }

    setActionBusy('player-verify');
    setVerifyError('');
    setError('');
    setNotice('');

    try {
      await invoke('player_profile_verify', {
        player_id: playerId,
        date_of_birth: verifyForm.date_of_birth || null,
        nationalities: verifyForm.nationalities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        height_cm: verifyForm.height_cm || null,
        preferred_foot: verifyForm.preferred_foot || null,
        primary_position: verifyForm.primary_position,
        current_club: verifyForm.current_club || null,
        current_country: verifyForm.current_country || null,
        contract_status: verifyForm.contract_status || null,
        contract_expiry: verifyForm.contract_expiry || null,
      });

      setVerifyOpen(false);
      setNotice('Current player data verified.');
      await load(true);
    } catch (verifyPlayerError) {
      setVerifyError(friendlyError(verifyPlayerError));
    } finally {
      setActionBusy('');
    }
  };

  const closeEditor = () => {
    setForm(formFromProfile(bundle));
    setEditOpen(false);
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
        <strong>Player Profile could not load</strong>
        <p>Nothing has been changed. Try again, or return to the player workspace.</p>
        <div className={styles.errorActions}>
          <button data-ui-button="secondary" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} />
            {loading ? 'Trying again...' : 'Try again'}
          </button>
          <Link href={backHref}>Back to player</Link>
        </div>
      </section>
    );
  }

  const brand = tenantBrandTokens({
    primary: agency.primary_color,
    secondary: agency.secondary_color,
    accent: agency.accent_color,
  });
  const theme = {
    '--profile-primary': brand.primary,
    '--profile-accent': brand.accent,
    '--profile-primary-raw': brand.primaryRaw,
    '--profile-accent-raw': brand.accentRaw,
    '--profile-on-primary': brand.onPrimary,
    '--profile-on-accent': brand.onAccent,
  } as React.CSSProperties;

  return (
    <div className={styles.root} style={theme}>
      <div className={styles.topbar}>
        <Link href={backHref} className={styles.back} aria-label="Back to players">
          <ArrowLeft size={15} />
          Players
        </Link>

        <button
          type="button"
          data-ui-button="secondary"
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

      {player.review_required_at || player.review_reason ? (
        <section className={`${styles.card} ${styles.reviewBanner}`} aria-label="Player data review">
          <div>
            <h3>Player data needs review</h3>
            <p>{player.review_reason || 'New player information needs checking.'}</p>
            <span>Check the recorded information before confirming it is current.</span>
          </div>
          {canEdit ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => openVerify('verification')}>Review updated data</button> : null}
        </section>
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

            <div className={styles.heroFacts}>
              {draftProfile.age_display ? (
                <span>Age {draftProfile.age_display}</span>
              ) : null}
              {Array.isArray(player.nationalities) && player.nationalities[0] ? (
                <span>{player.nationalities[0]}</span>
              ) : null}
              {player.contract_status ? (
                <span>{human(player.contract_status)}</span>
              ) : null}
              {player.contract_expiry ? (
                <span>Contract to {displayDate(player.contract_expiry)}</span>
              ) : null}
            </div>

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

        {(draftProfile.primary_video_url ||
          player.transfermarkt_url ||
          player.wyscout_url ||
          player.stats_url) ? (
          <div className={styles.profileLinks}>
            {draftProfile.primary_video_url ? (
              <a href={draftProfile.primary_video_url} target="_blank" rel="noreferrer">
                <Play size={13} />
                Watch video
              </a>
            ) : null}
            {player.transfermarkt_url ? (
              <a href={player.transfermarkt_url} target="_blank" rel="noreferrer">
                Transfermarkt
                <ExternalLink size={11} />
              </a>
            ) : null}
            {player.wyscout_url ? (
              <a href={player.wyscout_url} target="_blank" rel="noreferrer">
                Wyscout
                <ExternalLink size={11} />
              </a>
            ) : null}
            {!player.wyscout_url && player.stats_url ? (
              <a href={player.stats_url} target="_blank" rel="noreferrer">
                Stats
                <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className={styles.readiness}>
          <div className={styles.readinessTop}>
            <div>
              <span>Profile status</span>
              <strong>
                {published?.published
                  ? 'Live'
                  : verificationOnly
                    ? 'Ready to publish'
                    : canPublish
                      ? 'Ready to publish'
                      : missingRequiredCount === 1
                        ? missingRequiredChecks[0].missingTitle
                        : `${missingRequiredCount} required items missing`}
              </strong>
            </div>
          </div>

          <p>
            {published?.published
              ? missingOptionalChecks.length
                ? `Before sharing: ${(missingShareHighlights.length
                    ? missingShareHighlights
                    : missingOptionalChecks)
                    .slice(0, 3)
                    .map((item) => item.missingTitle)
                    .join(' · ')}`
                : 'Ready to share with clubs.'
              : verificationOnly
                ? `Confirm this current record once: ${[
                    player.primary_position,
                    player.current_club,
                    player.current_country,
                  ]
                    .filter(Boolean)
                    .join(' · ')}.`
                : canPublish
                  ? 'The required player information is ready.'
                  : missingRequiredCount === 1
                    ? missingRequiredChecks[0].where
                    : `Missing: ${missingRequiredChecks
                        .map((item) => item.missingTitle)
                        .join(' · ')}`}
          </p>
        </div>

        <div className={styles.heroActions}>
          {published?.published ? (
            <button
              type="button"
              data-ui-button="primary" data-ui-tone="inverse"
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
              data-ui-button="primary" data-ui-tone="inverse"
              className={styles.primaryAction}
              onClick={() =>
                void publishProfile({
                  saveFirst: false,
                  confirmCurrentData: verificationOnly,
                })
              }
              disabled={!canEdit || !canPublishFromHero || Boolean(actionBusy)}
            >
              {actionBusy === 'publish' ? (
                <LoaderCircle className={styles.spin} size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              {verificationOnly
                ? 'Verify & publish'
                : 'Publish Player Profile'}
            </button>
          )}

          {verificationOnly && canEdit ? (
            <button
              type="button"
              data-ui-button="secondary" data-ui-tone="inverse"
              className={styles.secondaryAction}
              onClick={() => openVerify('verification')}
            >
              <Eye size={15} />
              Check data
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              data-ui-button="secondary"
              data-ui-tone="inverse"
              className={styles.secondaryAction}
              onClick={openTransfermarkt}
            >
              <Link2 size={15} />
              {player.transfermarkt_url
                ? 'Edit Transfermarkt'
                : 'Add Transfermarkt'}
            </button>
          ) : null}

          <button
            type="button"
            data-ui-button="secondary"
            data-ui-tone="inverse"
            className={styles.secondaryAction}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={15} />
            Preview
          </button>

          <button
            type="button"
            data-ui-button="secondary"
            data-ui-tone="inverse"
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
              data-ui-button="secondary" data-ui-tone="inverse"
              className={styles.secondaryAction}
              onClick={openEditor}
            >
              <Pencil size={15} />
              Edit
            </button>
          ) : null}
        </div>
      </section>

      {guidedRequiredChecks.length || missingOptionalChecks.length ? (
        <section className={styles.fixGuide}>
          <div className={styles.fixGuideHead}>
            <div>
              <span className={styles.eyebrow}>
                {guidedRequiredChecks.length
                  ? 'REQUIRED BEFORE PUBLISHING'
                  : 'OPTIONAL IMPROVEMENTS'}
              </span>
              <h3>
                {guidedRequiredChecks.length
                  ? 'Finish these essentials'
                  : 'Improve before you send it'}
              </h3>
            </div>
            <small>
              {guidedRequiredChecks.length
                ? 'Complete the remaining required item below.'
                : 'Optional. Add only what makes the club decision easier.'}
            </small>
          </div>

          <div className={styles.fixGuideList}>
            {[...guidedRequiredChecks, ...missingOptionalChecks].map(
              (item) => (
                <article
                  key={item.key}
                  className={
                    item.important
                      ? styles.fixRequired
                      : styles.fixRecommended
                  }
                >
                  <div className={styles.fixState}>
                    {item.important ? 'Required' : 'Recommended'}
                  </div>

                  <div className={styles.fixCopy}>
                    <strong>{item.missingTitle}</strong>
                    <p>{item.missingDetail}</p>
                    <small>{item.where}</small>
                  </div>

                  <div className={styles.fixAction}>
                    {item.action === 'verify-player' ? (
                      <button
                        type="button"
                        onClick={() =>
                          openVerify(
                            item.key === 'position'
                              ? 'position'
                              : item.key === 'contract'
                                ? player.contract_status
                                  ? 'contract-expiry'
                                  : 'contract-status'
                              : 'verification',
                          )
                        }
                      >
                        {item.actionLabel}
                        <ShieldCheck size={13} />
                      </button>
                    ) : item.action === 'transfermarkt' ? (
                      <button type="button" onClick={openTransfermarkt}>
                        {item.actionLabel}
                        <Link2 size={13} />
                      </button>
                    ) : item.action === 'player-workspace' ? (
                      <Link href={backHref}>
                        {item.actionLabel}
                        <ArrowLeft
                          size={13}
                          style={{ transform: 'rotate(180deg)' }}
                        />
                      </Link>
                    ) : item.action === 'agency-settings' ? (
                      ['owner', 'admin'].includes(role) ? (
                        <Link href="/settings/agency">
                          {item.actionLabel}
                          <ExternalLink size={13} />
                        </Link>
                      ) : (
                        <span>Owner/admin required</span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          openEditorAt(
                            item.action === 'profile-video'
                              ? 'video'
                              : 'positioning',
                          )
                        }
                      >
                        {item.actionLabel}
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      ) : null}

      <div className={styles.columns}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <span className={styles.eyebrow}>WHAT CLUBS SEE</span>
              <h3>Player overview</h3>
            </div>
            <button
              type="button"
              data-ui-button="icon"
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
              <h3>Evidence</h3>
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
              <strong>{secondaryReady ? documents.length : '…'}</strong>
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
                Current-season numbers will appear automatically when trusted evidence is available.
              </p>
            ) : null}
          </div>

          {!parseKeyStats(form.key_stats_text).length &&
          bundle?.auto_stats_meta?.checked_at &&
          draftProfile.key_stats?.length ? (
            <div className={styles.statsFreshness}>
              <ShieldCheck size={13} />
              <span>
                {statsFreshnessLabel(bundle.auto_stats_meta.checked_at)} · Cross-checked
              </span>
              {bundle.auto_stats_meta.source_url ? (
                <a
                  href={bundle.auto_stats_meta.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source <ExternalLink size={11} />
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>RECENT COMMUNICATION</span>
            <h3>Recent activity</h3>
          </div>

          {Number(communicationSummary?.connected_items || 0) ? (
            <span className={styles.communicationCount}>
              {Number(communicationSummary.connected_items)}
            </span>
          ) : null}
        </div>

        {secondaryReady && communicationItems.length ? (
          <div className={styles.communicationList}>
            {communicationItems.slice(0, 6).map((item: any) => {
              const channel = String(item?.channel || '');
              const CommunicationIcon =
                channel.includes('email')
                  ? Mail
                  : MessageCircleMore;

              return (
                <article
                  className={styles.communicationRow}
                  key={item?.capture_id}
                >
                  <div className={styles.communicationIcon}>
                    <CommunicationIcon size={15} />
                  </div>

                  <div className={styles.communicationCopy}>
                    <small>
                      {human(channel || 'Connected')}
                      {item?.direction
                        ? ` · ${human(item.direction)}`
                        : ''}
                    </small>

                    <strong>
                      {item?.person_name ||
                        item?.organisation_name ||
                        'Connected activity'}
                    </strong>

                    <span>
                      {item?.summary ||
                        'Connected activity recorded.'}
                    </span>

                    <div className={styles.communicationFoot}>
                      <AgencyOwnershipChip
                        label="Owner"
                        name={item?.owner_name || null}
                      />
                      {item?.occurred_at ? (
                        <em>
                          {relativeDate(item.occurred_at)}
                        </em>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : secondaryReady ? (
          <div className={styles.empty}>
            <MessageCircleMore size={19} />
            <strong>No conversations linked yet.</strong>
            <span>
              Emails and chats linked to this player will appear here.
            </span>
          </div>
        ) : (
          <div className={styles.empty}>
            <LoaderCircle size={19} className={styles.spin} />
            <strong>Loading recent activity...</strong>
            <span>
              The Player Profile is ready while connected communication
              finishes loading.
            </span>
          </div>
        )}

        {communicationFollowups.length ? (
          <div className={styles.communicationFollowups}>
            <div className={styles.communicationFollowupHead}>
              <span>OPEN FOLLOW-UP</span>
              <strong>
                {communicationFollowups.length}
              </strong>
            </div>

            {communicationFollowups.slice(0, 3).map((task: any) => (
              <div
                className={styles.communicationFollowupRow}
                key={task?.task_id}
              >
                <div>
                  <strong>
                    {task?.title || 'Follow up'}
                  </strong>
                  <span>
                    {task?.due_at
                      ? relativeDate(task.due_at)
                      : 'No due date recorded'}
                  </span>
                </div>

                <AgencyOwnershipChip
                  label="Owner"
                  name={task?.owner_name || null}
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>PROFILE ACTIVITY</span>
            <h3>Club links</h3>
          </div>

          {published?.published ? (
            <button
              type="button"
              data-ui-button="secondary"
              className={styles.quietButton}
              onClick={openShareComposer}
            >
              <Link2 size={15} />
              Create link
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
                    data-ui-button="icon"
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
                    data-ui-button="icon"
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

          {!secondaryReady ? (
            <div className={styles.empty}>
              <LoaderCircle size={19} className={styles.spin} />
              <strong>Loading profile activity...</strong>
              <span>
                Share history is loading without delaying the Player Profile.
              </span>
            </div>
          ) : !shares.length ? (
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
            data-ui-button="tertiary"
              className={styles.textButton}
            onClick={unpublishProfile}
            disabled={Boolean(actionBusy)}
          >
            Unpublish Player Profile
          </button>
        </div>
      ) : null}

      {transfermarktOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget && !actionBusy) {
              setTransfermarktOpen(false);
            }
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Add Transfermarkt link"
          >
            <header>
              <div>
                <span className={styles.eyebrow}>PLAYER SOURCE</span>
                <h2>Add Transfermarkt</h2>
                <p>
                  Paste the direct player profile. It will stay on the player record as a source reference.
                </p>
              </div>
              <button
                type="button"
                data-ui-button="icon"
                className={styles.iconButton}
                onClick={() => setTransfermarktOpen(false)}
                aria-label="Close"
                disabled={Boolean(actionBusy)}
              >
                <X size={17} />
              </button>
            </header>

            <div className={styles.form}>
              {transfermarktError ? (
                <div className={styles.error}>{transfermarktError}</div>
              ) : null}
              <label>
                <span>Transfermarkt player URL</span>
                <input
                  type="url"
                  value={transfermarktUrl}
                  onChange={(event) => setTransfermarktUrl(event.target.value)}
                  placeholder="https://www.transfermarkt.com/player/profil/spieler/123456"
                  autoFocus
                />
                <small>Use the direct player profile, not a search or club page.</small>
              </label>
            </div>

            <footer>
              <button
                type="button"
                data-ui-button="secondary"
                className={styles.secondaryAction}
                onClick={() => setTransfermarktOpen(false)}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-ui-button="primary"
                className={styles.primaryAction}
                onClick={() => void saveTransfermarkt()}
                disabled={Boolean(actionBusy) || !transfermarktUrl.trim()}
              >
                {actionBusy === 'transfermarkt' ? (
                  <LoaderCircle className={styles.spin} size={16} />
                ) : (
                  <Link2 size={16} />
                )}
                Save link
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {verifyOpen ? (
        <div
          className={`${styles.modalBackdrop} ${styles.verifyBackdrop}`}
          onClick={(event) => {
            if (event.target === event.currentTarget && !actionBusy) {
              setVerifyOpen(false);
            }
          }}
        >
          <section
            className={`${styles.modal} ${styles.verifyModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Review current player data"
          >
            <header>
              <div>
                <span className={styles.eyebrow}>REVIEW PLAYER DATA</span>
                <h2>
                  {verifyFocus === 'position'
                    ? 'Add the position, then verify.'
                    : 'Check the current player record.'}
                </h2>
                <p>
                  Only change anything that is wrong. Confirming below saves
                  these values and marks the current record verified.
                </p>
              </div>

              <button
                type="button"
                data-ui-button="icon"
              className={styles.iconButton}
                onClick={() => setVerifyOpen(false)}
                aria-label="Close"
                disabled={Boolean(actionBusy)}
              >
                <X size={17} />
              </button>
            </header>

            <div className={styles.form}>
              {verifyError ? (
                <div className={styles.error}>
                  {verifyError}
                </div>
              ) : null}

              <div className={styles.verifyIdentity}>
                <strong>{name}</strong>
                <span>
                  {[player.current_club, player.current_country]
                    .filter(Boolean)
                    .join(' · ') || 'Current situation not fully recorded'}
                </span>
              </div>

              {player.review_required_at || player.review_reason ? (
                <section className={styles.reviewStats} aria-label="Statistics to review">
                  <strong>Current recorded statistics</strong>
                  <p>Check these figures against the source before confirming the player data.</p>
                  <div className={styles.keyStats}>
                    {(draftProfile.key_stats || []).slice(0, 6).map((item: any, index: number) => (
                      <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></div>
                    ))}
                    {!draftProfile.key_stats?.length ? <p>No current-season statistics are recorded.</p> : null}
                  </div>
                </section>
              ) : null}

              <div className={styles.twoFields}>
                <label>
                  <span>Primary position</span>
                  <input
                    value={verifyForm.primary_position}
                    onChange={(event) =>
                      setVerifyField('primary_position', event.target.value)
                    }
                    placeholder="e.g. Centre back"
                    autoFocus={verifyFocus === 'position'}
                    required
                  />
                  <small>Required before the Player Profile can publish.</small>
                </label>

                <label>
                  <span>Current club</span>
                  <input
                    value={verifyForm.current_club}
                    onChange={(event) =>
                      setVerifyField('current_club', event.target.value)
                    }
                    placeholder="Current club"
                  />
                </label>

                <label>
                  <span>Country</span>
                  <input
                    value={verifyForm.current_country}
                    onChange={(event) =>
                      setVerifyField('current_country', event.target.value)
                    }
                    placeholder="Current country"
                  />
                </label>

                <label>
                  <span>Date of birth</span>
                  <input
                    type="date"
                    value={verifyForm.date_of_birth}
                    onChange={(event) =>
                      setVerifyField('date_of_birth', event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Nationality</span>
                  <input
                    value={verifyForm.nationalities}
                    onChange={(event) =>
                      setVerifyField('nationalities', event.target.value)
                    }
                    placeholder="New Zealand, England"
                  />
                  <small>Separate multiple nationalities with commas.</small>
                </label>

                <label>
                  <span>Preferred foot</span>
                  <input
                    value={verifyForm.preferred_foot}
                    onChange={(event) =>
                      setVerifyField('preferred_foot', event.target.value)
                    }
                    placeholder="Right / Left / Both"
                  />
                </label>

                <label>
                  <span>Height</span>
                  <input
                    inputMode="numeric"
                    value={verifyForm.height_cm}
                    onChange={(event) =>
                      setVerifyField('height_cm', event.target.value)
                    }
                    placeholder="cm"
                  />
                </label>

                <label>
                  <span>Contract status</span>
                  <input
                    value={verifyForm.contract_status}
                    onChange={(event) =>
                      setVerifyField('contract_status', event.target.value)
                    }
                    autoFocus={verifyFocus === 'contract-status'}
                    placeholder="Under contract / Free agent"
                  />
                </label>

                <label>
                  <span>Contract expiry</span>
                  <input
                    type="date"
                    value={verifyForm.contract_expiry}
                    onChange={(event) =>
                      setVerifyField('contract_expiry', event.target.value)
                    }
                    autoFocus={verifyFocus === 'contract-expiry'}
                  />
                </label>
              </div>

              <div className={styles.verifyConfirmNote}>
                <ShieldCheck size={17} />
                <div>
                  <strong>Confirm this is current</strong>
                  <span>
                    This is a human verification step. If the player data
                    changes later, you will be asked to verify it again.
                  </span>
                </div>
              </div>
            </div>

            <footer>
              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={() => setVerifyOpen(false)}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>

              <button
                type="button"
                data-ui-button="primary"
              className={styles.primaryAction}
                onClick={() => void verifyPlayerData()}
                disabled={
                  Boolean(actionBusy) ||
                  !verifyForm.primary_position.trim()
                }
              >
                {actionBusy === 'player-verify' ? (
                  <LoaderCircle className={styles.spin} size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Confirm & verify
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Edit Player Profile"
          >
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
                data-ui-button="icon"
              className={styles.iconButton}
                onClick={closeEditor}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>

            <div className={styles.form}>
              <label id="player-profile-positioning">
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

              <div
                className={styles.mediaEditor}
                id="player-profile-video"
              >
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
                      <button data-ui-button="icon"
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
                  <button data-ui-button="primary"
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
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={closeEditor}
              >
                Cancel
              </button>

              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={() => void saveSettings()}
                disabled={actionBusy === 'save'}
              >
                Save
              </button>

              <button
                type="button"
                data-ui-button="primary"
              className={styles.primaryAction}
                onClick={() => void publishProfile()}
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
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (
              event.target === event.currentTarget &&
              actionBusy !== 'share'
            ) {
              setShareOpen(false);
            }
          }}
        >
          <section
            className={`${styles.modal} ${styles.shareModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Share Player Profile"
          >
            <header>
              <div>
                <span className={styles.eyebrow}>SHARE PLAYER PROFILE</span>
                <h2>{shareResultUrl ? 'Ready to send.' : 'Who is this profile for?'}</h2>
                <p>
                  {shareResultUrl
                    ? 'The private link is live and the club message is prepared.'
                    : 'Create one private link for the club. Opens are tracked and the link stays attached to the player.'}
                </p>
              </div>
              <button
                type="button"
                data-ui-button="icon"
              className={styles.iconButton}
                onClick={() => setShareOpen(false)}
                disabled={actionBusy === 'share'}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>

            {shareResultUrl ? (
              <div className={styles.shareSuccess}>
                <Check size={20} />
                {shareResultMessage ? (
                  <>
                    <strong>Club share ready.</strong>
                    <p>
                      Your introduction, key player context and private tracked
                      profile link are ready.
                    </p>
                    <div className={styles.sharePreparedMessage}>
                      {shareResultMessage}
                    </div>
                    <div className={styles.shareSuccessActions}>
                      <button data-ui-button="primary"
                        type="button"
                        onClick={() => void sharePreparedProfile()}
                      >
                        <Send size={15} />
                        Share now
                      </button>
                      <button
                        type="button"
                        data-ui-button="secondary"
              className={styles.shareUtilityButton}
                        onClick={() => void copyPreparedShare()}
                      >
                        <Copy size={15} />
                        Copy message
                      </button>
                      <button
                        type="button"
                        data-ui-button="secondary"
              className={styles.shareUtilityButton}
                        onClick={() => copyShare(shareResultUrl.split('/').pop() || '')}
                      >
                        <Link2 size={15} />
                        Copy link
                      </button>
                    </div>
                    {shareDeal ? (
                      <button
                        type="button"
                        data-ui-button="primary"
              className={styles.shareFollowUpButton}
                        onClick={openShareFollowUp}
                      >
                        <Clock3 size={15} />
                        Set follow-up
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <strong>Profile link ready.</strong>
                    <p>{shareResultUrl}</p>
                    <button
                      type="button"
                      onClick={() => copyShare(shareResultUrl.split('/').pop() || '')}
                    >
                      <Copy size={15} />
                      Copy link
                    </button>
                  </>
                )}
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
                    <option value="">
                      {shareClubsBusy && !shareClubOptions.length
                        ? 'Loading clubs...'
                        : 'Choose club'}
                    </option>
                    {shareClubOptions.map((club: any) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                        {club.country ? ` · ${club.country}` : ''}
                      </option>
                    ))}
                  </select>
                  <small>
                    {shareClubsBusy
                      ? 'Loading your agency club network...'
                      : 'Choose any club already recorded in your agency network.'}
                  </small>
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
                  <span>Club-specific note</span>
                  <textarea
                    rows={3}
                    value={shareMessage}
                    onChange={(event) =>
                      setShareMessage(event.target.value)
                    }
                    placeholder="Optional context for this club."
                  />
                  <small>
                    This appears in the private profile and the prepared message.
                    Leave it blank and the introduction stays concise.
                  </small>
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
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={() => setShareOpen(false)}
                disabled={actionBusy === 'share'}
              >
                {shareResultUrl ? 'Done' : 'Cancel'}
              </button>

              {!shareResultUrl ? (
                <button
                  type="button"
                  data-ui-button="primary"
              className={styles.primaryAction}
                  onClick={createShare}
                  disabled={
                    !shareClub ||
                    actionBusy === 'share'
                  }
                >
                  <Send size={15} />
                  Create club share
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

            <button data-ui-button="secondary"
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
