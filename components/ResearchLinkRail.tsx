'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ExternalLink,
  Globe2,
  Instagram,
  Linkedin,
  Mail,
  MessageCircleMore,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { djmRpc, friendlyError } from '@/lib/djm-os';
import type {
  ResearchEntityKind,
  ResearchLink,
  ResearchPlatform,
} from '@/lib/research-links';
import styles from './ResearchLinkRail.module.css';

type ManagedLink = {
  id: string;
  entity_kind: ResearchEntityKind;
  entity_id: string;
  platform: ResearchPlatform;
  label: string;
  url: string;
  sort_order: number;
  is_public: boolean;
};

type DraftLink = {
  id?: string;
  platform: ResearchPlatform;
  label: string;
  url: string;
};

type RouteEntity = {
  kind: ResearchEntityKind;
  id: string;
};

type Scorecard = {
  score?: number | null;
  model_score?: number | null;
  manual_score?: number | null;
  potential_score?: number | null;
  potential_model_score?: number | null;
  manual_potential_score?: number | null;
  source?: string | null;
  status?: string | null;
  confidence?: number | null;
  override_reason?: string | null;
  basis?: Record<string, any> | null;
  calculated_at?: string | null;
};

const ICONS: Record<ResearchPlatform, ReactNode> = {
  whatsapp: <MessageCircleMore size={14} />,
  email: <Mail size={14} />,
  transfermarkt: <ExternalLink size={14} />,
  wyscout: <ExternalLink size={14} />,
  sofascore: <BarChart3 size={14} />,
  fotmob: <BarChart3 size={14} />,
  soccerway: <BarChart3 size={14} />,
  stats: <BarChart3 size={14} />,
  instagram: <Instagram size={14} />,
  linkedin: <Linkedin size={14} />,
  website: <Globe2 size={14} />,
  youtube: <ExternalLink size={14} />,
  vimeo: <ExternalLink size={14} />,
  x: <ExternalLink size={14} />,
  tiktok: <ExternalLink size={14} />,
  video: <ExternalLink size={14} />,
  other: <ExternalLink size={14} />,
};

const PLATFORM_LABELS: Partial<Record<ResearchPlatform, string>> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  transfermarkt: 'Transfermarkt',
  wyscout: 'Wyscout',
  sofascore: 'Sofascore',
  fotmob: 'FotMob',
  soccerway: 'Soccerway',
  stats: 'Statistics',
  website: 'Website',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  x: 'X',
  tiktok: 'TikTok',
  video: 'Video',
  other: 'Other',
};

const EDITABLE_PLATFORMS: ResearchPlatform[] = [
  'linkedin',
  'instagram',
  'transfermarkt',
  'wyscout',
  'sofascore',
  'fotmob',
  'soccerway',
  'stats',
  'website',
  'youtube',
  'vimeo',
  'x',
  'tiktok',
  'video',
  'other',
];

const PRESETS: Record<ResearchEntityKind, ResearchPlatform[]> = {
  contact: ['linkedin', 'instagram'],
  club: ['website', 'linkedin', 'instagram', 'transfermarkt'],
  player: ['transfermarkt', 'wyscout', 'stats', 'instagram', 'youtube'],
  recruitment: ['transfermarkt', 'wyscout', 'instagram', 'video'],
};

function entityFromPath(pathname: string): RouteEntity | null {
  const patterns: Array<[RegExp, ResearchEntityKind]> = [
    [/^\/network\/contacts\/([^/]+)/, 'contact'],
    [/^\/network\/clubs\/([^/]+)/, 'club'],
    [/^\/recruitment\/([^/]+)/, 'recruitment'],
    [/^\/admin\/players\/([^/]+)/, 'player'],
  ];

  for (const [pattern, kind] of patterns) {
    const match = pathname.match(pattern);
    if (match?.[1]) return { kind, id: match[1] };
  }
  return null;
}

function linkLabel(platform: ResearchPlatform) {
  return PLATFORM_LABELS[platform] || platform;
}

function scoreLabel(score: Scorecard | null) {
  if (!score || score.score == null) return 'Not enough benchmark data';
  return `${Math.round(Number(score.score))}/100`;
}

function potentialLabel(score: Scorecard | null) {
  if (!score || score.potential_score == null) return 'Not enough data';
  return `${Math.round(Number(score.potential_score))}/100`;
}

const panelStyle = {
  marginTop: 10,
  padding: 12,
  border: '1px solid rgba(26, 52, 77, .14)',
  borderRadius: 14,
  background: 'rgba(246, 248, 250, .92)',
} as const;

const inputStyle = {
  width: '100%',
  minWidth: 0,
  border: '1px solid rgba(26, 52, 77, .18)',
  borderRadius: 9,
  padding: '8px 9px',
  background: '#fff',
  color: '#17324d',
  font: 'inherit',
} as const;

const smallButtonStyle = {
  border: '1px solid rgba(26, 52, 77, .18)',
  borderRadius: 9,
  minHeight: 34,
  padding: '7px 10px',
  background: '#fff',
  color: '#17324d',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'pointer',
} as const;

export default function ResearchLinkRail({
  links,
  compact = false,
  title = 'Research & contact',
}: {
  links: ResearchLink[];
  compact?: boolean;
  title?: string;
}) {
  const pathname = usePathname() || '';
  const entity = useMemo(() => entityFromPath(pathname), [pathname]);
  const [managed, setManaged] = useState<ManagedLink[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftLink>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState('');
  const [error, setError] = useState('');
  const [score, setScore] = useState<Scorecard | null>(null);
  const [scoreEditorOpen, setScoreEditorOpen] = useState(false);
  const [scoreForm, setScoreForm] = useState({
    score: '',
    potential: '',
    reason: '',
    leagueStrength: '',
    benchmarkSource: '',
    benchmarkNote: '',
  });

  const loadManaged = useCallback(async () => {
    if (!entity) return;
    try {
      const result = await djmRpc<ManagedLink[]>('djm_entity_links', {
        p_entity_kind: entity.kind,
        p_entity_id: entity.id,
      });
      const rows = Array.isArray(result) ? result : [];
      setManaged(rows);
      setDrafts(() => {
        const next: Record<string, DraftLink> = {};
        const platforms = new Set<ResearchPlatform>([
          ...PRESETS[entity.kind],
          ...rows.map((row) => row.platform),
        ]);
        for (const platform of platforms) {
          const saved = rows.find((row) => row.platform === platform);
          next[platform] = {
            id: saved?.id,
            platform,
            label: saved?.label || linkLabel(platform),
            url: saved?.url || '',
          };
        }
        return next;
      });
    } catch {
      // Research fallback links remain fully usable even if managed-link loading fails.
    }
  }, [entity]);

  const loadScore = useCallback(async () => {
    if (!entity || entity.kind !== 'player') return;
    try {
      const result = await djmRpc<Scorecard>('djm_player_scorecard', {
        p_player_id: entity.id,
      });
      setScore(result || null);
      setScoreForm((current) => ({
        ...current,
        score: result?.manual_score == null ? '' : String(result.manual_score),
        potential: result?.manual_potential_score == null ? '' : String(result.manual_potential_score),
        reason: result?.override_reason || '',
        leagueStrength: result?.basis?.league_strength_score == null
          ? ''
          : String(result.basis.league_strength_score),
        benchmarkSource: result?.basis?.league_benchmark_source_url || '',
      }));
    } catch {
      setScore(null);
    }
  }, [entity]);

  useEffect(() => {
    void loadManaged();
    void loadScore();
  }, [loadManaged, loadScore]);

  const mergedLinks = useMemo(() => {
    const result = [...links];
    for (const saved of managed) {
      const direct: ResearchLink = {
        platform: saved.platform,
        label: saved.label || linkLabel(saved.platform),
        href: saved.url,
        mode: 'direct',
      };
      const index = result.findIndex((link) => link.platform === saved.platform);
      if (index >= 0) result[index] = direct;
      else result.push(direct);
    }
    return result;
  }, [links, managed]);

  const updateDraft = (platform: ResearchPlatform, patch: Partial<DraftLink>) => {
    setDrafts((current) => ({
      ...current,
      [platform]: {
        ...(current[platform] || {
          platform,
          label: linkLabel(platform),
          url: '',
        }),
        ...patch,
      },
    }));
  };

  const saveLink = async (platform: ResearchPlatform) => {
    if (!entity) return;
    const draft = drafts[platform];
    if (!draft?.url.trim()) {
      setError('Add a URL before saving this link.');
      return;
    }
    setBusyPlatform(platform);
    setError('');
    try {
      await djmRpc('djm_entity_link_upsert', {
        p_id: draft.id || null,
        p_entity_kind: entity.kind,
        p_entity_id: entity.id,
        p_platform: platform,
        p_label: draft.label.trim() || linkLabel(platform),
        p_url: draft.url.trim(),
        p_sort_order: 0,
        p_is_public: false,
      });
      await loadManaged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyPlatform('');
    }
  };

  const deleteLink = async (platform: ResearchPlatform) => {
    const draft = drafts[platform];
    if (!draft?.id) {
      updateDraft(platform, { url: '' });
      return;
    }
    setBusyPlatform(platform);
    setError('');
    try {
      await djmRpc('djm_entity_link_delete', { p_link_id: draft.id });
      await loadManaged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyPlatform('');
    }
  };

  const addPlatform = (platform: ResearchPlatform) => {
    updateDraft(platform, {});
  };

  const saveScore = async () => {
    if (!entity || entity.kind !== 'player') return;
    setError('');
    setBusyPlatform('score');
    try {
      const currentLeague = String(score?.basis?.current_league || '').trim();
      const currentCountry = String(score?.basis?.current_country || '').trim();
      const benchmark = scoreForm.leagueStrength.trim();

      if (benchmark) {
        if (!currentLeague) {
          throw new Error('Add the player current league before setting a league benchmark.');
        }
        const strength = Number(benchmark);
        if (!Number.isInteger(strength) || strength < 0 || strength > 100) {
          throw new Error('League strength must be a whole number between 0 and 100.');
        }
        await djmRpc('djm_league_benchmark_upsert', {
          p_league_name: currentLeague,
          p_country: currentCountry || null,
          p_strength_score: strength,
          p_source_url: scoreForm.benchmarkSource.trim() || null,
          p_source_note: scoreForm.benchmarkNote.trim() || null,
        });
      }

      const manualScore = scoreForm.score.trim() === '' ? null : Number(scoreForm.score);
      const manualPotential = scoreForm.potential.trim() === '' ? null : Number(scoreForm.potential);
      await djmRpc('djm_player_score_override', {
        p_player_id: entity.id,
        p_score: manualScore,
        p_potential_score: manualPotential,
        p_reason: scoreForm.reason.trim() || null,
      });
      await loadScore();
      setScoreEditorOpen(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyPlatform('');
    }
  };

  const refreshScore = async () => {
    setBusyPlatform('score-refresh');
    setError('');
    try {
      await loadScore();
    } finally {
      setBusyPlatform('');
    }
  };

  if (!mergedLinks.length && !entity) return null;

  const editableDrafts = Object.values(drafts).filter((draft) =>
    EDITABLE_PLATFORMS.includes(draft.platform),
  );
  const canShowScore = entity?.kind === 'player' && /research/i.test(title);

  return (
    <div className={`${styles.rail}${compact ? ` ${styles.compact}` : ''}`}>
      <div className={styles.heading}>
        <div>
          <strong>{title}</strong>
          <span>Saved profiles first · platform search where missing</span>
        </div>
        {entity ? (
          <button
            type="button"
            onClick={() => setEditorOpen((open) => !open)}
            style={{ ...smallButtonStyle, minHeight: 30, padding: '5px 8px' }}
            aria-label="Edit research links"
          >
            {editorOpen ? <X size={13} /> : <Pencil size={13} />}
            {editorOpen ? 'Close' : 'Edit links'}
          </button>
        ) : null}
      </div>

      {mergedLinks.length ? (
        <div className={styles.links}>
          {mergedLinks.map((link) => (
            <a
              key={`${link.platform}-${link.mode}-${link.href}`}
              className={`${styles.link} ${link.mode === 'direct' ? styles.direct : ''}`}
              data-platform={link.platform}
              href={link.href}
              target={link.href.startsWith('mailto:') ? undefined : '_blank'}
              rel={link.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
              title={`${link.label} · ${link.mode === 'direct' ? 'saved link' : 'targeted search'}`}
            >
              {link.mode === 'search' ? <Search size={13} /> : ICONS[link.platform]}
              <span>{link.label}</span>
              <span className={styles.mode}>{link.mode === 'direct' ? 'Saved' : 'Search'}</span>
            </a>
          ))}
        </div>
      ) : null}

      {editorOpen && entity ? (
        <div style={panelStyle}>
          <div style={{ display: 'grid', gap: 9 }}>
            {editableDrafts.map((draft) => (
              <div
                key={draft.platform}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(90px, .55fr) minmax(160px, 1.8fr) auto auto',
                  gap: 7,
                  alignItems: 'center',
                }}
              >
                <input
                  aria-label={`${linkLabel(draft.platform)} label`}
                  style={inputStyle}
                  value={draft.label}
                  onChange={(event) => updateDraft(draft.platform, { label: event.target.value })}
                />
                <input
                  aria-label={`${linkLabel(draft.platform)} URL`}
                  style={inputStyle}
                  value={draft.url}
                  placeholder={`Paste ${linkLabel(draft.platform)} URL`}
                  onChange={(event) => updateDraft(draft.platform, { url: event.target.value })}
                />
                <button
                  type="button"
                  style={smallButtonStyle}
                  disabled={busyPlatform === draft.platform}
                  onClick={() => void saveLink(draft.platform)}
                >
                  <Save size={13} />
                  Save
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  disabled={busyPlatform === draft.platform}
                  onClick={() => void deleteLink(draft.platform)}
                  aria-label={`Remove ${linkLabel(draft.platform)} saved link`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {EDITABLE_PLATFORMS.filter((platform) => !drafts[platform]).map((platform) => (
              <button
                key={platform}
                type="button"
                style={smallButtonStyle}
                onClick={() => addPlatform(platform)}
              >
                + {linkLabel(platform)}
              </button>
            ))}
          </div>
          {error ? <p style={{ color: '#9a2c2c', fontSize: 12, margin: '9px 0 0' }}>{error}</p> : null}
        </div>
      ) : null}

      {canShowScore ? (
        <div style={{ ...panelStyle, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <strong style={{ display: 'block', color: '#17324d' }}>DJM Player Intelligence</strong>
              <span style={{ display: 'block', fontSize: 11, color: '#617487', marginTop: 2 }}>
                Player Score is separate from Club Match and deal probability.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={smallButtonStyle} onClick={() => void refreshScore()} disabled={busyPlatform === 'score-refresh'}>
                Refresh
              </button>
              <button type="button" style={smallButtonStyle} onClick={() => setScoreEditorOpen((open) => !open)}>
                <Pencil size={13} />
                Edit
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
            <div style={{ padding: 10, borderRadius: 10, background: '#f5f8fa' }}>
              <span style={{ display: 'block', fontSize: 10, color: '#617487', textTransform: 'uppercase', letterSpacing: '.06em' }}>Player Score</span>
              <strong style={{ display: 'block', color: '#17324d', marginTop: 4 }}>{scoreLabel(score)}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: '#f5f8fa' }}>
              <span style={{ display: 'block', fontSize: 10, color: '#617487', textTransform: 'uppercase', letterSpacing: '.06em' }}>Potential</span>
              <strong style={{ display: 'block', color: '#17324d', marginTop: 4 }}>{potentialLabel(score)}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: '#f5f8fa' }}>
              <span style={{ display: 'block', fontSize: 10, color: '#617487', textTransform: 'uppercase', letterSpacing: '.06em' }}>Confidence</span>
              <strong style={{ display: 'block', color: '#17324d', marginTop: 4 }}>{score?.confidence == null ? 'Not calculated' : `${score.confidence}%`}</strong>
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#617487', margin: '8px 0 0' }}>
            {score?.source === 'manual_override'
              ? `Manual override${score.override_reason ? `: ${score.override_reason}` : ''}`
              : score?.score != null
                ? 'Provisional model score with visible benchmark and playing-time basis.'
                : 'No score is manufactured until recent-minute and league-benchmark requirements are met.'}
          </p>

          {scoreEditorOpen ? (
            <div style={{ ...panelStyle, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#31465b' }}>
                  Manual Player Score
                  <input style={{ ...inputStyle, marginTop: 4 }} type="number" min="0" max="100" value={scoreForm.score} onChange={(event) => setScoreForm({ ...scoreForm, score: event.target.value })} placeholder="Leave blank for model" />
                </label>
                <label style={{ fontSize: 11, color: '#31465b' }}>
                  Manual Potential Score
                  <input style={{ ...inputStyle, marginTop: 4 }} type="number" min="0" max="100" value={scoreForm.potential} onChange={(event) => setScoreForm({ ...scoreForm, potential: event.target.value })} placeholder="Leave blank for model" />
                </label>
                <label style={{ fontSize: 11, color: '#31465b', gridColumn: '1 / -1' }}>
                  Override reason
                  <input style={{ ...inputStyle, marginTop: 4 }} value={scoreForm.reason} onChange={(event) => setScoreForm({ ...scoreForm, reason: event.target.value })} placeholder="Required when a manual score is used" />
                </label>
              </div>

              <div style={{ borderTop: '1px solid rgba(26,52,77,.12)', marginTop: 10, paddingTop: 10 }}>
                <strong style={{ display: 'block', color: '#17324d', fontSize: 12 }}>League benchmark</strong>
                <span style={{ display: 'block', color: '#617487', fontSize: 11, marginTop: 2 }}>
                  {score?.basis?.current_league
                    ? `${score.basis.current_league}${score.basis.current_country ? `, ${score.basis.current_country}` : ''}`
                    : 'Set the player current league on their profile first.'}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '.6fr 1.4fr', gap: 8, marginTop: 8 }}>
                  <input style={inputStyle} type="number" min="0" max="100" value={scoreForm.leagueStrength} onChange={(event) => setScoreForm({ ...scoreForm, leagueStrength: event.target.value })} placeholder="Strength 0-100" />
                  <input style={inputStyle} value={scoreForm.benchmarkSource} onChange={(event) => setScoreForm({ ...scoreForm, benchmarkSource: event.target.value })} placeholder="Evidence/source URL" />
                  <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={scoreForm.benchmarkNote} onChange={(event) => setScoreForm({ ...scoreForm, benchmarkNote: event.target.value })} placeholder="Benchmark note or rationale" />
                </div>
              </div>

              <button type="button" style={{ ...smallButtonStyle, marginTop: 10 }} onClick={() => void saveScore()} disabled={busyPlatform === 'score'}>
                <Save size={13} />
                Save intelligence
              </button>
              {error ? <p style={{ color: '#9a2c2c', fontSize: 12, margin: '9px 0 0' }}>{error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
