'use client';

import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import { createPortal } from 'react-dom';
import { withProfileStatEvidence } from '@/supabase/functions/_shared/profile-stat-evidence';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,BarChart3,Check,ChevronDown,Clock3,Copy,Download,Eye,ExternalLink,Link2,LoaderCircle,Mail,MessageCircleMore,Pencil,Play,RefreshCw,Send,ShieldCheck,Sparkles,Trash2,X} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import CapturePreparationBrief from '@/components/CapturePreparationBrief';
import { type PreparationLink } from '@/lib/capture-preparation';
import PublicProfile from '@/components/PublicProfile';
import AgencyOwnershipChip from '@/components/AgencyOwnershipChip';
import AgencyPlayerDataPanel from '@/components/AgencyPlayerDataPanel';
import ToolsMenu from '@/components/ToolsMenu';
import PlayerProfilePhoto from '@/components/PlayerProfilePhoto';
import PlayerStaffControl from '@/components/PlayerStaffControl';
import RecordContactActions from '@/components/RecordContactActions';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import {
  friendlyError,
  relativeDate,
  compactDateTime,
} from '@/lib/platform-client';
import {
  getCachedPlayerProfile,
  prefetchPlayerProfile,
  setCachedPlayerProfile,
} from '@/lib/player-profile-cache';
import { publicFile } from '@/lib/supabase';
import { safeSourceUrl } from '@/lib/player-data-workflow';
import {readWithDeadline} from '@/lib/read-with-deadline';
import { tenantBrandTokens } from '@/lib/tenant-brand-style';

import styles from './AgencyPlayerProfile.module.css';

type AgencyInvoke = <T = any>(
  action: string,
  body?: Record<string, unknown>,
) => Promise<T>;

type Props = {
  playerId: string;
  preparation?: PreparationLink | null;
  backHref: string;
  workHref?: string;
  cacheScope?: string;
  role: string;
  fallbackAgency: Record<string, any>;
  invoke: AgencyInvoke;
  rpc?: <T = any>(name: string, args?: Record<string, unknown>) => Promise<T>;
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
  selected_stat_refs: string[];
  selected_video_id: string | null;
  experience_text: string;
  hide_market_value: boolean;
  market_value_display: string;
  market_value_source_url: string;
  hidden_sections: string[];
};

type ProfileKind = 'general' | 'club';
type ImprovementStyle = 'shorter' | 'clearer' | 'football_focused' | 'more_direct' | 'tailor_to_club';
type ProfileStat = {
  ref: string;
  label: string;
  value: string | number;
  seasonLabel?: string | null;
  competition?: string | null;
  source?: { name?: string | null; status?: string | null } | null;
};
type ProfileVideo = { id: string; title: string; url: string };
type PlayerContextProposal = {
  fields: Partial<{
    current_club: string;
    current_league: string;
    current_country: string;
    current_season_label: string;
    primary_position: string;
    transfermarkt_url: string;
    stats_url: string;
  }>;
  confidence: number;
  reason: string;
  sources: { title?: string; url: string }[];
};
type ProfileProposal = {
  kind: ProfileKind;
  headline: string;
  why_review: string;
  selected_stat_refs: string[];
  selected_video_id: string | null;
  hidden_sections: string[];
  source_fingerprint: string;
  club_name?: string | null;
  club_requirement?: { title?: string | null; position?: string | null } | null;
};
type ProfileVersion = {
  id: string;
  organisation_id: string;
  deal_room_id?: string | null;
  club_name?: string | null;
  headline?: string | null;
  created_at?: string | null;
  status?: string | null;
  presentation?: Record<string, any> | null;
  new_player_data_available?: boolean;
};
type ProfileReview = {
  status: 'ready' | 'suggestions';
  suggestions: { code: string; message: string }[];
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
  selected_stat_refs: [],
  selected_video_id: null,
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
    why_review: String(settings.why_review ?? ''),
    career_summary: String(settings.career_summary ?? ''),
    key_stats_text: Array.isArray(settings.key_stats)
      ? settings.key_stats
          .filter((item: any) => item?.label && item?.value)
          .map((item: any) => `${item.label}: ${item.value}`)
          .join('\n')
      : '',
    selected_stat_refs: Array.isArray(settings.selected_stat_refs)
      ? settings.selected_stat_refs.filter((value: unknown) => typeof value === 'string')
      : [],
    selected_video_id: text(settings.selected_video_id) || null,
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
  const statLabels: Record<string, string> = {
    appearances: 'Apps',
    starts: 'Starts',
    minutes: 'Minutes',
    goals: 'Goals',
    assists: 'Assists',
  };
  const selectedStats = form.selected_stat_refs.map((ref) => {
    const separator = ref.lastIndexOf(':');
    if (separator < 1) return null;
    const row = career.find((item: any) => String(item.id) === ref.slice(0, separator));
    const field = ref.slice(separator + 1);
    if (!row || !Object.hasOwn(statLabels, field)) return null;
    const value = row[field];
    if (value === null || value === undefined || value === '') return null;
    return withProfileStatEvidence({
      label: statLabels[field],
      value: String(value),
    },row);
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const keyStats = form.selected_stat_refs.length
    ? selectedStats
    : customStats.length
      ? customStats
      : Array.isArray(bundle?.auto_key_stats)
        ? bundle.auto_key_stats.map((stat: any) => withProfileStatEvidence(stat,bundle.auto_stats_meta || {}))
        : [];
  const featuredVideo = videos.find(
    (item: any) => String(item.id) === form.selected_video_id,
  );
  const orderedVideos = featuredVideo
    ? [featuredVideo, ...videos.filter((item: any) => item.id !== featuredVideo.id)]
    : videos.filter((item: any) => item.featured).length
      ? [...videos.filter((item: any) => item.featured), ...videos.filter((item: any) => !item.featured)]
      : videos;
  const selectedVideos = orderedVideos.slice(0, 4);
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
  playerId, preparation,
  backHref,
  workHref,
  cacheScope = '',
  role,
  fallbackAgency,
  invoke,
  rpc,
  onOpenAction,
  onOpenIntelligence,
}: Props) {
  const initialProfile = getCachedPlayerProfile(playerId, cacheScope);
  const [bundle, setBundle] = useState<any>(() => initialProfile);
  const [form, setForm] = useState<ProfileForm>(() =>
    initialProfile ? formFromProfile(initialProfile) : emptyForm,
  );
  useEffect(() => {
    if (bundle) setCachedPlayerProfile(playerId, bundle, cacheScope);
  }, [bundle, playerId, cacheScope]);
  const [loading, setLoading] = useState(!initialProfile);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editorSection, setEditorSection] = useState<'story' | 'presentation' | 'video'>('story');
  const editorDialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!editOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();

    const focusFirst = () => {
      Array.from(editorDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') || []).find(node => node.getClientRects().length > 0)?.focus();
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !editorDialog.current?.contains(event.target)) focusFirst();
    };
    const recoverFocus = (event: KeyboardEvent) => {
      // Disabling Save can move focus to the document while a write finishes.
      // Escape still belongs to this modal; the current button preserves its busy guard.
      if (event.key === 'Escape' && !editorDialog.current?.contains(document.activeElement)) {
        const close = editorDialog.current?.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
        if (close && !close.disabled) { event.preventDefault(); close.click(); }
        return;
      }
      if (event.key === 'Tab' && !editorDialog.current?.contains(document.activeElement)) {
        event.preventDefault(); focusFirst();
      }
    };
    document.addEventListener('focusin', containFocus);
    document.addEventListener('keydown', recoverFocus);
    Array.from(editorDialog.current?.querySelectorAll<HTMLElement>('input, textarea') || []).find(node => node.getClientRects().length > 0)?.focus();
    return () => {
      releaseScroll();
      document.removeEventListener('focusin', containFocus);
      document.removeEventListener('keydown', recoverFocus);
      queueMicrotask(() => { if (opener?.isConnected) opener.focus(); });
    };
  }, [editOpen]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyFocus, setVerifyFocus] = useState<'verification' | 'position' | 'contract-status' | 'contract-expiry'>(
    'verification',
  );
  const [verifyForm, setVerifyForm] =
    useState<VerifyPlayerForm>(emptyVerifyForm);
  const [verifyError, setVerifyError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewDialog = useRef<HTMLDivElement>(null);
  const previewClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!previewOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockPageScroll();
    const releaseBackground = isolateElements(Array.from(document.body.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && !node.contains(previewDialog.current),
    ));
    const focusClose = () => previewClose.current?.focus({preventScroll: true});
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !previewDialog.current?.contains(event.target)) focusClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setPreviewOpen(false); return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(previewDialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ) || []).filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!previewDialog.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('focusin', containFocus);
    document.addEventListener('keydown', key, true);
    focusClose();
    return () => {
      document.removeEventListener('focusin', containFocus);
      document.removeEventListener('keydown', key, true);
      releaseBackground(); releaseScroll();
      queueMicrotask(() => { if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll: true}); });
    };
  }, [previewOpen]);
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
  const [shareVersionId, setShareVersionId] = useState('');
  const [showOlderLinks, setShowOlderLinks] = useState(false);
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const preparationId = useId();
  const [prepareKind, setPrepareKind] = useState<ProfileKind>('general');
  const [prepareClub, setPrepareClub] = useState('');
  const [prepareDeal, setPrepareDeal] = useState('');
  const [proposal, setProposal] = useState<ProfileProposal | null>(null);
  const [evidenceStats, setEvidenceStats] = useState<ProfileStat[]>([]);
  const [evidenceVideos, setEvidenceVideos] = useState<ProfileVideo[]>([]);
  const [preparedVersionId, setPreparedVersionId] = useState('');
  const [preparedSaved, setPreparedSaved] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [contextProposal, setContextProposal] = useState<PlayerContextProposal | null>(null);
  const [preparationStep, setPreparationStep] = useState('');
  const [statisticsStatusVersion, setStatisticsStatusVersion] = useState(0);
  const preparationRun = useRef(0), preparationBusy = useRef(false);
  useEffect(() => {
    preparationBusy.current = false;
    setActionBusy(''); setPreparationStep(''); setPrepareOpen(false); setProposal(null); setContextProposal(null);
    return () => {++preparationRun.current;};
  }, [playerId, cacheScope]);
  const [profileReview, setProfileReview] = useState<ProfileReview | null>(null);
  const [improveSection, setImproveSection] = useState<'headline' | 'why_review' | null>(null);
  const [improveStyle, setImproveStyle] = useState<ImprovementStyle>('clearer');
  const [improvement, setImprovement] = useState<{
    section: 'headline' | 'why_review';
    originalText: string;
    suggestedText: string;
    status: 'suggested' | 'unchanged';
  } | null>(null);
  const [previewProfile, setPreviewProfile] = useState<any>(null);
  useEffect(() => {
    setPreviewOpen(false); setPreviewProfile(null);
  }, [playerId, cacheScope]);
  const [previewLabel, setPreviewLabel] = useState('PLAYER PROFILE PREVIEW');
  const [transfermarktOpen, setTransfermarktOpen] = useState(false);
  const [transfermarktUrl, setTransfermarktUrl] = useState('');
  const [transfermarktError, setTransfermarktError] = useState('');

  const loadGeneration = useRef(0);
  const load = useCallback(async (fresh = false, preserveDraft = false) => {
    const generation = ++loadGeneration.current;
    const cached = getCachedPlayerProfile(playerId, cacheScope);
    if (!cached) setLoading(true);
    setError('');

    try {
      let profile: any = null;

      try {
        profile = fresh
          ? (await readWithDeadline(invoke<any>('player_profile_core', {
              player_id: playerId,
            })))?.profile || null
          : await readWithDeadline(prefetchPlayerProfile(playerId, invoke, cacheScope));
      } catch {
        profile =
          (await readWithDeadline(invoke<any>('player_profile', {
            player_id: playerId,
          })))?.profile || null;
      }

      if (!profile) {
        throw new Error('Player profile could not load.');
      }

      if (generation !== loadGeneration.current) return false;
      setBundle(profile);
      if (!preserveDraft) setForm(formFromProfile(profile));
      setLoading(false);

      if (profile.secondary_ready === false) {
        void invoke<any>('player_profile_detail', {
          player_id: playerId,
        })
          .then((response) => {
            const detail = response?.detail || null;
            if (!detail || generation !== loadGeneration.current) return;

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
              return next;
            });
          })
          .catch(() => undefined);
      }
      return true;
    } catch (loadError) {
      if (generation !== loadGeneration.current) return false;
      setError(friendlyError(loadError));
      setLoading(false);
      return false;
    }
  }, [invoke, playerId, cacheScope]);

  useEffect(() => {
    void load(false);
    return () => { ++loadGeneration.current; };
  }, [load]);

  const reloadRecordedData = useCallback(() => load(true, true), [load]);

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
  const liveShares = shares.filter((share: any) => ['Ready', 'Opened'].includes(shareStatus(share)));
  const olderShares = shares.filter((share: any) => ['Revoked', 'Expired'].includes(shareStatus(share)));
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
  const proposalPreview = useMemo(() => {
    if (!proposal) return null;
    const chosenVideo = evidenceVideos.find(
      (video) => video.id === proposal.selected_video_id,
    );
    return {
      ...draftProfile,
      headline: proposal.headline,
      why_review: proposal.why_review || null,
      key_stats: proposal.selected_stat_refs
        .map((ref) => evidenceStats.find((stat) => stat.ref === ref))
        .filter((stat): stat is ProfileStat => Boolean(stat))
        .map((stat) => ({
          label: stat.label,
          value: String(stat.value),
          season_label: stat.seasonLabel || null,
          source_name: stat.source?.name || null,
        })),
      primary_video_url: chosenVideo?.url || draftProfile.primary_video_url || null,
      selected_videos: chosenVideo
        ? [{ title: chosenVideo.title, url: chosenVideo.url }]
        : draftProfile.selected_videos,
      hidden_sections: proposal.hidden_sections,
    };
  }, [draftProfile, evidenceStats, evidenceVideos, proposal]);
  const shareableVersions = versions.filter(
    (version) =>
      version.status === 'approved' &&
      version.organisation_id === shareClub &&
      (!version.deal_room_id || version.deal_room_id === shareDeal),
  );

  const recordedStats = Array.isArray(bundle?.auto_key_stats) ? bundle.auto_key_stats : [];
  const recordedStatsSource = safeSourceUrl(bundle?.auto_stats_meta?.source_url);
  const automaticClubStats=!form.selected_stat_refs.length&&!parseKeyStats(form.key_stats_text).length;
  const selectedClubStatRows=[...new Map(form.selected_stat_refs.flatMap(ref=>{
    const separator=ref.lastIndexOf(':');
    const field=ref.slice(separator+1);
    if(separator<1||!['appearances','starts','minutes','goals','assists'].includes(field))return [];
    const row=career.find((item:any)=>String(item.id)===ref.slice(0,separator));
    if(!row||row[field]===null||row[field]===undefined||row[field]==='')return [];
    return row?[[String(row.id),row] as const]:[];
  })).values()];
  const clubStatSourceUrls=automaticClubStats?(recordedStatsSource?[recordedStatsSource]:[]):
    [...new Set(selectedClubStatRows.map(row=>safeSourceUrl(row.source_url)).filter((url):url is string=>Boolean(url)))];
  const clubStatContexts=(automaticClubStats?[bundle?.auto_stats_meta||{}]:selectedClubStatRows).map((row:any)=>{
    const date=row.checked_at||row.source_reviewed_at||row.source_synced_at||row.data_updated_at;
    return {
      scope:[row.season_label,row.club_name,row.league].filter(Boolean).join(' · ')||'Period not recorded',
      source:row.source_name||row.source_provider||row.provider||'Source not recorded',
      date:date&&Number.isFinite(Date.parse(String(date)))?String(date):null,
      dateLabel:row.checked_at?'Checked':row.source_reviewed_at?'Reviewed':'Updated',
    };
  });

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
        'Review, correct and verify the player data.',
      where:
        'Player Profile → Review current data → Confirm & verify',
      action: 'verify-player',
      actionLabel: 'Review & verify',
    },
    {
      key: 'position',
      label: 'Position added',
      ok: Boolean(player.primary_position),
      important: true,
      missingTitle: 'Add the primary position',
      missingDetail:
        'Add the primary position before publishing.',
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
        'Add a reply email before publishing.',
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
        'Add a player photo.',
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
        'Add at least one career entry.',
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
        'Add a current player video.',
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
        'Add a trusted profile link.',
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
        ? 'Add the contract expiry date.'
        : 'Add the contract status.',
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
        'Add a short player headline.',
      where:
        'Edit profile headline',
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
  const canEdit = !bundle?.access?.restricted && ['owner', 'admin', 'agent', 'operations'].includes(
    role,
  );
  const canEditStatistics = canEdit || (bundle?.access?.can_edit_statistics === true && ['agent','operations'].includes(role));
  const primaryRequiredCheck = guidedRequiredChecks[0] || null;
  const primaryMoveBlocked =
    primaryRequiredCheck?.action === 'agency-settings' &&
    !['owner', 'admin'].includes(role);

  const setField = <K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

  const useRecordedStats = async () => {
    if (!canEdit || actionBusy) return;
    setActionBusy('recorded-statistics');
    setError('');
    try {
      await invoke('player_profile_save', {
        player_id: playerId,
        settings: { key_stats: [], selected_stat_refs: [] },
      });
      setForm(current => ({...current, key_stats_text: '', selected_stat_refs: []}));
      setBundle((current: any) => current ? {...current, settings: {...current.settings, key_stats: [], selected_stat_refs: []}} : current);
      setNotice('Statistics updated. Publish when ready.');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setActionBusy('');
    }
  };

  const saveSettings = async (
    showNotice = true,
    overrides: Partial<ProfileForm> = {},
  ) => {
    if (!canEdit || actionBusy) return false;
    const nextForm = { ...form, ...overrides };
    if (nextForm.why_review.length > 1200 || nextForm.career_summary.length > 1200) {
      setError('Keep the overview and career summary to 1,200 characters each. Your full draft is still here.');
      return false;
    }
    setActionBusy('save');
    setError('');
    if (showNotice) setNotice('');
    const savedSettings = {
      intro_line: nextForm.intro_line,
      why_review: nextForm.why_review,
      career_summary: nextForm.career_summary,
      key_stats: parseKeyStats(nextForm.key_stats_text),
      selected_stat_refs: nextForm.selected_stat_refs,
      selected_video_id: nextForm.selected_video_id,
      notable_experience: parseLines(nextForm.experience_text),
      hide_market_value: nextForm.hide_market_value,
      market_value_display: nextForm.market_value_display,
      market_value_source_url: nextForm.market_value_source_url,
      hidden_sections: nextForm.hidden_sections,
    };
    try {
      await invoke('player_profile_save', {
        player_id: playerId,
        settings: savedSettings,
      });
      setBundle((current: any) => current ? { ...current, settings: { ...(current.settings || {}), ...savedSettings } } : current);
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

  const loadVersions = async () => {
    setVersionsBusy(true);
    try {
      const response = await invoke<any>('player_profile_versions', {
        player_id: playerId,
      });
      const next = Array.isArray(response?.versions) ? response.versions : [];
      setVersions(next);
      setShareVersionId((current) => current && !next.some(
        (version: ProfileVersion) => version.id === current && version.status === 'approved',
      ) ? '' : current);
      return next as ProfileVersion[];
    } finally {
      setVersionsBusy(false);
    }
  };

  const openProfilePreview = (profile: any, label = 'PLAYER PROFILE PREVIEW') => {
    setPreviewProfile(profile);
    setPreviewLabel(label);
    setPreviewOpen(true);
  };

  const openPrepare = (start = false) => {
    if (!canEdit) return;
    if (start && !proposal && !contextProposal) {
      setPrepareKind('general');
      setPrepareOpen(true);
      void prepareProfile('general');
    }
    requestAnimationFrame(() => document.getElementById('player-profile-prepare')?.scrollIntoView({behavior: 'smooth', block: 'start'}));
    if (prepareOpen) {
      document.getElementById('player-profile-prepare')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }
    setPrepareOpen(true);
    if (shareNetworkClubs.length || shareClubsBusy) return;
    setShareClubsBusy(true);
    void invoke<any>('create_options')
      .then((response) => {
        setShareNetworkClubs(Array.isArray(response?.options?.clubs)
          ? response.options.clubs
          : []);
      })
      .catch(() => undefined)
      .finally(() => setShareClubsBusy(false));
  };

  const editProposal = (patch: Partial<ProfileProposal>) => {
    setProposal((current) => current ? { ...current, ...patch } : current);
    setPreparedSaved(false);
    setPreparedVersionId('');
    setProfileReview(null);
    setImprovement(null);
  };

  const adoptPreparedProfile = (response: any, kind: ProfileKind = prepareKind) => {
    const incoming = response?.proposal;
    if (!incoming || !text(incoming.source_fingerprint)) {
      throw new Error('The profile could not be prepared. Try again.');
    }
    const stats: ProfileStat[] = Array.isArray(response?.evidence?.stats)
      ? response.evidence.stats.filter((item: ProfileStat) => item?.ref && item?.label)
      : [];
    const videos: ProfileVideo[] = Array.isArray(response?.evidence?.videos)
      ? response.evidence.videos.filter((item: ProfileVideo) => item?.id && item?.url)
      : [];
    const availableRefs = new Set(stats.map((item) => item.ref));
    const selectedRefs = Array.isArray(incoming.selected_stat_refs)
      ? incoming.selected_stat_refs.filter((ref: unknown) =>
          typeof ref === 'string' && availableRefs.has(ref))
      : [];
    const videoId = text(incoming.selected_video_id);
    setEvidenceStats(stats);
    setEvidenceVideos(videos);
    setAiAvailable(response?.ai_available === true);
    setImproveSection(null);
    setProposal({
      kind,
      headline: text(incoming.headline),
      why_review: text(incoming.why_review),
      selected_stat_refs: selectedRefs.slice(0, 6),
      selected_video_id: videos.some((video) => video.id === videoId) ? videoId : null,
      hidden_sections: Array.isArray(incoming.hidden_sections)
        ? incoming.hidden_sections.filter((value: unknown) => typeof value === 'string')
        : form.hidden_sections,
      source_fingerprint: text(incoming.source_fingerprint),
      club_name: text(incoming.club_name) || null,
      club_requirement: incoming.club_requirement && typeof incoming.club_requirement === 'object'
        ? { title: text(incoming.club_requirement.title) || null, position: text(incoming.club_requirement.position) || null }
        : null,
    });
    setPreparedSaved(false);
    setPreparedVersionId('');
    setImprovement(null);
  };

  const refreshPreparationStats = async (current: () => boolean) => {
    setPreparationStep('Checking current-season statistics...');
    const started = await readWithDeadline(invoke<any>('player_data_refresh', {player_id: playerId, request_id: crypto.randomUUID()}));
    if (!current()) return false;
    setStatisticsStatusVersion(value => value + 1);
    let job = started?.job || null;
    if (!job?.id || !job?.status) throw new Error('The statistics check could not be confirmed. Check its progress before trying again.');
    for (let attempt = 0; attempt < 32 && ['queued', 'running'].includes(String(job.status)); attempt++) {
      if (!current()) return false;
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!current()) return false;
      job = (await readWithDeadline(invoke<any>('player_data_status', {player_id: playerId})))?.job || job;
    }
    if (!current()) return false;
    setStatisticsStatusVersion(value => value + 1);
    if (['queued', 'running'].includes(String(job.status))) setNotice('Statistics are still updating. This draft uses the recorded evidence available now.');
    else if (job.status === 'needs_review') setNotice('New statistics are ready for review below. This draft uses the recorded figures until you accept them.');
    else if (job.status === 'failed') setNotice('Statistics could not refresh. This draft uses the recorded evidence available now.');
    else if (await load(true, true) === false) throw new Error('Statistics were checked, but the player record could not reload. Try again.');
    return current();
  };

  const prepareProfile = async (kind: ProfileKind = prepareKind) => {
    if (!canEdit || actionBusy || preparationBusy.current || (kind === 'club' && !prepareClub)) return;
    preparationBusy.current = true;
    const run = ++preparationRun.current, current = () => run === preparationRun.current;
    setActionBusy('prepare');
    setError('');
    setNotice('');
    setProfileReview(null);
    try {
      const playerContext = bundle?.player || {};
      const statMeta = bundle?.auto_stats_meta || {};
      const checkedAt = text(statMeta.checked_at || statMeta.data_updated_at);
      const checkedMs = checkedAt ? Date.parse(checkedAt) : 0;
      const currentStatsFresh = Boolean(
        recordedStats.length &&
        Number.isFinite(checkedMs) &&
        Date.now() - checkedMs <= 20 * 60 * 60 * 1000,
      );
      const canRefreshStats = Boolean(
        playerContext.current_season_label &&
        playerContext.current_club &&
        playerContext.current_league,
      );

      if (!canRefreshStats || !playerContext.primary_position || !playerContext.current_country) {
        setPreparationStep('Finding missing player details...');
        const researched = await readWithDeadline(invoke<any>('player_context_research', { player_id: playerId }), 35000);
        if (!current()) return;
        const fields = researched?.proposal?.fields || {};
        if (researched?.proposal && Object.keys(fields).length) {
          setContextProposal({
            fields,
            confidence: Number(researched.proposal.confidence || 0),
            reason: text(researched.proposal.reason),
            sources: Array.isArray(researched.proposal.sources) ? researched.proposal.sources : [],
          });
          return;
        }
        if (!canRefreshStats) throw new Error('AI could not confidently identify the missing current club, competition and season. Review the player details and try again.');
      }

      setContextProposal(null);
      if (canRefreshStats && !currentStatsFresh) {
        if (!await refreshPreparationStats(current)) return;
      }

      setPreparationStep('Preparing your editable profile...');
      const response = await readWithDeadline(invoke<any>('player_profile_prepare', {
        player_id: playerId,
        kind,
        ...(kind === 'club'
          ? { organisation_id: prepareClub, deal_room_id: prepareDeal || null }
          : {}),
      }), 35000);
      if (current()) adoptPreparedProfile(response, kind);
    } catch (prepareError) {
      if (current()) setError(friendlyError(prepareError));
    } finally {
      if (current()) {preparationBusy.current = false; setActionBusy(''); setPreparationStep('');}
    }
  };

  const applyPlayerContextAndContinue = async () => {
    if (!contextProposal || actionBusy || preparationBusy.current) return;
    preparationBusy.current = true;
    const run = ++preparationRun.current, current = () => run === preparationRun.current;
    setActionBusy('context-apply');
    setError('');
    setNotice('');
    try {
      setPreparationStep('Saving reviewed player details...');
      await readWithDeadline(invoke<any>('player_context_apply', {
        player_id: playerId,
        fields: contextProposal.fields,
        sources: contextProposal.sources,
      }), 35000);
      if (!current()) return;
      if (await load(true, true) === false) throw new Error('Player details were saved, but could not reload. Try again.');
      if (!current()) return;
      const nextContext = { ...(bundle?.player || {}), ...contextProposal.fields };
      const canRefresh = Boolean(nextContext.current_season_label && nextContext.current_club && nextContext.current_league);
      if (canRefresh) {
        if (!await refreshPreparationStats(current)) return;
      }
      if (!current()) return;
      setPreparationStep('Preparing your editable profile...');
      const response = await readWithDeadline(invoke<any>('player_profile_prepare', {
        player_id: playerId,
        kind: prepareKind,
        ...(prepareKind === 'club'
          ? { organisation_id: prepareClub, deal_room_id: prepareDeal || null }
          : {}),
      }), 35000);
      if (!current()) return;
      adoptPreparedProfile(response);
      setContextProposal(null);
      setNotice('Player details saved. Review the prepared draft before saving it.');
    } catch (contextError) {
      if (current()) setError(friendlyError(contextError));
    } finally {
      if (current()) {preparationBusy.current = false; setActionBusy(''); setPreparationStep('');}
    }
  };

  const improveProfileText = async () => {
    if (!proposal || !improveSection || actionBusy) return;
    const originalText = proposal[improveSection];
    if (!text(originalText)) {
      setError('Add some text before asking for an improvement.');
      return;
    }
    setActionBusy('improve');
    setError('');
    setImprovement(null);
    try {
      const response = await invoke<any>('player_profile_improve', {
        player_id: playerId,
        section: improveSection,
        style: improveStyle,
        text: originalText,
        ...(proposal.kind === 'club' ? {
          organisation_id: prepareClub,
          deal_room_id: prepareDeal || null,
        } : {}),
      });
      const result = response?.improvement;
      if (!result || !['suggested', 'unchanged'].includes(result.status)) {
        throw new Error('No text improvement was available. Try again.');
      }
      setImprovement({
        section: improveSection,
        originalText,
        suggestedText: text(result.suggestedText),
        status: result.status,
      });
    } catch (improveError) {
      setError(friendlyError(improveError));
    } finally {
      setActionBusy('');
    }
  };

  const reviewProfile = async () => {
    if (actionBusy) return;
    setActionBusy('review');
    setError('');
    try {
      const response = await invoke<any>('player_profile_review', {
        player_id: playerId,
        kind: proposal?.kind || 'general',
        ...(proposal?.kind === 'club' ? {
          organisation_id: prepareClub,
          deal_room_id: prepareDeal || null,
        } : {}),
        ...(proposal ? {
          proposal: {
            headline: proposal.headline,
            why_review: proposal.why_review,
            selected_stat_refs: proposal.selected_stat_refs,
            selected_video_id: proposal.selected_video_id,
            source_fingerprint: proposal.source_fingerprint,
          },
        } : {}),
        ...(preparedVersionId ? { version_id: preparedVersionId } : {}),
      });
      const incoming = response?.review;
      if (incoming?.status !== 'ready' && incoming?.status !== 'suggestions') {
        throw new Error('The profile review could not be completed. Try again.');
      }
      setProfileReview({
        status: incoming?.status === 'suggestions' ? 'suggestions' : 'ready',
        suggestions: Array.isArray(incoming?.suggestions)
          ? incoming.suggestions.filter((item: any) => text(item?.message)).slice(0, 8)
          : [],
      });
    } catch (reviewError) {
      setError(friendlyError(reviewError));
    } finally {
      setActionBusy('');
    }
  };

  const savePreparedProfile = async () => {
    if (!proposal || !canEdit || actionBusy) return;
    if (proposal.why_review.length > 1200) {
      setError('Keep the overview to 1,200 characters. Your full draft is still here.');
      return;
    }
    if (proposal.kind === 'general') {
      const saved = await saveSettings(false, {
        intro_line: proposal.headline,
        why_review: proposal.why_review,
        key_stats_text: '',
        selected_stat_refs: proposal.selected_stat_refs,
        selected_video_id: proposal.selected_video_id,
        hidden_sections: proposal.hidden_sections,
      });
      if (!saved) return;
      setPreparedSaved(true);
      setNotice('General profile saved. Publish to update the live profile.');
      await load(true);
      return;
    }
    if (!prepareClub) return;
    if (!published?.published) {
      setError('Publish the general Player Profile before saving a club version.');
      return;
    }
    setActionBusy('version-save');
    setError('');
    try {
      const response = await invoke<any>('player_profile_version_save', {
        player_id: playerId,
        organisation_id: prepareClub,
        deal_room_id: prepareDeal || null,
        presentation: {
          headline: proposal.headline,
          why_review: proposal.why_review,
          selected_stat_refs: proposal.selected_stat_refs,
          selected_video_id: proposal.selected_video_id,
          hidden_sections: proposal.hidden_sections,
        },
        source_fingerprint: proposal.source_fingerprint,
      });
      const versionId = text(response?.version?.id);
      if (!versionId) throw new Error('The club profile was not saved. Try again.');
      setPreparedVersionId(versionId);
      setPreparedSaved(true);
      setNotice('Club profile saved. Review it, then create a private share link.');
      void loadVersions().catch(() => undefined);
    } catch (saveError) {
      setError(friendlyError(saveError));
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
          ? 'Live profile updated.'
          : 'Profile is live.',
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
      setNotice('Profile unpublished.');
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
      setNotice('PDF downloaded.');
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
      setError('Choose a club first.');
      return;
    }
    if (shareVersionId && !versions.some((version) =>
      version.id === shareVersionId &&
      version.status === 'approved' &&
      version.organisation_id === organisationId &&
      (!version.deal_room_id || version.deal_room_id === shareDeal))) {
      setError('Choose a saved club profile for this club.');
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
          profile_version_id: shareVersionId || null,
          pitch_message: shareMessage || null,
          expires_days: Number(shareExpiry) || 30,
        },
      );
      const token = response?.share?.token;
      if (!token) {
        throw new Error('Could not create the link.');
      }
      const url = `${window.location.origin}/s/${token}`;
      const readyMessage = buildShareMessage(url);
      setShareResultUrl(url);
      setShareResultMessage(readyMessage);
      try {
        await navigator.clipboard.writeText(readyMessage);
        setNotice('Private link created. Message copied.');
      } catch {
        setNotice('Private link created.');
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
      setNotice('Profile link copied.');
    } catch {
      setShareResultUrl(url);
      setShareOpen(true);
    }
  };

  const copyPreparedShare = async () => {
    if (!shareResultMessage) return;

    try {
      await navigator.clipboard.writeText(shareResultMessage);
      setNotice('Share message copied.');
    } catch {
      setNotice('Copy failed. Select and copy the message manually.');
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
      await load(true, true);
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
      await load(true, true);
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
    const preparedClub = preparedSaved && proposal?.kind === 'club'
      ? prepareClub
      : '';
    setShareDeal(preparedClub ? prepareDeal : '');
    setShareClub(preparedClub);
    setShareVersionId(preparedClub ? preparedVersionId : '');
    setShareOpen(true);
    void loadVersions().catch(() => setVersions([]));
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
    setEditorSection('story');
    setError('');
    setNotice('');
    setForm(formFromProfile(bundle));
    setEditOpen(true);
  };

  const openEditorAt = (target: 'positioning' | 'video') => {
    setEditorSection(target === 'video' ? 'video' : 'story');
    setError('');
    setNotice('');
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

  const runProfileCheck = (item: ProfileCheck) => {
    if (!canEdit) return;

    if (item.action === 'verify-player') {
      openVerify(
        item.key === 'position'
          ? 'position'
          : item.key === 'contract'
            ? player.contract_status
              ? 'contract-expiry'
              : 'contract-status'
            : 'verification',
      );
      return;
    }

    if (item.action === 'transfermarkt') {
      openTransfermarkt();
      return;
    }

    if (item.action === 'profile-video' || item.action === 'profile-positioning') {
      openEditorAt(item.action === 'profile-video' ? 'video' : 'positioning');
      return;
    }

    if (item.action === 'player-workspace') {
      window.location.assign(backHref);
      return;
    }

    if (item.action === 'agency-settings' && ['owner', 'admin'].includes(role)) {
      window.location.assign('/settings/agency');
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
    if (actionBusy) return;
    setForm(formFromProfile(bundle));
    setEditOpen(false);
  };

  if (loading && !bundle) {
    return (
      <section className={styles.loading} role="status" aria-busy="true" aria-atomic="true">
        <LoaderCircle className={styles.spin} size={22} />
        Loading Player Profile...
      </section>
    );
  }

  if (!bundle) {
    return (
      <section className={styles.errorCard}>
        <strong>Player profile could not load</strong>
        <p>Nothing changed. Try again or return to Players.</p>
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

  if (bundle?.access?.restricted) {
    return <div className={styles.root} style={theme}>
      <div className={styles.topbar}><Link href={backHref} className={styles.back} aria-label="Back to players"><ArrowLeft size={15}/>Players</Link></div>
      <section className={styles.card} aria-label="Assigned player access" style={{padding:20}}>
        <h2>Assigned player profile</h2>
        <p>Review football information here. Contract and sharing controls are for admins.</p>
      </section>
      {error?<p className={styles.error} role="alert">{error}</p>:null}
      <PublicProfile profile={draftProfile} agency={agency}/>
      <AgencyPlayerDataPanel key={playerId} player={player} career={career} canEdit={canEditStatistics} canVerify={false}
        invoke={invoke} onChanged={reloadRecordedData} onReview={()=>{}} blocked={Boolean(actionBusy)}/>
    </div>;
  }

  return (
    <div className={styles.root} style={theme}>
      <div className={styles.topbar}>
        <Link href={backHref} className={styles.back} aria-label="Back to players">
          <ArrowLeft size={15} />
          Players
        </Link>
        {workHref ? <Link href={workHref} className={styles.back}>Work view</Link> : null}

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
        <div className={styles.error} role="alert" aria-atomic="true">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className={styles.notice} role="status" aria-atomic="true">
          <Check size={15} />
          {notice}
        </div>
      ) : null}

      {player.review_required_at || player.review_reason ? (
        <section className={`${styles.card} ${styles.reviewBanner}`} aria-label="Player data review">
          <div>
            <h3>Player data needs review</h3>
            <p>{player.review_reason || 'New player information needs checking.'}</p>
            <span>Check the information before confirming it is current.</span>
          </div>
          {canEdit ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => openVerify('verification')}>Review updated data</button> : null}
        </section>
      ) : null}

      <section className={styles.hero}>
        <div className={styles.heroIdentity}>
          <PlayerProfilePhoto key={`${cacheScope}:${playerId}`} playerId={playerId} name={name} path={player.profile_photo_path}
            canEdit={canEdit} blocked={Boolean(actionBusy)} className={styles.photo} invoke={invoke}
            onSaved={(path,confirmation) => {setBundle((current: any) => current ? {...current, player: {...current.player,...confirmation,profile_photo_path:path}} : current);setNotice('Player photo updated. Review the profile before publishing.');void load(true,true);}}/>

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

        {rpc && ['owner','admin'].includes(role) && !bundle?.access?.restricted ? <RecordContactActions kind="player" recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/> : null}

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
              <span>Next move</span>
              <strong>
                {published?.published
                  ? 'Share with a club'
                  : verificationOnly
                    ? 'Verify and publish'
                    : canPublish
                      ? 'Publish Player Profile'
                      : primaryRequiredCheck?.missingTitle || 'Finish the player record'}
              </strong>
            </div>
          </div>

          <p>
            {published?.published
              ? missingShareHighlights.length
                ? `Before sharing: ${missingShareHighlights
                    .slice(0, 2)
                    .map((item) => item.missingTitle)
                    .join(' · ')}`
                : 'The profile is live and ready to send.'
              : verificationOnly
                ? 'Confirm the current player record once before the profile goes live.'
                : canPublish
                  ? 'Everything required is ready.'
                  : primaryRequiredCheck?.missingDetail || 'Complete the required player information first.'}
          </p>
        </div>

        <div className={styles.heroActions}>
          {published?.published ? (
            <button
              type="button"
              data-ui-button="primary"
              className={styles.primaryAction}
              onClick={openShareComposer}
              disabled={!canEdit || Boolean(actionBusy)}
            >
              <Send size={16} />
              Share Player Profile
            </button>
          ) : canPublishFromHero ? (
            <button
              type="button"
              data-ui-button="primary"
              className={styles.primaryAction}
              onClick={() =>
                void publishProfile({
                  saveFirst: false,
                  confirmCurrentData: verificationOnly,
                })
              }
              disabled={!canEdit || Boolean(actionBusy)}
            >
              {actionBusy === 'publish' ? (
                <LoaderCircle className={styles.spin} size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              {verificationOnly ? 'Verify & publish' : 'Publish Player Profile'}
            </button>
          ) : primaryRequiredCheck ? (
            <button
              type="button"
              data-ui-button="primary"
              className={styles.primaryAction}
              onClick={() => runProfileCheck(primaryRequiredCheck)}
              disabled={!canEdit || primaryMoveBlocked || Boolean(actionBusy)}
            >
              <ArrowRight size={16} />
              {primaryMoveBlocked ? 'Owner or admin required' : primaryRequiredCheck.actionLabel}
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              data-ui-button="secondary"
              className={styles.secondaryAction}
              onClick={() => openPrepare(true)}
              disabled={Boolean(actionBusy)}
            >
              <Sparkles size={15} />
              Complete with AI
            </button>
          ) : null}

          {canEdit ? (
            <button type="button" data-ui-button="secondary"
              className={styles.secondaryAction}
              onClick={openEditor} disabled={Boolean(actionBusy)}>
              <Pencil size={15} /> Edit profile
            </button>
          ) : null}

          <ToolsMenu className={styles.profileTools} triggerClassName={styles.secondaryAction} menuClassName={styles.toolMenu} label="Player profile tools">
              <button
                type="button"
                data-ui-button="secondary"
                className={styles.secondaryAction}
                onClick={() => setPreviewOpen(true)}
              >
                <Eye size={15} />
                Preview
              </button>
              {canEdit ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => openVerify('verification')}><Pencil size={15}/>Edit player details</button> : null}
              {canEdit && !proposal && !contextProposal ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} disabled={Boolean(actionBusy)} onClick={() => {setPrepareKind('club'); openPrepare();}}><Sparkles size={15}/>Prepare for a club</button> : null}
              {canEdit ? (
                <button
                  type="button"
                  data-ui-button="secondary"
                  className={styles.secondaryAction}
                  onClick={openTransfermarkt}
                >
                  <Link2 size={15} />
                  {player.transfermarkt_url ? 'Edit Transfermarkt' : 'Add Transfermarkt'}
                </button>
              ) : null}
              {verificationOnly && canEdit ? (
                <button
                  type="button"
                  data-ui-button="secondary"
                  className={styles.secondaryAction}
                  onClick={() => openVerify('verification')}
                >
                  <ShieldCheck size={15} />
                  Check data
                </button>
              ) : null}
              <button
                type="button"
                data-ui-button="secondary"
                className={styles.secondaryAction}
                onClick={downloadPdf}
                disabled={Boolean(actionBusy)}
              >
                <Download size={15} />
                Download PDF
              </button>

          </ToolsMenu>
        </div>
      </section>

      {rpc ? <PlayerStaffControl key={cacheScope+playerId} playerId={playerId} scope={cacheScope || ''} rpc={rpc}/> : null}

      {preparation && rpc && canEdit ? <CapturePreparationBrief key={`${cacheScope}:${playerId}:${preparation.capture}:${preparation.preparation}`} link={preparation} read={(capture, signal) => readWithDeadline(rpc('redream_ai_receipt', { p_capture_id: capture }))}>
        {brief => brief.intent.kind === 'player_profile' ? <ProfilePreparationSource notes={brief.notes} disabled={Boolean(actionBusy)} ready={Boolean(proposal)} onPrepare={() => openPrepare()} onUse={notes => {
          if (!proposal) return;
          editProposal({ why_review: notes });
          setPrepareOpen(true);
          setNotice('Brief copied to the editable introduction. Check the facts and remove private details before saving or sharing.');
        }}/> : <p>This brief is for a document. Open the source note to continue.</p>}
      </CapturePreparationBrief> : null}
      {prepareOpen && canEdit ? (
        <section id="player-profile-prepare" className={styles.preparePanel} aria-label="Prepare Player Profile">
          <header className={styles.prepareHead}>
            <div>
              <span className={styles.eyebrow}>PREPARE PROFILE</span>
              <h3>{proposal ? (proposal.kind === 'club' ? `For ${proposal.club_name || 'a club'}` : 'General profile') : contextProposal ? 'Review player details' : 'Complete with AI'}</h3>
              {preparationStep ? <p className={styles.preparationProgress} role="status"><LoaderCircle size={15} className={styles.spin}/>{preparationStep}</p> : null}
            </div>
            <button
              type="button"
              data-ui-button="icon"
              className={styles.iconButton}
              aria-label="Close profile preparation"
              onClick={() => setPrepareOpen(false)}
            >
              <X size={17} />
            </button>
          </header>

          {!proposal ? (
            <div className={styles.prepareBody}>
              <div className={styles.prepareModes}>
                <button
                  type="button"
                  aria-pressed={prepareKind === 'general'}
                  onClick={() => setPrepareKind('general')}
                  disabled={Boolean(actionBusy)}
                >
                  <strong>General</strong>
                </button>
                <button
                  type="button"
                  aria-pressed={prepareKind === 'club'}
                  onClick={() => setPrepareKind('club')}
                  disabled={Boolean(actionBusy)}
                >
                  <strong>For a Club</strong>
                </button>
              </div>
              {prepareKind === 'club' ? (
                <div className={styles.prepareTargets}>
                  <label>
                    <span>Club</span>
                    <select
                      value={prepareClub}
                      disabled={Boolean(actionBusy)}
                      onChange={(event) => {
                        setPrepareClub(event.target.value);
                        setPrepareDeal('');
                      }}
                    >
                      <option value="">{shareClubsBusy ? 'Loading clubs...' : 'Choose club'}</option>
                      {shareClubOptions.map((club: any) => (
                        <option key={club.id} value={club.id}>{club.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Existing opportunity (optional)</span>
                    <select
                      value={prepareDeal}
                      disabled={Boolean(actionBusy)}
                      onChange={(event) => {
                        const dealId = event.target.value;
                        setPrepareDeal(dealId);
                        const deal = deals.find((item: any) => String(item.id) === dealId);
                        if (deal?.organisation_id) setPrepareClub(String(deal.organisation_id));
                      }}
                    >
                      <option value="">No opportunity selected</option>
                      {deals
                        .filter((deal: any) => !prepareClub || String(deal.organisation_id) === prepareClub)
                        .map((deal: any) => (
                          <option key={deal.id} value={deal.id}>
                            {deal.club_name || 'Club'} · {deal.title || human(deal.stage)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {contextProposal ? (
                <div className={styles.prepareKnownNeed}>
                  <strong>Current player details found</strong>
                  <div className={styles.prepareFields}>{Object.entries(contextProposal.fields).map(([key, value]) => <label key={key}><span>{({current_club:'Current club',current_league:'Competition',current_country:'Country',current_season_label:'Season',primary_position:'Position',transfermarkt_url:'Transfermarkt URL',stats_url:'Statistics URL'} as Record<string,string>)[key]}</span><input value={value || ''} disabled={Boolean(actionBusy)} onChange={event=>setContextProposal(current=>current?{...current,fields:{...current.fields,[key]:event.target.value}}:current)} /></label>)}</div>
                  <details className={styles.profileDetails}><summary>Research sources</summary>
                  <p>Confidence: {Math.round(contextProposal.confidence * 100)}%</p>
                  {contextProposal.reason ? <p>{contextProposal.reason}</p> : null}
                  {contextProposal.sources.length ? (
                    <p>
                      Sources: {contextProposal.sources.filter(source=>safeSourceUrl(source.url)).slice(0, 3).map((source, index) => (
                        <span key={source.url}>
                          {index ? ' · ' : ''}
                          <a href={source.url} target="_blank" rel="noreferrer">{source.title || new URL(source.url).hostname}</a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                  </details>
                  <div className={styles.prepareFooter}>
                    <button type="button" data-ui-button="primary" className={styles.primaryAction}
                      onClick={() => void applyPlayerContextAndContinue()} disabled={Boolean(actionBusy)}>
                      {actionBusy === 'context-apply' ? <LoaderCircle className={styles.spin} size={15} /> : <Check size={15} />}
                      Apply & continue
                    </button>
                    <button type="button" data-ui-button="secondary" className={styles.secondaryAction}
                      onClick={() => setContextProposal(null)} disabled={Boolean(actionBusy)}>
                      Not now
                    </button>
                  </div>
                </div>
              ) : (
              <div className={styles.prepareFooter}>
                <button
                  type="button"
                  data-ui-button="primary"
                  className={styles.primaryAction}
                  onClick={() => void prepareProfile()}
                  disabled={Boolean(actionBusy) || (prepareKind === 'club' && !prepareClub)}
                >
                  {actionBusy === 'prepare' ? <LoaderCircle className={styles.spin} size={15} /> : <Sparkles size={15} />}
                  {actionBusy === 'prepare'
                    ? 'Preparing profile...'
                    : `Prepare ${prepareKind === 'club' ? 'for club' : 'general profile'}`}
                </button>
              </div>
              )}
            </div>
          ) : (
            <div className={styles.prepareBody}>
              <p className={styles.prepareIntro}>
                Prepared from recorded player evidence. Edit the presentation before saving; player facts stay on the player record.
              </p>
              {proposal.kind === 'club' && (proposal.club_requirement?.title || proposal.club_requirement?.position) ? (
                <p className={styles.prepareKnownNeed}>
                  Known need: {proposal.club_requirement.title || proposal.club_requirement.position}
                </p>
              ) : null}
              <div className={styles.prepareFields}>
                <label htmlFor={preparationId + '-headline'}>
                  <span className={styles.prepareFieldLabel}>
                    Headline
                    {aiAvailable ? <button type="button" onClick={() => {
                      setImproveSection('headline');
                      setImproveStyle('clearer');
                      setImprovement(null);
                    }}><Sparkles size={13} /> Improve</button> : null}
                  </span>
                  <input
                    id={preparationId + '-headline'}
                    value={proposal.headline}
                    onChange={(event) => editProposal({ headline: event.target.value })}
                    maxLength={220}
                  />
                </label>
                <label htmlFor={preparationId + '-introduction'}>
                  <span className={styles.prepareFieldLabel}>
                    Why this player?
                    {aiAvailable ? <button type="button" onClick={() => {
                      setImproveSection('why_review');
                      setImproveStyle(proposal.kind === 'club' ? 'tailor_to_club' : 'more_direct');
                      setImprovement(null);
                    }}><Sparkles size={13} /> Improve</button> : null}
                  </span>
                  <textarea
                    id={preparationId + '-introduction'}
                    rows={6}
                    aria-label="Why this player?"
                    aria-describedby={preparationId + '-introduction-help'}
                    aria-invalid={proposal.why_review.length > 1200}
                    className={styles.storyInput}
                    value={proposal.why_review}
                    onChange={(event) => editProposal({ why_review: event.target.value })}
                  />
                  <small id={preparationId + '-introduction-help'} className={styles.storyHelp}>
                    <span>Enter starts a new paragraph.</span>
                    <span>{proposal.why_review.length.toLocaleString('en-GB')} / 1,200</span>
                  </small>
                </label>
              </div>
              {aiAvailable && improveSection ? (
                <div className={styles.improvePanel}>
                  <div className={styles.improveHead}>
                    <strong>Improve {improveSection === 'headline' ? 'headline' : 'introduction'}</strong>
                    <button type="button" aria-label="Close text improvement" onClick={() => {
                      setImproveSection(null);
                      setImprovement(null);
                    }}><X size={15} /></button>
                  </div>
                  <div className={styles.improveActions}>
                    <select value={improveStyle} onChange={(event) => setImproveStyle(event.target.value as ImprovementStyle)}>
                      <option value="shorter">Shorter</option>
                      <option value="clearer">Clearer</option>
                      <option value="football_focused">More football-focused</option>
                      <option value="more_direct">More direct</option>
                      {proposal.kind === 'club' ? <option value="tailor_to_club">Tailor to club</option> : null}
                    </select>
                    <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => void improveProfileText()} disabled={Boolean(actionBusy)}>
                      {actionBusy === 'improve' ? <LoaderCircle className={styles.spin} size={14} /> : <Sparkles size={14} />}
                      Suggest wording
                    </button>
                  </div>
                  {improvement ? (
                    improvement.status === 'suggested' && improvement.suggestedText && improvement.suggestedText !== improvement.originalText ? (
                      <div className={styles.improveSuggestion}>
                        <span>Suggested wording</span>
                        <p>{improvement.suggestedText}</p>
                        <div>
                          <button type="button" data-ui-button="primary" className={styles.primaryAction} onClick={() => {
                            if (proposal[improvement.section] !== improvement.originalText) {
                              setImprovement(null);
                              setError('The text changed. Ask for a fresh suggestion.');
                              return;
                            }
                            editProposal({ [improvement.section]: improvement.suggestedText });
                            setImproveSection(null);
                          }}>Apply wording</button>
                          <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => setImprovement(null)}>Dismiss</button>
                        </div>
                      </div>
                    ) : <p className={styles.prepareEmpty}>No useful wording change found.</p>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.prepareEvidence}>
                <div className={styles.prepareSectionHead}>
                  <strong>Featured numbers</strong>
                  <span>Choose up to six recorded stats. Order them with the arrows.</span>
                </div>
                {proposal.selected_stat_refs.length ? (
                  <ol className={styles.selectedStats}>
                    {proposal.selected_stat_refs.map((ref, index) => {
                      const stat = evidenceStats.find((item) => item.ref === ref);
                      if (!stat) return null;
                      return (
                        <li key={ref}>
                          <span>
                            <strong>{stat.value} {stat.label}</strong>
                            {[stat.seasonLabel, stat.competition, stat.source?.name].filter(Boolean).length
                              ? ` · ${[stat.seasonLabel, stat.competition, stat.source?.name].filter(Boolean).join(' · ')}`
                              : ''}
                          </span>
                          <div>
                            <button type="button" aria-label={`Move ${stat.label} up`} disabled={index === 0} onClick={() => {
                              const next = [...proposal.selected_stat_refs];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              editProposal({ selected_stat_refs: next });
                            }}>↑</button>
                            <button type="button" aria-label={`Move ${stat.label} down`} disabled={index === proposal.selected_stat_refs.length - 1} onClick={() => {
                              const next = [...proposal.selected_stat_refs];
                              [next[index + 1], next[index]] = [next[index], next[index + 1]];
                              editProposal({ selected_stat_refs: next });
                            }}>↓</button>
                            <button type="button" aria-label={`Remove ${stat.label}`} onClick={() => editProposal({ selected_stat_refs: proposal.selected_stat_refs.filter((item) => item !== ref) })}>×</button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className={styles.prepareEmpty}>No stats selected. The profile will not show invented numbers.</p>}
                {evidenceStats.some((stat) => !proposal.selected_stat_refs.includes(stat.ref)) ? (
                  <div className={styles.availableStats}>
                    {evidenceStats.filter((stat) => !proposal.selected_stat_refs.includes(stat.ref)).map((stat) => (
                      <button
                        type="button"
                        key={stat.ref}
                        disabled={proposal.selected_stat_refs.length >= 6}
                        onClick={() => editProposal({ selected_stat_refs: [...proposal.selected_stat_refs, stat.ref] })}
                      >
                        + {stat.value} {stat.label}
                        {stat.seasonLabel ? ` · ${stat.seasonLabel}` : ''}
                        {stat.source?.name ? ` · ${stat.source.name}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={styles.prepareFields}>
                <label>
                  <span>Featured video</span>
                  <select
                    value={proposal.selected_video_id || ''}
                    onChange={(event) => editProposal({ selected_video_id: event.target.value || null })}
                  >
                    <option value="">Use current featured video</option>
                    {evidenceVideos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.prepareSections}>
                <strong>Sections shown</strong>
                <div>
                  {([
                    ['why_review', 'Why this player'],
                    ['stats', 'Stats'],
                    ['career', 'Career'],
                    ['videos', 'Video'],
                    ['experience', 'Experience'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={!proposal.hidden_sections.includes(key)}
                      onClick={() => editProposal({ hidden_sections: proposal.hidden_sections.includes(key)
                        ? proposal.hidden_sections.filter((item) => item !== key)
                        : [...proposal.hidden_sections, key] })}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {profileReview ? (
                <div className={styles.prepareReview} role="status">
                  <strong>{profileReview.suggestions.length ? `${profileReview.suggestions.length} suggestions` : 'Profile ready'}</strong>
                  {profileReview.suggestions.length ? (
                    <ul>{profileReview.suggestions.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
                  ) : null}
                </div>
              ) : null}
              {proposal.kind === 'club' && !published?.published ? (
                <p className={styles.prepareEmpty}>Publish the general Player Profile before saving this club version or creating its private link.</p>
              ) : null}
              <div className={styles.prepareFooter}>
                <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => {
                  setProposal(null);
                  setProfileReview(null);
                }}>Change type</button>
                <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => openProfilePreview(proposalPreview, 'PREPARED PROFILE PREVIEW')}>
                  <Eye size={15} /> Preview
                </button>
                <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => void reviewProfile()} disabled={Boolean(actionBusy)}>
                  {actionBusy === 'review' ? <LoaderCircle className={styles.spin} size={15} /> : <Sparkles size={15} />}
                  Review Profile
                </button>
                <button type="button" data-ui-button="primary" className={styles.primaryAction} onClick={() => void savePreparedProfile()} disabled={Boolean(actionBusy) || preparedSaved || (proposal.kind === 'club' && !published?.published)}>
                  <Check size={15} /> {preparedSaved ? 'Saved' : 'Save profile'}
                </button>
                {preparedSaved && proposal.kind === 'club' && published?.published ? (
                  <button type="button" data-ui-button="primary" className={styles.primaryAction} onClick={openShareComposer}>
                    <Send size={15} /> Share with club
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}
      <section className={`${styles.card} ${styles.clubStats}`} aria-label="Club profile stats">
        <div className={styles.clubStatsHead}><div><h3>Club profile stats</h3><p>{!draftProfile.key_stats.length ? 'No stats included yet' : form.selected_stat_refs.length ? 'Selected stats in use' : automaticClubStats ? 'Current-season stats in use' : 'Custom stats in use'}</p></div>
          {canEdit ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => void useRecordedStats()} disabled={Boolean(actionBusy) || !recordedStats.length || (!form.key_stats_text.trim() && !form.selected_stat_refs.length)}><RefreshCw size={14}/>Use latest stats</button> : null}
        </div>
        {draftProfile.key_stats.length ? automaticClubStats||form.selected_stat_refs.length ? clubStatContexts.map((context,index)=>(
          <p className={styles.statContext} key={`${context.scope}:${index}`}>
            <strong>{context.scope}</strong> · {context.source} · {context.date?`${context.dateLabel} ${compactDateTime(context.date)}`:'Source date not recorded'}
          </p>
        )):<p className={styles.statContext}>Custom figures, separate from current-season updates. Check their period and source before sharing.</p>:null}
        {draftProfile.key_stats.length?<div className={styles.keyStats}>{draftProfile.key_stats.slice(0,6).map((stat: any,index: number) => <div key={`${stat.label}:${index}`}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>:null}
        {!draftProfile.key_stats.length ? <p>Add reviewed season statistics below.</p> : null}
        <div className={styles.clubStatsFooter}>{clubStatSourceUrls.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer">{clubStatSourceUrls.length>1?`Source ${index+1}`:'View source'} <ExternalLink size={12}/></a>)}
          {canEdit ? <button type="button" data-ui-button="tertiary" onClick={() => {openEditor();setEditorSection('presentation');}}>Edit stats</button> : null}
          <span>Included in the CV. Publish to update the shared profile.</span>
        </div>
      </section>
      <AgencyPlayerDataPanel
        key={playerId}
        player={player}
        career={career}
        canEdit={canEditStatistics}
        canVerify={canEdit}
        invoke={invoke}
        onChanged={reloadRecordedData}
        onReview={() => openVerify('verification')}
        hasCustomStats={Boolean(bundle?.settings?.key_stats?.length)}
        onUseRecordedStats={useRecordedStats}
        blocked={Boolean(actionBusy) || editOpen || verifyOpen}
        statusVersion={statisticsStatusVersion}
        managedRefresh={actionBusy === 'prepare' || actionBusy === 'context-apply'}
      />

      {guidedRequiredChecks.length || missingOptionalChecks.length ? (
        <details className={styles.profileDetails} open={guidedRequiredChecks.length ? true : undefined}>
        <summary>{guidedRequiredChecks.length ? 'Required before publishing' : 'Profile checklist'}<span>{guidedRequiredChecks.length || missingOptionalChecks.length}</span></summary>
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
        </details>
      ) : null}

      <div className={styles.overview}>
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
              onClick={() => openProfilePreview(draftProfile)}
              aria-label="Preview Player Profile"
            >
              <Eye size={16} />
            </button>
          </div>

          <div className={styles.story}>
            {form.intro_line ? <strong>{form.intro_line}</strong> : null}
            {form.why_review ? <p>{form.why_review}</p> : <p>Complete with AI to prepare an editable introduction from the recorded evidence.</p>}
            {!draftProfile.primary_video_url && canEdit ? <button type="button" data-ui-button="secondary" className={styles.secondaryAction} onClick={() => openEditorAt('video')}><Play size={15}/>Add player footage</button> : null}
          </div>
        </section>
      </div>

      <details className={styles.profileDetails} open={communicationFollowups.length ? true : undefined}>
      <summary>Activity<span>{communicationItems.length || communicationFollowups.length || ''}</span></summary>
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
            <strong>No conversations linked to this player yet.</strong>
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
              <span>NEXT FOLLOW-UP</span>
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
                      : 'No due date set'}
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
      </details>

      <details className={styles.profileDetails} open={liveShares.length ? true : undefined}>
      <summary>Club links<span>{liveShares.length ? `${liveShares.length} active` : ''}</span></summary>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>SHARED PROFILE</span>
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
          {olderShares.length ? <button type="button" data-ui-button="tertiary" className={styles.quietButton} aria-expanded={showOlderLinks} onClick={() => setShowOlderLinks(value => !value)}>{showOlderLinks ? 'Hide older links' : `Older links (${olderShares.length})`}</button> : null}
          {[...liveShares, ...(showOlderLinks ? olderShares : [])].map((share: any) => (
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
                {['Ready', 'Opened'].includes(shareStatus(share)) ? (
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

                {['Ready', 'Opened'].includes(shareStatus(share)) && canEdit ? (
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
      </details>

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

      {transfermarktOpen ? createPortal(
        <div
          className={styles.modalBackdrop}
          style={theme}
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
                  Paste the player profile URL to save it as a reference.
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
                <div className={styles.error} role="alert" aria-atomic="true">{transfermarktError}</div>
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
        </div>, document.body,
      ) : null}

      {verifyOpen ? createPortal(
        <div
          className={`${styles.modalBackdrop} ${styles.verifyBackdrop}`}
          style={theme}
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
                  Correct any errors. Confirming saves these values and marks the record verified.
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
                <div className={styles.error} role="alert" aria-atomic="true">
                  {verifyError}
                </div>
              ) : null}

              <div className={styles.verifyIdentity}>
                <strong>{name}</strong>
                <span>
                  {[player.current_club, player.current_country]
                    .filter(Boolean)
                    .join(' · ') || 'Current situation needs more detail'}
                </span>
              </div>

              {player.review_required_at || player.review_reason ? (
                <section className={styles.reviewStats} aria-label="Statistics to review">
                  <strong>Current statistics</strong>
                  <p>Check these figures against the source before confirming.</p>
                  {recordedStatsSource ? <p><a href={recordedStatsSource} target="_blank" rel="noreferrer">Open current statistics source <ExternalLink size={11} /></a></p> : null}
                  <div className={styles.keyStats}>
                    {recordedStats.slice(0, 6).map((item: any, index: number) => (
                      <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{item.value}</strong></div>
                    ))}
                    {!recordedStats.length ? <p>No current-season statistics yet.</p> : null}
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
                    Changes to player data require a new review.
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
        </div>, document.body,
      ) : null}

      {editOpen ? createPortal(
        <div
          className={styles.modalBackdrop}
          style={theme}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            className={styles.modal + ' ' + styles.editorModal}
            ref={editorDialog}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
              if (event.key !== 'Tab') return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')).filter(node => node.getClientRects().length > 0);
              const first = controls[0], last = controls.at(-1);
              if (!controls.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Edit Player Profile"
          >
            <header>
              <div>
                <span className={styles.eyebrow}>EDIT PLAYER PROFILE</span>
                <h2>Edit club presentation</h2>
                <p>
                  Player details and verified statistics are included.
                </p>
              </div>
              <button
                type="button"
                data-ui-button="icon"
              className={styles.iconButton}
                onClick={closeEditor}
                aria-label="Close"
                disabled={Boolean(actionBusy)}
              >
                <X size={17} />
              </button>
            </header>

            <nav className={styles.editorNav} aria-label="Profile editor sections">
              {(['story', 'presentation', 'video'] as const).map(section => (
                <button type="button" key={section} aria-pressed={editorSection === section}
                  onClick={() => setEditorSection(section)}>
                  {section === 'story' ? 'Story' : section === 'presentation' ? 'Presentation' : 'Video'}
                </button>
              ))}
            </nav>
            <fieldset disabled={Boolean(actionBusy)} className={styles.form + ' ' + styles.editorBody}>
              <div className={styles.editorSection} hidden={editorSection !== 'story'}>
              <label id="player-profile-positioning">
                <span>Profile headline</span>
                <input
                  aria-label="Profile headline"
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
                  rows={7}
                  aria-label="Why this player?"
                  aria-describedby={preparationId + '-overview-help'}
                  aria-invalid={form.why_review.length > 1200}
                  className={styles.storyInput}
                  value={form.why_review}
                  onChange={(event) =>
                    setField('why_review', event.target.value)
                  }
                  placeholder="Describe the player’s role, strengths and current situation."
                />
                <small id={preparationId + '-overview-help'} className={styles.storyHelp}>
                  <span>Enter starts a new paragraph. Paragraphs carry into the PDF.</span>
                  <span>{form.why_review.length.toLocaleString('en-GB')} / 1,200</span>
                </small>
              </label>

              <label>
                <span>Career summary</span>
                <textarea
                  rows={5}
                  aria-label="Career summary"
                  aria-describedby={preparationId + '-summary-help'}
                  aria-invalid={form.career_summary.length > 1200}
                  className={styles.storyInput}
                  value={form.career_summary}
                  onChange={(event) =>
                    setField('career_summary', event.target.value)
                  }
                  placeholder="Optional. Use only when the career story benefits from context."
                />
                <small id={preparationId + '-summary-help'} className={styles.storyHelp}>
                  <span>Optional career context.</span>
                  <span>{form.career_summary.length.toLocaleString('en-GB')} / 1,200</span>
                </small>
              </label>

              </div>
              <div className={styles.editorSection} hidden={editorSection !== 'presentation'}>
              <label>
                <span>Custom key numbers</span>
                <textarea
                  rows={4}
                  aria-label="Custom key numbers"
                  value={form.key_stats_text}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm(current => ({...current, key_stats_text: value, selected_stat_refs: []}));
                  }}
                  placeholder={'Goals: 8\nAssists: 6'}
                />
                <small>
                  {form.selected_stat_refs.length
                    ? 'Selected source statistics are in use. Enter custom key numbers to replace them.'
                    : 'Optional. Leave blank and reviewed current-season numbers are used automatically.'}
                </small>
              </label>

              <label>
                <span>Selected experience</span>
                <textarea
                  rows={4}
                  aria-label="Selected experience"
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
                        aria-pressed={shown}
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

              </div>
              <div className={styles.editorSection} hidden={editorSection !== 'video'}>
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
                    aria-label="Video title"
                    placeholder="Video title"
                  />
                  <input
                    value={videoUrl}
                    onChange={(event) =>
                      setVideoUrl(event.target.value)
                    }
                    aria-label="Video URL"
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
            </fieldset>

            <footer>
              {error ? <div className={styles.editorFeedback} role="alert">{error}</div> : null}
              {notice ? <div className={styles.editorFeedback} role="status">{notice}</div> : null}
              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={closeEditor}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>

              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondaryAction}
                onClick={() => void saveSettings()}
                disabled={Boolean(actionBusy)}
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
        </div>, document.body,
      ) : null}

      {shareOpen ? createPortal(
        <div
          className={styles.modalBackdrop}
          style={theme}
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
                    : 'Create a private club link with tracked opens.'}
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
                      setShareVersionId('');
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
                      : 'Choose a club from your agency network.'}
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
                        setShareVersionId('');
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
                  <span>Profile to share</span>
                  <select
                    value={shareVersionId}
                    onChange={(event) => setShareVersionId(event.target.value)}
                    disabled={versionsBusy}
                  >
                    <option value="">General Player Profile</option>
                    {shareableVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.headline || `${version.club_name || 'Club'} profile`}
                        {version.new_player_data_available ? ' · New player data available' : ''}
                      </option>
                    ))}
                  </select>
                  <small>
                    {versionsBusy
                      ? 'Loading saved club profiles...'
                      : shareableVersions.length
                        ? 'Saved club versions stay fixed when player data changes.'
                        : 'Prepare a club profile first to share a tailored version.'}
                  </small>
                  {shareVersionId && versions.find((version) => version.id === shareVersionId)?.presentation ? (
                    <button
                      type="button"
                      className={styles.preparePreviewLink}
                      onClick={() => openProfilePreview(
                        versions.find((version) => version.id === shareVersionId)?.presentation,
                        'CLUB PROFILE PREVIEW',
                      )}
                    >
                      <Eye size={14} /> Preview selected club profile
                    </button>
                  ) : null}
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
                    actionBusy === 'share' ||
                    versionsBusy
                  }
                >
                  <Send size={15} />
                  Create club share
                </button>
              ) : null}
            </footer>
          </section>
        </div>, document.body,
      ) : null}

      {previewOpen ? createPortal(
        <div ref={previewDialog} className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Player Profile preview">
          <div className={styles.previewBar}>
            <div>
              <span>{previewLabel}</span>
              <strong>Review before sharing</strong>
            </div>

            <button data-ui-button="secondary"
              ref={previewClose}
              type="button"
              onClick={() => setPreviewOpen(false)}
            >
              <X size={17} />
              Close
            </button>
          </div>

          <div className={styles.previewScroll}>
            <PublicProfile
              profile={previewProfile || draftProfile}
              agency={agency}
            />
          </div>
        </div>, document.body,
      ) : null}
    </div>
  );
}

function ProfilePreparationSource({ notes, disabled, ready, onPrepare, onUse }: {
  notes: string; disabled: boolean; ready: boolean; onPrepare: () => void; onUse: (value: string) => void;
}) {
  const [brief, setBrief] = useState(notes);
  return <>
    <p>Private working notes. Keep only the factual wording you want a club to see before copying it into the introduction.</p>
    <label htmlFor="profile-source-brief">Review your brief<textarea id="profile-source-brief" rows={5} value={brief} onChange={event => setBrief(event.target.value)} disabled={disabled}/></label>
    {!ready ? <button type="button" data-ui-button="primary" onClick={onPrepare} disabled={disabled}>Open profile preparation</button> : <button type="button" data-ui-button="secondary" onClick={() => onUse(brief.trim())} disabled={disabled || !brief.trim() || brief.trim().length > 1200}>Use reviewed brief as introduction</button>}
    <p>{brief.trim().length > 1200 ? 'Shorten the brief to 1,200 characters before using it as the introduction. ' : ''}Profile preparation uses recorded stats and video. Saving and sharing stay separate.</p>
  </>;
}
