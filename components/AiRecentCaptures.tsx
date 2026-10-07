'use client';

import { useAiWorkspace } from './useAiWorkspace';

import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import JourneyStatus from '@/components/JourneyStatus';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { platformRpc, friendlyError } from '@/lib/platform-client';
import styles from './AiRecentCaptures.module.css';

type RecentCapture = {
  id: string;
  status: string;
  summary?: string | null;
  channel?: string | null;
  created_at?: string | null;
  action_count?: number | null;
  question_count?: number | null;
};

function stateLabel(status: string) {
  return {
    done: 'Done',
    queued: 'Saved',
    processing: 'Processing',
    retry: 'Retrying',
    needs_input: 'Needs one thing',
    needs_review: 'Needs review',
    partial: 'Partial',
    failed: 'Failed',
    budget_blocked: 'Budget paused',
  }[status] || status.replaceAll('_', ' ');
}

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function AiRecentCaptures({
  refreshKey,
  onOpen,
}: {
  refreshKey?: number;
  onOpen: (captureId: string) => void;
}) {
  const workspaceSlug = useAiWorkspace();
  const [items, setItems] = useState<RecentCapture[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentWorkspace = useRef(workspaceSlug);
  currentWorkspace.current = workspaceSlug;
  const firstLoadRef = useRef(true);
  const loadGeneration = useRef(0);
  const [error,setError] = useState('');

  const load = useCallback(async (initial = false) => {
    const generation = ++loadGeneration.current;
    setError('');
    if (initial) setItems([]);
    if (initial) setInitialLoading(true);
    else setRefreshing(true);
    const controller = new AbortController();
    try {
      const result = await readWithDeadline(platformRpc<RecentCapture[]>('redream_ai_recent_captures', {
        p_limit: 8,
      }, workspaceSlug, controller.signal));
      if (generation !== loadGeneration.current || currentWorkspace.current !== workspaceSlug) return;
      if (!Array.isArray(result)) throw new Error('Recent updates could not be confirmed. Please try again.');
      setItems(result);
    } catch (loadError) {
      if (generation !== loadGeneration.current || currentWorkspace.current !== workspaceSlug) return;
      setError(friendlyError(loadError));
    } finally {
      controller.abort();
      if (generation === loadGeneration.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [workspaceSlug]);

  useEffect(() => {
    setItems([]);
    firstLoadRef.current = true;
  }, [workspaceSlug]);

  useEffect(() => {
    const initial = firstLoadRef.current;
    firstLoadRef.current = false;
    void load(initial);
    return () => { ++loadGeneration.current; };
  }, [load, refreshKey]);

  return (
    <section className={styles.section} aria-label="Recent captures">
      <div className={styles.head}>
        <div>
          <strong>Recent</strong>
          <span>Your latest ReDream updates and what happened to them.</span>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load(false)}
          disabled={refreshing || initialLoading}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? <JourneyStatus kind="error" title="Could not load recent updates" description={error} onRetry={() => void load(false)}/> : null}

      {(initialLoading || refreshing) && !items.length ? (
        <div className={styles.empty}>Checking your recent updates...</div>
      ) : items.length ? (
        <div className={styles.list} aria-busy={refreshing}>
          {items.map((item) => {
            const attention = ['needs_input', 'needs_review'].includes(item.status);
            const failed = ['partial', 'failed', 'budget_blocked'].includes(item.status);
            const processing = ['queued', 'processing', 'retry'].includes(item.status);
            const stateClass = `${styles.state} ${
              attention
                ? styles.attention
                : failed
                  ? styles.failed
                  : processing
                    ? styles.processing
                    : ''
            }`;

            return (
              <button
                type="button"
                className={styles.item}
                key={item.id}
                onClick={() => onOpen(item.id)}
              >
                <div className={styles.copy}>
                  <strong>{item.summary || 'ReDream update'}</strong>
                  <span>{timeLabel(item.created_at)}</span>
                </div>
                <div className={styles.right}>
                  <span className={stateClass}>
                    {processing ? (
                      <LoaderCircle size={10} />
                    ) : attention || failed ? (
                      <AlertTriangle size={10} />
                    ) : (
                      <CheckCircle2 size={10} />
                    )}
                    {stateLabel(item.status)}
                  </span>
                  <span className={styles.count}>
                    {Number(item.action_count || 0)} updates
                    {Number(item.question_count || 0)
                      ? ` · ${item.question_count} question`
                      : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : !error ? (
        <div className={styles.empty}>
          Your recent ReDream updates will appear here after you send the first one.
        </div>
      ) : null}
    </section>
  );
}
