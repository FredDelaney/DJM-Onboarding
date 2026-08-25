'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
} from 'lucide-react';

import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';

import {
  supabase,
  weekStartISO,
} from '@/lib/supabase';

import {
  optionalNonNegativeInteger,
} from '@/lib/validation';

const value = (input: any) =>
  input === null ||
  input === undefined
    ? ''
    : String(input);

export default function CheckIn() {
  const ctx = usePlayerContext();

  const [availability, setAvailability] =
    useState('available');

  const [fitness, setFitness] =
    useState('fully_fit');

  const [notes, setNotes] =
    useState('');

  const [support, setSupport] =
    useState('');

  const [details, setDetails] =
    useState(false);

  const [matches, setMatches] =
    useState('');

  const [minutes, setMinutes] =
    useState('');

  const [goals, setGoals] =
    useState('');

  const [assists, setAssists] =
    useState('');

  const [clubChanged, setClubChanged] =
    useState(false);

  const [clubNotes, setClubNotes] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [done, setDone] =
    useState(false);

  const [error, setError] =
    useState('');

  const currentWeek =
    weekStartISO();

  const existing =
    ctx.latestCheckin?.week_start ===
    currentWeek
      ? ctx.latestCheckin
      : null;

  useEffect(() => {
    if (!existing) return;

    setAvailability(
      existing.availability_status ||
        'available',
    );

    setFitness(
      existing.fitness_status ||
        'fully_fit',
    );

    setNotes(
      existing.player_notes || '',
    );

    setSupport(
      existing.support_request || '',
    );

    setMatches(
      value(existing.matches_played),
    );

    setMinutes(
      value(existing.minutes_played),
    );

    setGoals(
      value(existing.goals),
    );

    setAssists(
      value(existing.assists),
    );

    setClubChanged(
      !!existing.club_situation_changed,
    );

    setClubNotes(
      existing.club_situation_notes || '',
    );

    if (
      existing.matches_played != null ||
      existing.minutes_played != null ||
      existing.goals != null ||
      existing.assists != null ||
      existing.club_situation_changed
    ) {
      setDetails(true);
    }
  }, [existing?.id]);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  const submit = async (
    quick = false,
  ) => {
    if (!ctx.player) return;

    setBusy(true);
    setError('');

    const parsedMatches =
      optionalNonNegativeInteger(
        matches,
        'Matches',
      );

    const parsedMinutes =
      optionalNonNegativeInteger(
        minutes,
        'Minutes',
      );

    const parsedGoals =
      optionalNonNegativeInteger(
        goals,
        'Goals',
      );

    const parsedAssists =
      optionalNonNegativeInteger(
        assists,
        'Assists',
      );

    const validationError = [
      parsedMatches,
      parsedMinutes,
      parsedGoals,
      parsedAssists,
    ].find((item) => item.error)?.error;

    if (!quick && validationError) {
      setError(validationError);
      setBusy(false);

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      return;
    }

    /*
     * A quick update must never destroy
     * match information already saved for
     * the current week.
     */
    const payload: any = {
      player_id: ctx.player.id,
      week_start: currentWeek,

      availability_status: quick
        ? 'available'
        : availability,

      fitness_status: quick
        ? 'fully_fit'
        : fitness,

      player_notes: quick
        ? existing?.player_notes || null
        : notes.trim() || null,

      support_request: quick
        ? existing?.support_request || null
        : support.trim() || null,

      club_situation_changed: quick
        ? existing?.club_situation_changed ||
          false
        : clubChanged,

      club_situation_notes: quick
        ? existing?.club_situation_notes ||
          null
        : clubNotes.trim() || null,

      matches_played: quick
        ? existing?.matches_played ?? null
        : parsedMatches.value,

      minutes_played: quick
        ? existing?.minutes_played ?? null
        : parsedMinutes.value,

      goals: quick
        ? existing?.goals ?? null
        : parsedGoals.value,

      assists: quick
        ? existing?.assists ?? null
        : parsedAssists.value,

      travel_availability:
        ctx.privateInfo
          ?.travel_availability || null,

      submitted_at:
        new Date().toISOString(),
    };

    const query = existing
      ? supabase
          .from('weekly_checkins')
          .update(payload)
          .eq('id', existing.id)
      : supabase
          .from('weekly_checkins')
          .insert(payload);

    const {
      error: submitError,
    } = await query;

    if (submitError) {
      setError(
        'We couldn’t send your update. Please try again.',
      );

      setBusy(false);
      return;
    }

setDone(true);
setBusy(false);

void ctx.refresh();
  };

  if (done) {
    return (
      <PlayerShell>
        <main className="narrow player-shell check-done">
          <div className="check-success">
            <Check size={27} />
          </div>

          <div className="section-kicker">
            WEEKLY UPDATE
          </div>

          <h1 className="page-title">
            Done.
          </h1>

          <p className="page-intro">
            DJM has your update and your
            season tracker has been refreshed.
          </p>

          <Link
            href="/home"
            className="btn btn-navy"
          >
            See My Season
            <ArrowRight size={16} />
          </Link>
        </main>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell
      inboxCount={
        ctx.openRequests.length
      }
    >
      <main className="narrow player-shell checkin-21">
        {error && (
          <div
            className="check-alert"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="section-kicker">
          WEEKLY CHECK-IN
        </div>

        <h1 className="page-title">
          Keep DJM current.
        </h1>

        <p className="page-intro">
          If nothing important changed, one
          tap is enough. Add match details and
          your private season tracker updates
          automatically.
        </p>

        {existing && (
          <section className="existing-checkin">
            <div>
              <span>
                THIS WEEK
              </span>

              <strong>
                Already submitted
              </strong>

              <small>
                {[
                  existing.matches_played != null
                    ? `${existing.matches_played} match${
                        existing.matches_played === 1
                          ? ''
                          : 'es'
                      }`
                    : null,
                  existing.minutes_played != null
                    ? `${existing.minutes_played} mins`
                    : null,
                  existing.goals != null
                    ? `${existing.goals} goal${
                        existing.goals === 1
                          ? ''
                          : 's'
                      }`
                    : null,
                  existing.assists != null
                    ? `${existing.assists} assist${
                        existing.assists === 1
                          ? ''
                          : 's'
                      }`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                  'You can update it below'}
              </small>
            </div>

            <Clock3 size={18} />
          </section>
        )}

        <button
          className="quick-good"
          onClick={() => submit(true)}
          disabled={busy}
        >
          <div>
            <strong>
              {existing
                ? 'Everything is still good.'
                : 'Everything’s good this week.'}
            </strong>

            <span>
              Available, fully fit and nothing
              important changed.
            </span>
          </div>

          <ArrowRight size={20} />
        </button>

        <div className="check-divider">
          <span />
          <small>
            {existing
              ? 'EDIT THIS WEEK'
              : 'OR UPDATE WHAT CHANGED'}
          </small>
          <span />
        </div>

        <div className="stack check-stack">
          <section className="check-card">
            <h2 className="check-question">
              Are you available?
            </h2>

            <p className="check-help">
              Your current playing and move
              availability.
            </p>

            <div className="choice-grid">
              {[
                ['available', 'Available'],
                ['limited', 'Limited'],
                ['unavailable', 'Unavailable'],
              ].map(([itemValue, label]) => (
                <button
                  type="button"
                  key={itemValue}
                  className={`choice ${
                    availability === itemValue
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setAvailability(itemValue)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="check-card">
            <h2 className="check-question">
              How’s the body?
            </h2>

            <p className="check-help">
              No medical detail is required
              unless you want DJM to know.
            </p>

            <div className="choice-grid">
              {[
                ['fully_fit', 'Fully fit'],
                ['managing', 'Managing'],
                ['injured', 'Unavailable'],
              ].map(([itemValue, label]) => (
                <button
                  type="button"
                  key={itemValue}
                  className={`choice ${
                    fitness === itemValue
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setFitness(itemValue)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="check-card">
            <h2 className="check-question">
              Anything DJM should know?
            </h2>

            <p className="check-help">
              Club situation, conversations,
              travel or anything else that
              matters.
            </p>

            <textarea
              className="textarea"
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              placeholder="Optional"
            />
          </section>

          <section className="check-card">
            <h2 className="check-question">
              Need anything from DJM?
            </h2>

            <p className="check-help">
              A call, club follow-up, contract
              question or anything else.
            </p>

            <textarea
              className="textarea"
              value={support}
              onChange={(event) =>
                setSupport(
                  event.target.value,
                )
              }
              placeholder="Optional"
            />
          </section>

          <section className="check-card">
            <button
              type="button"
              className="check-expand"
              onClick={() =>
                setDetails(!details)
              }
            >
              <div>
                <h2 className="check-question">
                  Match details
                </h2>

                <p className="check-help">
                  Add this week’s numbers to
                  My Season.
                </p>
              </div>

              {details ? (
                <ChevronUp size={20} />
              ) : (
                <ChevronDown size={20} />
              )}
            </button>

            {details && (
              <div className="check-details">
                <div className="grid2">
                  <div className="field">
                    <label className="label">
                      Matches
                    </label>

                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={matches}
                      onChange={(event) =>
                        setMatches(
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">
                      Minutes
                    </label>

                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={minutes}
                      onChange={(event) =>
                        setMinutes(
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">
                      Goals
                    </label>

                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={goals}
                      onChange={(event) =>
                        setGoals(
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label">
                      Assists
                    </label>

                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={assists}
                      onChange={(event) =>
                        setAssists(
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>

                <label className="check-toggle">
                  <input
                    type="checkbox"
                    checked={clubChanged}
                    onChange={(event) =>
                      setClubChanged(
                        event.target.checked,
                      )
                    }
                  />

                  <span>
                    My club or contract situation
                    changed
                  </span>
                </label>

                {clubChanged && (
                  <textarea
                    className="textarea"
                    value={clubNotes}
                    onChange={(event) =>
                      setClubNotes(
                        event.target.value,
                      )
                    }
                    placeholder="What changed?"
                  />
                )}
              </div>
            )}
          </section>

          <button
            className="btn btn-navy btn-block check-submit"
            onClick={() => submit(false)}
            disabled={busy}
          >
            {busy
              ? 'Saving…'
              : existing
                ? 'Update this week'
                : 'Send weekly update'}

            <ArrowRight size={17} />
          </button>
        </div>
      </main>
    </PlayerShell>
  );
}
