'use client';

import {
  Check,
  Clipboard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  friendlyError,
  platformInvoke,
  relativeDate,
} from '@/lib/platform-client';

import styles from './AgencyConnectedReplyDrawer.module.css';

type DraftPayload = {
  draft_id?: string | null;
  draft_text?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  updated_at?: string | null;
};

type ReplyResponse = {
  ok?: boolean;
  draft?: DraftPayload | null;
  context?: {
    identity_kind?: 'network_person' | 'player' | 'recruitment_target' | null;
    identity_name?: string | null;
    person_name?: string | null;
    player_name?: string | null;
    prospect_name?: string | null;
    prospect_current_club?: string | null;
    recruitment_stage?: string | null;
    player_current_club?: string | null;
    current_organisation_name?: string | null;
    current_role?: string | null;
    channel?: string | null;
    direction?: string | null;
    occurred_at?: string | null;
    source_summary?: string | null;
  };
  safety_notes?: string[];
  external_action?: boolean;
};

const human = (value: unknown) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AgencyConnectedReplyDrawer({
  tenantId,
  interaction,
  onClose,
}: {
  tenantId: string;
  interaction: any;
  onClose: () => void;
}) {
  const interactionId = String(
    interaction?.interaction_id || '',
  );

  const [context, setContext] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [savedDraft, setSavedDraft] = useState('');
  const [safetyNotes, setSafetyNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const generatingRef = useRef(false);

  const call = useCallback(
    async (
      action: 'get' | 'generate' | 'save',
      draftText?: string,
    ) =>
      platformInvoke<ReplyResponse>(
        'redream-connected-reply-draft',
        {
          action,
          tenant_id: tenantId,
          interaction_id: interactionId,
          ...(draftText != null
            ? { draft_text: draftText }
            : {}),
        },
      ),
    [interactionId, tenantId],
  );

  const apply = useCallback((result: ReplyResponse) => {
    const nextDraft = String(
      result?.draft?.draft_text || '',
    );

    setContext(result?.context || null);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setSafetyNotes(
      Array.isArray(result?.safety_notes)
        ? result.safety_notes.filter(Boolean).slice(0, 6)
        : [],
    );
  }, []);

  const generate = useCallback(async () => {
    if (!interactionId || generatingRef.current) return;

    generatingRef.current = true;
    setGenerating(true);
    setError('');
    setCopied(false);

    try {
      const result = await call('generate');
      apply(result);
    } catch (generateError) {
      setError(friendlyError(generateError));
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [apply, call, interactionId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const result = await call('get');
        if (!active) return;

        const existing = String(
          result?.draft?.draft_text || '',
        );

        if (existing) {
          apply(result);
          return;
        }

        setContext(result?.context || null);
        setLoading(false);
        await generate();
      } catch (loadError) {
        if (active) {
          setError(friendlyError(loadError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [apply, call, generate]);

  const dirty = draft.trim() !== savedDraft.trim();

  const save = async () => {
    const next = draft.trim();
    if (!next || saving) return false;

    setSaving(true);
    setError('');

    try {
      const result = await call('save', next);
      apply(result);
      return true;
    } catch (saveError) {
      setError(friendlyError(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    const next = draft.trim();
    if (!next) return;

    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }

    try {
      await navigator.clipboard.writeText(next);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        'Copy was blocked by the browser. Select the draft text and copy it manually.',
      );
    }
  };

  const personName =
    context?.identity_name ||
    context?.player_name ||
    context?.prospect_name ||
    context?.person_name ||
    interaction?.player_name ||
    interaction?.prospect_name ||
    interaction?.person_name ||
    'Connected identity';

  const organisation =
    context?.player_current_club ||
    context?.prospect_current_club ||
    context?.current_organisation_name ||
    interaction?.player_current_club ||
    interaction?.prospect_current_club ||
    interaction?.organisation_name ||
    null;

  const channel =
    context?.channel ||
    interaction?.channel ||
    'Connected message';

  const sourceSummary =
    context?.source_summary ||
    interaction?.summary ||
    'Connected conversation recorded.';

  const occurredAt =
    context?.occurred_at ||
    interaction?.occurred_at ||
    null;

  const subtitle = useMemo(
    () =>
      [personName, organisation]
        .filter(Boolean)
        .join(' · '),
    [organisation, personName],
  );
  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Prepare reply"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <small>CONNECTED WORK</small>
            <h2>Prepare reply</h2>
            <p>{subtitle}</p>
          </div>

          <button
            type="button"
            data-ui-button="icon"
              className={styles.close}
            onClick={onClose}
            aria-label="Close reply draft"
          >
            <X size={17} />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.source}>
            <div className={styles.sourceTop}>
              <span>{human(channel)}</span>
              {occurredAt ? (
                <em>{relativeDate(occurredAt)}</em>
              ) : null}
            </div>
            <strong>What ReDream is replying to</strong>
            <p>{sourceSummary}</p>
          </section>

          {loading ? (
            <div className={styles.loading}>
              <LoaderCircle size={17} />
              Loading reply context
            </div>
          ) : null}

          {generating ? (
            <div className={styles.loading}>
              <LoaderCircle size={17} />
              Preparing a grounded reply
            </div>
          ) : null}

          {!loading && !generating ? (
            <section className={styles.draftSection}>
              <div className={styles.draftHead}>
                <div>
                  <small>DRAFT ONLY</small>
                  <strong>Edit before you use it</strong>
                </div>

                <button
                  type="button"
                  data-ui-button="secondary"
              className={styles.regenerate}
                  onClick={() => void generate()}
                  disabled={saving || generating}
                >
                  <RefreshCw size={13} />
                  Regenerate
                </button>
              </div>

              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCopied(false);
                }}
                rows={9}
                maxLength={4000}
                placeholder="Your draft reply will appear here."
              />

              <div className={styles.draftMeta}>
                <span>
                  {draft.length.toLocaleString('en-GB')} / 4,000
                </span>
                {dirty ? <em>Edited, not saved yet</em> : null}
              </div>
            </section>
          ) : null}

          {safetyNotes.length ? (
            <section className={styles.safety}>
              <ShieldCheck size={15} />
              <div>
                <strong>Draft guardrails</strong>
                {safetyNotes.map((note) => (
                  <span key={note}>{note}</span>
                ))}
              </div>
            </section>
          ) : null}

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

          <div className={styles.truth}>
            Draft only. ReDream does not send this message. Copy it,
            review it and send it yourself in the original channel.
          </div>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            data-ui-button="secondary"
              className={styles.secondary}
            onClick={onClose}
            disabled={saving || generating}
          >
            Close
          </button>

          <button
            type="button"
            data-ui-button="primary"
              className={styles.primary}
            onClick={() => void copy()}
            disabled={
              loading ||
              generating ||
              saving ||
              !draft.trim()
            }
          >
            {saving ? (
              <LoaderCircle
                size={15}
                className={styles.spin}
              />
            ) : copied ? (
              <Check size={15} />
            ) : (
              <Clipboard size={15} />
            )}
            {saving
              ? 'Saving'
              : copied
                ? 'Copied'
                : 'Copy reply'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
