'use client';

import {
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import {
  FormEvent,
  useMemo,
  useState,
} from 'react';

import { friendlyError, relativeDate } from '@/lib/platform-client';

import styles from './AgencyMeetingOutcomeDrawer.module.css';

type Rpc = <T = any>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type OutcomeState =
  | ''
  | 'happened'
  | 'did_not_happen'
  | 'rescheduled';

const toIso = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
};

export default function AgencyMeetingOutcomeDrawer({
  meeting,
  rpc,
  onClose,
  onSaved,
}: {
  meeting: any;
  rpc: Rpc;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [outcome, setOutcome] =
    useState<OutcomeState>('');
  const [summary, setSummary] =
    useState('');
  const [followupTitle, setFollowupTitle] =
    useState('');
  const [followupDueAt, setFollowupDueAt] =
    useState('');
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState('');

  const counterparty = useMemo(
    () =>
      String(
        meeting?.person_name ||
          meeting?.organisation_name ||
          meeting?.title ||
          'Meeting',
      ).trim(),
    [meeting],
  );

  const happened = outcome === 'happened';
  const canCreateFollowup =
    happened && Boolean(meeting?.person_id);

  const choose = (next: OutcomeState) => {
    setOutcome(next);
    setError('');

    if (next !== 'happened') {
      setFollowupTitle('');
      setFollowupDueAt('');
    }
  };

  const submit = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) return;

    if (!outcome) {
      setError(
        'Choose what happened with the meeting.',
      );
      return;
    }

    if (
      happened &&
      summary.trim().length < 2
    ) {
      setError(
        'Add a short note about what mattered.',
      );
      return;
    }

    const dueAt = toIso(followupDueAt);

    if (
      happened &&
      followupTitle.trim() &&
      !dueAt
    ) {
      setError(
        'Choose when the follow-up is due.',
      );
      return;
    }

    if (
      happened &&
      dueAt &&
      !followupTitle.trim()
    ) {
      setError(
        'Add the next action for that follow-up.',
      );
      return;
    }

    setBusy(true);
    setError('');

    try {
      await rpc(
        'redream_meeting_record_outcome',
        {
          p_meeting_id:
            meeting?.meeting_id,
          p_state: outcome,
          p_summary:
            summary.trim() || null,
          p_followup_title:
            happened
              ? followupTitle.trim() ||
                null
              : null,
          p_followup_due_at:
            happened ? dueAt : null,
        },
      );

      await onSaved();
    } catch (saveError) {
      setError(
        friendlyError(saveError),
      );
    } finally {
      setBusy(false);
    }
  };

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
        aria-label="Record meeting outcome"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className={styles.header}>
          <div>
            <small>MEETING FOLLOW-UP</small>
            <h2>Did this meeting happen?</h2>
            <p>
              {counterparty}
              {meeting?.ends_at
                ? ' · Scheduled ' +
                  relativeDate(
                    meeting.ends_at,
                  )
                : ''}
            </p>
          </div>

          <button
            type="button"
            data-ui-button="icon"
              className={styles.close}
            onClick={onClose}
            aria-label="Close meeting outcome"
          >
            <X size={17} />
          </button>
        </header>

        <form
          className={styles.form}
          onSubmit={submit}
        >
          <div className={styles.outcomes}>
            <button
              type="button"
              className={
                outcome === 'happened'
                  ? styles.outcomeActive
                  : styles.outcome
              }
              onClick={() =>
                choose('happened')
              }
            >
              <CheckCircle2 size={18} />
              <span>
                <strong>Happened</strong>
                <small>
                  Save what mattered
                </small>
              </span>
            </button>

            <button
              type="button"
              className={
                outcome ===
                'did_not_happen'
                  ? styles.outcomeActive
                  : styles.outcome
              }
              onClick={() =>
                choose(
                  'did_not_happen',
                )
              }
            >
              <XCircle size={18} />
              <span>
                <strong>
                  Didn&apos;t happen
                </strong>
                <small>
                  No conversation recorded
                </small>
              </span>
            </button>

            <button
              type="button"
              className={
                outcome === 'rescheduled'
                  ? styles.outcomeActive
                  : styles.outcome
              }
              onClick={() =>
                choose('rescheduled')
              }
            >
              <RotateCcw size={18} />
              <span>
                <strong>Moved</strong>
                <small>
                  Calendar can bring it back
                </small>
              </span>
            </button>
          </div>

          {outcome ? (
            <section
              className={
                styles.details
              }
            >
              <label>
                {happened
                  ? 'What mattered?'
                  : 'Optional note'}
                <textarea
                  value={summary}
                  onChange={(event) =>
                    setSummary(
                      event.target.value,
                    )
                  }
                  placeholder={
                    happened
                      ? 'What changed, what was discussed, and what should the agency remember?'
                      : outcome ===
                          'rescheduled'
                        ? 'Add any useful note about the move.'
                        : 'Add any useful note.'
                  }
                  rows={4}
                />
              </label>

              {canCreateFollowup ? (
                <div
                  className={
                    styles.followup
                  }
                >
                  <div>
                    <CalendarClock
                      size={15}
                    />
                    <span>
                      <strong>
                        Next follow-up
                      </strong>
                      <small>
                        Optional. Add it now if
                        the meeting created a
                        clear next move.
                      </small>
                    </span>
                  </div>

                  <label>
                    Next action
                    <input
                      value={
                        followupTitle
                      }
                      onChange={(
                        event,
                      ) =>
                        setFollowupTitle(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Send the player profiles"
                    />
                  </label>

                  <label>
                    Due
                    <input
                      type="datetime-local"
                      value={
                        followupDueAt
                      }
                      onChange={(
                        event,
                      ) =>
                        setFollowupDueAt(
                          event.target
                            .value,
                        )
                      }
                    />
                  </label>
                </div>
              ) : happened ? (
                <div className={styles.followupUnavailable}>
                  <CalendarClock size={15} />
                  <span>
                    <strong>Follow-up needs a Network contact</strong>
                    <small>
                      The meeting outcome can still be saved. Link the club contact in Network before creating a personal follow-up.
                    </small>
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <div
              className={styles.error}
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className={styles.truth}>
            A calendar event alone does not
            prove the meeting happened.
            The workspace records a conversation
            only after you confirm it here.
          </div>

          <footer className={styles.footer}>
            <button
              type="button"
              data-ui-button="secondary"
              className={
                styles.secondary
              }
              onClick={onClose}
              disabled={busy}
            >
              Later
            </button>

            <button
              type="submit"
              data-ui-button="primary"
              className={styles.primary}
              disabled={
                busy || !outcome
              }
            >
              {busy ? (
                <LoaderCircle
                  size={15}
                  className={
                    styles.spin
                  }
                />
              ) : (
                <CheckCircle2
                  size={15}
                />
              )}
              {busy
                ? 'Saving...'
                : 'Save outcome'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
