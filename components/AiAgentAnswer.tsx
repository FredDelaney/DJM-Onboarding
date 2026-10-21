'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpen, Globe, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { platformInvoke, platformRpc, friendlyError } from '@/lib/platform-client';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { supabase } from '@/lib/supabase';
import type { EntityContext } from '@/lib/entity-context';
import { UUID_PATTERN } from '@/lib/entity-context';
import AgencyWorkBrief from './AgencyWorkBrief';
import {
  isWorkQuestion, workBriefRequest, workBriefError, briefConversationText,
  type WorkBrief, type WorkRecord,
} from '@/lib/agency-work-brief';
import styles from './AiAgentAnswer.module.css';

type Answer = {
  ok: boolean;
  work_brief?: WorkBrief;
  evidence?: string[];
  uncertainties?: string[];
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

type AgentProps = {
  workspaceSlug: string;
  context?: EntityContext;
  onBusyChange: (busy: boolean) => void;
  onNavigate?: () => void;
  onPrepareAction?: (text: string) => void;
};

export default function AiAgentAnswer(props: AgentProps) {
  return <AgentConversation key={JSON.stringify([props.workspaceSlug, props.context || {}])} {...props} />;
}

function AgentConversation({ workspaceSlug, context, onBusyChange, onNavigate, onPrepareAction }: AgentProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);
  const lastQuestion = useRef('');
  const lastSelected = useRef<WorkRecord | undefined>(undefined);

  useEffect(() => {
    let userId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id || null;
      if (userId !== undefined && userId !== nextId) {
        generation.current++;
        lastQuestion.current = ''; lastSelected.current = undefined;
        inFlight.current = false;
        setAnswer(null); setHistory([]); setQuestion(''); setError(''); setBusy(false);
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

  async function ask(selected?: WorkRecord, refresh = false) {
    const submitted = selected || refresh ? lastQuestion.current : question.trim();
    if (inFlight.current || !submitted) return;
    lastQuestion.current = submitted;
    lastSelected.current = selected;
    const request = ++generation.current;
    inFlight.current = true;
    setBusy(true); onBusyChange(true); setError(''); setAnswer(null);
    try {
      let result: Answer;
      if (selected || isWorkQuestion(submitted)) {
        const brief = await readWithDeadline(platformRpc<WorkBrief>(
          'redream_agency_work_brief_v1', workBriefRequest(submitted, context, selected), workspaceSlug,
        ), 12_000);
        if (!brief || !['choose', 'brief'].includes(brief.mode) || (brief.mode === 'brief' && !Array.isArray(brief.tasks))) {
          throw new Error('Your work could not be confirmed. Please try again.');
        }
        result = {
          ok: true, answer: brief.mode === 'choose' ? 'Choose the right agency record to continue.' : 'Recorded work, ownership and context.',
          basis: 'internal', work_brief: brief,
        };
      } else result = await readWithDeadline(platformInvoke<Answer>('redream-agent', {
        query: submitted, workspace_slug: workspaceSlug, context: context || {}, history,
      }), 55_000);
      if (generation.current !== request) return;
      if (!result?.ok || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('ReDream could not answer that. Please try again.');
      setAnswer(result);
      if (refresh) return;
      setHistory(previous => [...previous,
        { role: 'user' as const, content: submitted },
        { role: 'assistant' as const, content: result.work_brief ? briefConversationText(result.work_brief) : [result.answer, ...(result.evidence || []), ...(result.uncertainties || []), result.next_action].filter(Boolean).join('\n').slice(0, 2000) },
      ].slice(-6));
      setQuestion('');
    } catch (failure) {
      if (generation.current === request) setError(selected || isWorkQuestion(submitted) ? workBriefError(failure) : friendlyError(failure));
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

  const hasRecordContext = Boolean(context?.player_id || context?.player_name || context?.person_id || context?.person_name || context?.organisation_id || context?.organisation_name || context?.prospect_id || context?.prospect_name);
  const suggest = (text: string) => { setQuestion(text); inputRef.current?.focus(); };
  return <div className={styles.panel}>
    {history.length ? <div className={styles.conversationBar}>
      <span>Follow-up questions keep this conversation</span>
      <button type="button" disabled={busy} onClick={() => { setHistory([]); setAnswer(null); setQuestion(''); setError(''); lastQuestion.current=''; lastSelected.current=undefined; inputRef.current?.focus(); }}>New conversation</button>
    </div> : null}
    {history.length > 2 ? <details className={styles.disclosure}><summary>Earlier in this conversation</summary>
      {history.slice(0, -2).map((turn, i) => <p className={styles.copy} key={i}><strong>{turn.role === 'user' ? 'You' : 'ReDream'}</strong><br /><AnswerText text={turn.content} /></p>)}
    </details> : null}
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void ask(); }}>
      <textarea ref={inputRef} aria-label="Your question" placeholder={answer ? "Ask a follow-up..." : "Ask about a player, club or your next action..."} value={question}
        maxLength={2000} disabled={busy} onChange={event => setQuestion(event.target.value)} />
      <button type="submit" disabled={busy || !question.trim()}>
        {busy ? <LoaderCircle size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
        {busy ? 'Thinking...' : 'Ask ReDream'}
      </button>
    </form>
    {!history.length ? <div className={styles.suggestions}>
      <button type="button" disabled={busy} onClick={() => suggest(hasRecordContext ? 'What do I still need to do for this record?' : 'Show my work')}>My work</button>
      <button type="button" disabled={busy} onClick={() => suggest(hasRecordContext ? 'What was recorded for this record?' : 'What did we agree with ')}>Recorded context</button>
      <button type="button" disabled={busy} onClick={() => suggest(context?.player_id || context?.player_name ? 'Review this player’s next move. Separate recorded facts, realistic options and the key missing information.' : 'What are my priorities today? Explain what needs action first and why.')}>{context?.player_id || context?.player_name ? 'Review next move' : 'My priorities'}</button>
      <button type="button" disabled={busy} onClick={() => suggest('What do we know about this record, what is out of date and what should we verify next?')}>Find the gaps</button>
    </div> : null}
    {busy ? <div role="status" className={styles.muted}>Thinking...</div> : null}
    {error ? <div role="alert" className={styles.error}><p>{error}</p><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>void ask(lastSelected.current,true)}>Retry</button></div> : null}
    {answer ? <section className={styles.answer} aria-label="ReDream answer" aria-live="polite">
      {history.length ? <p className={styles.question}>{history[history.length - 2].content}</p> : null}
      <div className={styles.basis}><BookOpen size={13} aria-hidden="true" />{basis}</div>
      {answer.work_brief ? <AgencyWorkBrief
        key={JSON.stringify([answer.work_brief.record, answer.work_brief.search, answer.work_brief.as_of])}
        brief={answer.work_brief} showNotes={/\b(?:agree|agreed|recorded|notes)\b/i.test(lastQuestion.current)}
        workspaceSlug={workspaceSlug} busy={busy} onSelect={record => void ask(record)}
        onRefresh={() => void ask(answer.work_brief?.record || undefined, true)}
        onPrepare={onPrepareAction} onNavigate={onNavigate}
      /> : <p className={styles.copy}><AnswerText text={answer.answer} /></p>}
      {answer.clarification_question && !answer.answer.includes(answer.clarification_question)
        ? <p className={styles.next}>{answer.clarification_question}</p> : null}
      {answer.evidence?.length ? <details className={styles.disclosure}><summary>Evidence · {answer.evidence.length}</summary>
        <ul>{answer.evidence.map((item, index) => <li key={index}><AnswerText text={item} /></li>)}</ul>
      </details> : null}
      {answer.uncertainties?.length ? <details className={styles.disclosure}><summary>Missing information and blockers · {answer.uncertainties.length}</summary>
        <ul>{answer.uncertainties.map((item, index) => <li key={index}><AnswerText text={item} /></li>)}</ul>
      </details> : null}
      {answer.next_action ? <div className={styles.next}><span>Next action</span><p>{answer.next_action}</p>
        {onPrepareAction ? <button type="button" className="btn btn-outline" onClick={() => onPrepareAction(`Create a task for me: ${answer.next_action}`)}>Review as a task</button> : null}
      </div> : null}
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
      {!answer.work_brief ? <div className={styles.suggestions}>
        <button type="button" disabled={busy} onClick={() => suggest('Which options are most realistic? Explain the evidence, likely role and main blockers for each. Do not invent club interest.')}>Assess the options</button>
        <button type="button" disabled={busy} onClick={() => suggest('Draft a short approach for the strongest supported option. Ask who it is for if the recipient is unclear. Keep private agency information out.')}>Draft an approach</button>
      </div> : null}
    </section> : null}
  </div>;
}
