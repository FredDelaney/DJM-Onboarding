'use client';

import Link from 'next/link';
import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {pitchDeliveryLabel, pitchReplyLabels, readPitchHistory, type PitchHistoryInvoke, type PitchHistoryItem} from '@/lib/club-pitch-history';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {compactDate} from '@/lib/platform-client';
import styles from './ClubPitchHistory.module.css';

const channels = {phone:'Phone', email:'Email', message:'Message', in_person:'In person', other:'Other'};

function RecordReply({pitch, invoke, onSaved}: {
  pitch: PitchHistoryItem;
  invoke: PitchHistoryInvoke;
  onSaved: () => void;
}) {
  const formId = useId();
  const [open,setOpen] = useState(false);
  const [reply,setReply] = useState('');
  const [channel,setChannel] = useState('');
  const [note,setNote] = useState('');
  const [commandId,setCommandId] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const pending = useRef<AbortController|null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !reply || !channel || !note.trim()) return;
    const controller = new AbortController();
    pending.current = controller;
    const command = commandId || crypto.randomUUID();
    setCommandId(command);
    setBusy(true);
    setError('');
    const outcome = await writeWithDeadline(async signal => {
      try {
        const result = await invoke('club_request_pitch_reply_record', {
          club_need_id:pitch.club_need_id, share_id:pitch.share_id, command_id:command,
          reply_type:reply, channel, note:note.trim(),
        }, signal);
        return {receipt:result?.receipt};
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && ['22023','42501','40001'].includes(String(cause.code))) {
          return {error:cause.message};
        }
        throw cause;
      }
    }, 12000, controller.signal);
    if (controller.signal.aborted) return;
    pending.current = null;
    setBusy(false);
    if (outcome.status === 'complete' && outcome.result.error) {
      setCommandId('');
      setError(outcome.result.error);
    } else if (outcome.status === 'complete' && outcome.result.receipt?.command_id === command
      && outcome.result.receipt?.share_id === pitch.share_id) {
      setOpen(false);
      setCommandId('');
      setReply('');
      setChannel('');
      setNote('');
      onSaved();
    } else {
      setError('The save could not be confirmed. Retry the same reply to check it safely.');
    }
  }

  if (!open) return <div><button className={styles.action} type="button" onClick={() => setOpen(true)}>Record club reply</button></div>;
  return <form className={styles.form} onSubmit={save} aria-label="Record a reply received outside ReDream">
    <div className={styles.field}>
      <label htmlFor={formId + '-reply'}>Club reply</label>
      <select id={formId + '-reply'} required value={reply} disabled={!!commandId} onChange={event => setReply(event.target.value)}>
        <option value="">Choose a reply</option>
        {Object.entries(pitchReplyLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className={styles.field}>
      <label htmlFor={formId + '-channel'}>Received via</label>
      <select id={formId + '-channel'} required value={channel} disabled={!!commandId} onChange={event => setChannel(event.target.value)}>
        <option value="">Choose a channel</option>
        {Object.entries(channels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className={styles.field}>
      <label htmlFor={formId + '-note'}>What did the club say?</label>
      <textarea id={formId + '-note'} required maxLength={2000} rows={3} value={note} disabled={!!commandId} onChange={event => setNote(event.target.value)}/>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.actions}>
      <button className={styles.action} type="submit" disabled={busy || !reply || !channel || !note.trim()}>
        {busy ? 'Saving…' : commandId ? 'Retry same reply' : 'Save club reply'}
      </button>
      {!commandId ? <button className={styles.action} type="button" onClick={() => setOpen(false)}>Cancel</button> : null}
    </div>
  </form>;
}

export default function ClubPitchHistory({scope, scopeId, basePath, invoke, refreshKey = 0, onReview}: {
  scope: 'request' | 'player';
  scopeId: string;
  basePath: string;
  invoke: PitchHistoryInvoke;
  refreshKey?: number;
  onReview?: (pitch: PitchHistoryItem) => (() => void) | undefined;
}) {
  const [history,setHistory] = useState<ReturnType<typeof readPitchHistory>|null>(null);
  const [error,setError] = useState(false);
  const [reload,setReload] = useState(0);
  const [notice,setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    setError(false);
    void readWithDeadline(
      invoke('club_request_pitch_history', {scope,scope_id:scopeId}, controller.signal), 12000, controller.signal,
    ).then(payload => {
      if (!controller.signal.aborted) setHistory(readPitchHistory(payload,scope,scopeId));
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [scope,scopeId,invoke,refreshKey,reload]);

  return <section className={styles.section} aria-label="Pitch history">
    <h3 className={styles.heading}>Pitches and replies</h3>
    {notice ? <p className={styles.muted} role="status">{notice}</p> : null}
    {error ? <div role="alert">
      <p>Pitch history could not load.</p>
      <button type="button" className={styles.action} onClick={() => setReload(value => value+1)}>Retry pitch history</button>
    </div> : !history ? <p className={styles.muted} role="status">Loading pitch history…</p> : !history.items.length ? (
      <p className={styles.muted}>No pitches recorded yet.</p>
    ) : <>
      {history.hasMore ? <p className={styles.muted}>Showing up to 50 pitch records.</p> : null}
      <ul className={styles.list}>{history.items.map(pitch => {
        const current = history.items.find(item => item.player_match_id === pitch.player_match_id && !item.revoked_at);
        const review = current === pitch ? onReview?.(pitch) : undefined;
        return <li key={pitch.share_id} className={styles.item}>
        <div className={styles.title}>
          <strong>{scope === 'request' ? pitch.player_name : pitch.club_name}</strong>
          <span className={styles.status}>{pitchDeliveryLabel(pitch)}</span>
        </div>
        {scope === 'player' ? pitch.request_available
          ? <Link className={styles.requestLink} prefetch={false} href={`${basePath}?view=opportunities&tab=needs&record=${encodeURIComponent(pitch.club_need_id)}`}>{pitch.need_title}</Link>
          : <span className={styles.muted}>{pitch.need_title}</span> : null}
        {pitch.sent_at ? <p className={styles.muted}>Sent <time dateTime={pitch.sent_at}>{compactDate(pitch.sent_at)}</time></p> : null}
        {pitch.revoked_at ? <p className={styles.muted}>Link withdrawn</p> : pitch.expires_at && Date.parse(pitch.expires_at) <= Date.now() ? <p className={styles.muted}>Link expired</p> : null}
        {pitch.link_reply ? <div className={styles.reply}>
          <strong>{pitchReplyLabels[pitch.link_reply.response_type]}</strong>
          <span>Via pitch link · identity unverified</span>
          {pitch.link_reply.message ? <p>{pitch.link_reply.message}</p> : null}
        </div> : null}
        {pitch.staff_reply ? <div className={styles.reply}>
          <strong>{pitchReplyLabels[pitch.staff_reply.response_type]}</strong>
          <span>Recorded by agency · {channels[pitch.staff_reply.channel as keyof typeof channels] || 'Channel unavailable'}</span>
          <p>{pitch.staff_reply.message}</p>
        </div> : null}
        {pitch.sent_at && !pitch.link_reply && !pitch.staff_reply ? <p className={styles.muted}>Awaiting a recorded reply.</p> : null}
        <div className={styles.actions}>
          {review ? <button type="button" className={styles.action} onClick={review}>Review pitch</button> : null}
          {scope === 'request' && pitch.sent_at ? <RecordReply pitch={pitch} invoke={invoke} onSaved={() => {
            setNotice('Club reply recorded.');
            setReload(value => value+1);
          }}/> : null}
        </div>
      </li>;
      })}</ul>
    </>}
  </section>;
}
