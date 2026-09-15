'use client';

import {
  CalendarClock,
  Check,
  Clipboard,
  LoaderCircle,
  MessageSquareText,
  PhoneCall,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { platformInvoke, friendlyError } from '@/lib/platform-client';

import styles from './AgencyInterventionCard.module.css';

export type InterventionOrchestration = {
  available?: boolean | null;
  fingerprint?: string | null;
  intervention?: {
    key?: string | null;
    label?: string | null;
    why?: string | null;
    responsible_party?: string | null;
    impact?: string | null;
    operator_action?: string | null;
    priority?: number | null;
  } | null;
  playbook?: {
    goal?: string | null;
    success_evidence?: string | null;
    quick_action?: string | null;
    steps?: string[];
    customer_message_template?: string | null;
  } | null;
  tracking?: {
    event_count?: number | null;
    contact_count?: number | null;
    last_event_at?: string | null;
    last_contact_at?: string | null;
    follow_up_at?: string | null;
    follow_up_due?: boolean | null;
    last_note?: string | null;
  } | null;
};

const localDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AgencyInterventionCard({
  tenantId,
  agencyName,
  orchestration,
  onRefresh,
  onNotice,
  onError,
}: {
  tenantId: string;
  agencyName: string;
  orchestration?: InterventionOrchestration | null;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const [channel, setChannel] = useState('email');
  const [note, setNote] = useState('');
  const [followUpLocal, setFollowUpLocal] = useState('');

  useEffect(() => {
    setBusy('');
    setChannel('email');
    setNote('');
    setFollowUpLocal('');
  }, [tenantId, orchestration?.fingerprint]);

  const intervention = orchestration?.intervention;
  const playbook = orchestration?.playbook;
  const tracking = orchestration?.tracking;
  const steps = useMemo(() => playbook?.steps || [], [playbook?.steps]);
  const message = String(playbook?.customer_message_template || '').trim();

  if (!orchestration?.available || !intervention || !playbook) return null;

  const followUpIso = () => {
    if (!followUpLocal) return null;
    const parsed = new Date(followUpLocal);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const record = async (eventType: 'contacted' | 'note' | 'follow_up') => {
    if (busy) return;
    if (eventType === 'note' && !note.trim()) {
      onError('Write a short note before saving it.');
      return;
    }
    if (eventType === 'follow_up' && !followUpIso()) {
      onError('Choose a valid follow-up date and time.');
      return;
    }

    setBusy(eventType);
    onError('');

    try {
      await platformInvoke('platform-ops', {
        action: 'record_intervention_event',
        tenant_id: tenantId,
        event_type: eventType,
        channel: eventType === 'contacted' ? channel : null,
        note: note.trim() || null,
        follow_up_at:
          eventType === 'follow_up' || eventType === 'contacted'
            ? followUpIso()
            : null,
      });

      onNotice(
        eventType === 'contacted'
          ? `${agencyName} outreach recorded.`
          : eventType === 'follow_up'
            ? `${agencyName} follow-up scheduled.`
            : `${agencyName} intervention note saved.`,
      );
      setNote('');
      if (eventType !== 'note') setFollowUpLocal('');
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy('');
    }
  };

  const copyMessage = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      onNotice('Agency message copied.');
    } catch {
      onError('Could not copy the message. Select and copy it manually.');
    }
  };

  return (
    <section id="intervention-control" className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p>NEXT INTERVENTION</p>
          <h3>{intervention.label || 'Customer intervention'}</h3>
        </div>
        <span className={styles.impact}>{String(intervention.impact || 'activation').replaceAll('_', ' ')}</span>
      </div>

      <div className={styles.goal}>
        <Target size={16} />
        <div>
          <span>Outcome</span>
          <strong>{playbook.goal}</strong>
        </div>
      </div>

      <div className={styles.steps}>
        {steps.map((step, index) => (
          <div key={`${intervention.key || 'step'}:${index}`}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </div>
        ))}
      </div>

      <div className={styles.evidence}>
        <Check size={14} />
        <div>
          <span>Done when</span>
          <strong>{playbook.success_evidence}</strong>
        </div>
      </div>

      {message ? (
        <div className={styles.messageBox}>
          <div>
            <MessageSquareText size={14} />
            <strong>Agency message</strong>
          </div>
          <p>{message}</p>
          <button type="button" onClick={() => void copyMessage()}>
            <Clipboard size={13} />
            Copy message
          </button>
        </div>
      ) : null}

      <div className={`${styles.tracking} ${tracking?.follow_up_due ? styles.due : ''}`}>
        <div>
          <span>Contacts</span>
          <strong>{tracking?.contact_count || 0}</strong>
        </div>
        <div>
          <span>Last contact</span>
          <strong>{localDate(tracking?.last_contact_at)}</strong>
        </div>
        <div>
          <span>{tracking?.follow_up_due ? 'Follow-up overdue' : 'Follow-up'}</span>
          <strong>{localDate(tracking?.follow_up_at)}</strong>
        </div>
      </div>

      {tracking?.last_note ? (
        <div className={styles.lastNote}>
          <span>Latest note</span>
          <p>{tracking.last_note}</p>
        </div>
      ) : null}

      <div className={styles.activityForm}>
        <div className={styles.formRow}>
          <label>
            <span>Contact channel</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="link">Secure link</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Follow-up</span>
            <input
              type="datetime-local"
              value={followUpLocal}
              onChange={(event) => setFollowUpLocal(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.noteField}>
          <span>Operator note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 2000))}
            placeholder="What happened, what is blocked, or what was agreed?"
            rows={3}
          />
        </label>

        <div className={styles.actions}>
          <button type="button" onClick={() => void record('note')} disabled={Boolean(busy) || !note.trim()}>
            {busy === 'note' ? <LoaderCircle size={13} className={styles.spin} /> : <MessageSquareText size={13} />}
            Save note
          </button>
          <button type="button" onClick={() => void record('follow_up')} disabled={Boolean(busy) || !followUpLocal}>
            {busy === 'follow_up' ? <LoaderCircle size={13} className={styles.spin} /> : <CalendarClock size={13} />}
            Set follow-up
          </button>
          <button type="button" className={styles.primary} onClick={() => void record('contacted')} disabled={Boolean(busy)}>
            {busy === 'contacted' ? <LoaderCircle size={13} className={styles.spin} /> : <PhoneCall size={13} />}
            Log contact
          </button>
        </div>
      </div>

      <p className={styles.truth}>
        ReDream records operator actions but never lets a manual note resolve the intervention. The blocker clears only when customer evidence changes.
      </p>
    </section>
  );
}
