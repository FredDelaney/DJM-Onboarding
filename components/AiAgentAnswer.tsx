'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpen, Globe, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { platformInvoke, friendlyError } from '@/lib/platform-client';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { supabase } from '@/lib/supabase';
import type { EntityContext } from '@/lib/entity-context';
import { UUID_PATTERN } from '@/lib/entity-context';
import styles from './AiAgentAnswer.module.css';

type Answer = {
  ok: boolean;
  answer: string;
  basis: 'internal' | 'public' | 'mixed' | 'insufficient';
  clarification_question?: string | null;
  next_action?: string | null;
  sources?: Array<{ title: string; url: string }>;
  internal_matches?: Array<{ id: string; kind: string; title: string }>;
};

function publicUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function recordHref(kind: string, id: string, workspaceSlug: string) {
  if (!UUID_PATTERN.test(id) || !/^[a-z0-9][a-z0-9-]*$/.test(workspaceSlug)) return null;
  const queries: Record<string, string> = {
    player: '?view=players&player=',
    recruitment: '?view=players&tab=recruitment&target=',
    club: '?view=network&network=clubs&club=',
    contact: '?view=network&network=people&person=',
    opportunity: '?view=opportunities&tab=needs&record=',
    deal: '?view=opportunities&tab=deals&record=',
  };
  return queries[kind] ? `/workspace/${workspaceSlug}${queries[kind]}${id}` : null;
}

function AnswerText({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    const match = /^\[([^\]]+)\]\((.+)\)$/.exec(part);
    const url = match ? publicUrl(match[2]) : null;
    return match && url ? <a key={index} href={url} target="_blank" rel="noopener noreferrer">{match[1]}</a> : part;
  })}</>;
}

export default function AiAgentAnswer({ workspaceSlug, context, onBusyChange, onNavigate }: {
  workspaceSlug: string;
  context?: EntityContext;
  onBusyChange: (busy: boolean) => void;
  onNavigate?: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let userId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id || null;
      if (userId !== undefined && userId !== nextId) {
        generation.current++;
        inFlight.current = false;
        setAnswer(null); setQuestion(''); setError(''); setBusy(false);
        onBusyChange(false);
      }
      userId = nextId;
    });
    return () => {
      generation.current++;
      subscription.unsubscribe();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function ask() {
    if (inFlight.current || !question.trim()) return;
    const request = ++generation.current;
    inFlight.current = true;
    setBusy(true); onBusyChange(true); setError(''); setAnswer(null);
    try {
      const result = await readWithDeadline(platformInvoke<Answer>('redream-agent', {
        query: question.trim(), workspace_slug: workspaceSlug, context: context || {},
      }), 55_000);
      if (generation.current !== request) return;
      if (!result?.ok || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('ReDream could not answer that. Please try again.');
      setAnswer(result);
    } catch (failure) {
      if (generation.current === request) setError(friendlyError(failure));
    } finally {
      if (generation.current === request) {
        inFlight.current = false;
        setBusy(false); onBusyChange(false);
      }
    }
  }

  const basis = {
    internal: 'From ReDream', public: 'Public research', mixed: 'ReDream + public sources', insufficient: 'More information needed',
  }[answer?.basis || 'insufficient'];
  const sources = (answer?.sources || []).flatMap(source => {
    const url = publicUrl(source.url);
    return url ? [{ ...source, url }] : [];
  });

  return <div className={styles.panel}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void ask(); }}>
      <textarea aria-label="Your question" placeholder="What do we know about Kota?" value={question}
        maxLength={2000} disabled={busy} onChange={event => setQuestion(event.target.value)} />
      <button type="submit" disabled={busy || !question.trim()}>
        {busy ? <LoaderCircle size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
        {busy ? 'Thinking...' : 'Ask ReDream'}
      </button>
    </form>
    {busy ? <div role="status" className={styles.muted}>Thinking...</div> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {answer ? <section className={styles.answer} aria-label="ReDream answer" aria-live="polite">
      <div className={styles.basis}><BookOpen size={13} aria-hidden="true" />{basis}</div>
      <p className={styles.copy}><AnswerText text={answer.answer} /></p>
      {answer.clarification_question && !answer.answer.includes(answer.clarification_question)
        ? <p className={styles.next}>{answer.clarification_question}</p> : null}
      {answer.next_action ? <div className={styles.next}><span>Next action</span><p>{answer.next_action}</p></div> : null}
      {(answer.internal_matches || []).length ? <div className={styles.records}>
        {(answer.internal_matches || []).map(record => {
          const href = recordHref(record.kind, record.id, workspaceSlug);
          return href ? <Link key={`${record.kind}:${record.id}`} href={href} onClick={onNavigate}>
            {record.title}<ArrowUpRight size={12} aria-hidden="true" />
          </Link> : null;
        })}
      </div> : null}
      {sources.length ? <div className={styles.sources} aria-label="Public sources">
        <span><Globe size={12} aria-hidden="true" />Public sources</span>
        {sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={12} aria-hidden="true" /></a>)}
      </div> : null}
    </section> : null}
  </div>;
}
