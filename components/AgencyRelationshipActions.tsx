'use client';

import {
  Check,
  ClipboardCheck,
  MessageCircleMore,
  Route,
  X,
} from 'lucide-react';
import {
  FormEvent,
  useMemo,
  useState,
} from 'react';

import { friendlyError } from '@/lib/platform-client';
import styles from './AgencyRelationshipActions.module.css';

type Rpc = <T = any>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type Mode =
  | ''
  | 'conversation'
  | 'followup'
  | 'promise'
  | 'relationship';

const clean = (value: unknown) =>
  String(value || '').trim();

const scoreOptions = {
  strength: [
    ['Developing', 25],
    ['Useful', 50],
    ['Strong', 75],
    ['Very strong', 90],
  ],
  access: [
    ['Difficult', 20],
    ['Possible', 45],
    ['Direct', 75],
    ['Immediate', 90],
  ],
  trust: [
    ['Limited', 25],
    ['Working', 50],
    ['Strong', 75],
    ['Trusted', 90],
  ],
} as const;

const toIso = (value: string) => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
};

export default function AgencyRelationshipActions({
  personId,
  rpc,
  onSaved,
}: {
  personId: string;
  rpc: Rpc;
  onSaved: (result: any) => Promise<void>;
}) {
  const [mode, setMode] =
    useState<Mode>('');

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [summary, setSummary] =
    useState('');

  const [channel, setChannel] =
    useState('whatsapp');

  const [title, setTitle] =
    useState('');

  const [dueAt, setDueAt] =
    useState('');

  const [notes, setNotes] =
    useState('');

  const [strength, setStrength] =
    useState('75');

  const [access, setAccess] =
    useState('75');

  const [trust, setTrust] =
    useState('75');

  const actions = useMemo(
    () => [
      {
        key: 'conversation' as const,
        label: 'Log conversation',
        icon: MessageCircleMore,
      },
      {
        key: 'followup' as const,
        label: 'Add follow-up',
        icon: Check,
      },
      {
        key: 'promise' as const,
        label: 'Add promise',
        icon: ClipboardCheck,
      },
      {
        key: 'relationship' as const,
        label: 'Update relationship',
        icon: Route,
      },
    ],
    [],
  );

  const close = () => {
    setMode('');
    setError('');
  };

  const saved = async (result: any) => {
    await onSaved(result);
    setSummary('');
    setTitle('');
    setDueAt('');
    setNotes('');
    setMode('');
  };

  const submitConversation = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) return;

    if (clean(summary).length < 2) {
      setError('Add a short note about the conversation.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await rpc<any>(
        'redream_relationship_record_interaction',
        {
          p_person_id: personId,
          p_channel: channel,
          p_summary: clean(summary),
          p_occurred_at: new Date().toISOString(),
        },
      );

      await saved(result);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const submitWork = async (
    event: FormEvent,
    kind: 'followup' | 'promise',
  ) => {
    event.preventDefault();

    if (busy) return;

    const iso = toIso(dueAt);

    if (clean(title).length < 2) {
      setError(
        kind === 'promise'
          ? 'Add what we promised to do.'
          : 'Add what needs to happen next.',
      );
      return;
    }

    if (!iso) {
      setError('Choose when this is due.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await rpc<any>(
        'redream_relationship_add_work',
        {
          p_person_id: personId,
          p_kind: kind,
          p_title: clean(title),
          p_due_at: iso,
        },
      );

      await saved(result);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const submitRelationship = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError('');

    try {
      const result = await rpc<any>(
        'redream_relationship_update_route',
        {
          p_person_id: personId,
          p_strength_score: Number(strength),
          p_access_score: Number(access),
          p_trust_score: Number(trust),
          p_notes: clean(notes) || null,
        },
      );

      await saved(result);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <span>DO NEXT</span>
          <h3>Work from the relationship</h3>
        </div>
      </div>

      <div className={styles.actions}>
        {actions.map((action) => {
          const Icon = action.icon;
          const active = mode === action.key;

          return (
            <button
              key={action.key}
              type="button"
              className={active ? styles.active : ''}
              onClick={() => {
                setError('');
                setMode(active ? '' : action.key);
              }}
            >
              <Icon size={15} />
              {action.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className={styles.error}>
          {error}
        </div>
      ) : null}

      {mode === 'conversation' ? (
        <form
          className={styles.form}
          onSubmit={submitConversation}
        >
          <div className={styles.formHead}>
            <strong>Log conversation</strong>
            <button
              type="button"
              onClick={close}
              aria-label="Close conversation form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            Where did you speak?
            <select
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value)
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            What mattered?
            <textarea
              value={summary}
              onChange={(event) =>
                setSummary(event.target.value)
              }
              placeholder="What did they tell us, what player was discussed, or what changed?"
              rows={4}
            />
          </label>

          <button
            className={styles.save}
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save conversation'}
          </button>
        </form>
      ) : null}

      {mode === 'followup' ? (
        <form
          className={styles.form}
          onSubmit={(event) =>
            void submitWork(event, 'followup')
          }
        >
          <div className={styles.formHead}>
            <strong>Add follow-up</strong>
            <button
              type="button"
              onClick={close}
              aria-label="Close follow-up form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            What needs to happen?
            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="Call about the left-back requirement"
            />
          </label>

          <label>
            When?
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) =>
                setDueAt(event.target.value)
              }
            />
          </label>

          <button
            className={styles.save}
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Add follow-up'}
          </button>
        </form>
      ) : null}

      {mode === 'promise' ? (
        <form
          className={styles.form}
          onSubmit={(event) =>
            void submitWork(event, 'promise')
          }
        >
          <div className={styles.formHead}>
            <strong>Add promise</strong>
            <button
              type="button"
              onClick={close}
              aria-label="Close promise form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            What did we promise?
            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="Send two centre-back profiles"
            />
          </label>

          <label>
            Due by
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) =>
                setDueAt(event.target.value)
              }
            />
          </label>

          <button
            className={styles.save}
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save promise'}
          </button>
        </form>
      ) : null}

      {mode === 'relationship' ? (
        <form
          className={styles.form}
          onSubmit={submitRelationship}
        >
          <div className={styles.formHead}>
            <strong>Update your relationship</strong>
            <button
              type="button"
              onClick={close}
              aria-label="Close relationship form"
            >
              <X size={14} />
            </button>
          </div>

          <div className={styles.scoreGrid}>
            <label>
              Relationship
              <select
                value={strength}
                onChange={(event) =>
                  setStrength(event.target.value)
                }
              >
                {scoreOptions.strength.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Access
              <select
                value={access}
                onChange={(event) =>
                  setAccess(event.target.value)
                }
              >
                {scoreOptions.access.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Trust
              <select
                value={trust}
                onChange={(event) =>
                  setTrust(event.target.value)
                }
              >
                {scoreOptions.trust.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label>
            Relationship note
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              placeholder="What should the agency remember about how to work with this person?"
              rows={3}
            />
          </label>

          <button
            className={styles.save}
            type="submit"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Update relationship'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
