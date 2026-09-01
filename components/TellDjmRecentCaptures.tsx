'use client';

import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { djmRpc } from '@/lib/djm-os';
import styles from './TellDjmRecentCaptures.module.css';

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

export default function TellDjmRecentCaptures({
  refreshKey,
  onOpen,
}: {
  refreshKey?: number;
  onOpen: (captureId: string) => void;
}) {
  const [items, setItems] = useState<RecentCapture[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoadRef = useRef(true);

  const load = useCallback(async (initial = false) => {
    if (initial) setInitialLoading(true);
    else setRefreshing(true);

    try {
      const result = await djmRpc<RecentCapture[]>('djm_tell_recent_captures', {
        p_limit: 8,
      });
      setItems(Array.isArray(result) ? result : []);
    } catch {
      if (initial) setItems([]);
    } finally {
      if (initial) setInitialLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = firstLoadRef.current;
    firstLoadRef.current = false;
    void load(initial);
  }, [load, refreshKey]);

  return (
    <section className={styles.section} aria-label="Recent Tell DJM captures">
      <div className={styles.head}>
        <div>
          <strong>Recent</strong>
          <span>Your last Tell DJM updates and their real status.</span>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load(false)}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {initialLoading && !items.length ? (
        <div className={styles.empty}>Checking your recent captures...</div>
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
                  <strong>{item.summary || 'Tell DJM update'}</strong>
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
      ) : (
        <div className={styles.empty}>
          Your Tell DJM history will appear here after the first capture.
        </div>
      )}
    </section>
  );
}
