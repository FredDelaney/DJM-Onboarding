'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
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

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  const submit = async (
    quick = false,
  ) => {
    if (!ctx.player) {
      return;
    }

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

    const payload: any = {
      player_id: ctx.player.id,
      week_start: weekStartISO(),

      availability_status: quick
        ? 'available'
        : availability,

      fitness_status: quick
        ? 'fully_fit'
        : fitness,

      player_notes: quick
        ? null
        : notes.trim() || null,

      support_request: quick
        ? null
        : support.trim() || null,

      club_situation_changed: quick
        ? false
        : clubChanged,

      club_situation_notes: quick
        ? null
        : clubNotes.trim() || null,

      matches_played: quick
        ? null
        : parsedMatches.value,

      minutes_played: quick
        ? null
        : parsedMinutes.value,

      goals: quick
        ? null
        : parsedGoals.value,

      assists: quick
        ? null
        : parsedAssists.value,

      travel_availability:
        ctx.privateInfo
          ?.travel_availability || null,

      submitted_at:
        new Date().toISOString(),
    };

    const existing =
      ctx.latestCheckin?.week_start ===
      weekStartISO()
        ? ctx.latestCheckin
        : null;

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
        'We couldn’t send your check-in. Please try again.',
      );

      setBusy(false);
      return;
    }

    setDone(true);

    await ctx.refresh();

    setBusy(false);
  };

  if (done) {
    return (
      <PlayerShell>
        <main
          className="narrow"
          style={{
            paddingTop: 74,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              background: '#e9f7ef',
              color: '#18794e',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 22px',
            }}
          >
            <Check size={28} />
          </div>

          <h1 className="page-title">
            Done.
          </h1>

          <p
            className="page-intro"
            style={{
              margin: '0 auto',
            }}
          >
            DJM has your update. That’s all
            you need to do this week.
          </p>

          <a
            href="/home"
            className="btn btn-navy"
            style={{
              marginTop: 28,
            }}
          >
            Back home
            <ArrowRight size={16} />
          </a>
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
      <main className="narrow player-shell">
        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: 14,
              background: '#fff4f4',
              color: '#8a1c1c',
              fontSize: 14,
              fontWeight: 650,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="section-kicker"
          style={{
            marginTop: 18,
          }}
        >
          WEEKLY CHECK-IN
        </div>

        <h1 className="page-title">
          60 seconds. Keep DJM current.
        </h1>

        <p
          className="page-intro"
          style={{
            marginBottom: 28,
          }}
        >
          If nothing changed, one tap is
          enough. Otherwise tell us only
          what matters.
        </p>

        <button
          className="quick-good"
          onClick={() => submit(true)}
          disabled={busy}
        >
          <div>
            <strong>
              Everything’s good this week.
            </strong>

            <span>
              Available, fully fit, nothing
              important changed.
            </span>
          </div>

          <ArrowRight size={20} />
        </button>

        <div
          className="row"
          style={{
            margin: '22px 0',
            gap: 12,
          }}
        >
          <div
            style={{
              height: 1,
              background: 'var(--line)',
              flex: 1,
            }}
          />

          <span
            className="tiny muted"
            style={{
              fontWeight: 700,
            }}
          >
            OR UPDATE WHAT CHANGED
          </span>

          <div
            style={{
              height: 1,
              background: 'var(--line)',
              flex: 1,
            }}
          />
        </div>

        <div
          className="stack"
          style={{
            gap: 16,
          }}
        >
          <section className="check-card">
            <h2 className="check-question">
              Are you available?
            </h2>

            <p className="check-help">
              Your current playing / move
              availability.
            </p>

            <div className="choice-grid">
              {[
                [
                  'available',
                  'Available',
                ],
                [
                  'limited',
                  'Limited',
                ],
                [
                  'unavailable',
                  'Unavailable',
                ],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`choice ${
                    availability === value
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setAvailability(value)
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
              No medical detail needed unless
              you want DJM to know.
            </p>

            <div className="choice-grid">
              {[
                [
                  'fully_fit',
                  'Fully fit',
                ],
                [
                  'managing',
                  'Managing something',
                ],
                [
                  'injured',
                  'Injured',
                ],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`choice ${
                    fitness === value
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setFitness(value)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="check-card">
            <h2 className="check-question">
              Anything changed?
            </h2>

            <p className="check-help">
              Club situation, conversations,
              travel, football, anything you
              want your agent to know.
            </p>

            <textarea
              className="textarea"
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              placeholder="Optional…"
            />
          </section>

          <section className="check-card">
            <h2 className="check-question">
              Do you need anything from DJM?
            </h2>

            <p className="check-help">
              A call, club follow-up, contract
              question, travel support,
              anything.
            </p>

            <textarea
              className="textarea"
              value={support}
              onChange={(event) =>
                setSupport(event.target.value)
              }
              placeholder="Optional…"
            />
          </section>

          <section className="check-card">
            <button
              className="row-between"
              style={{
                width: '100%',
                border: 0,
                background: 'none',
                padding: 0,
                textAlign: 'left',
              }}
              onClick={() =>
                setDetails(!details)
              }
            >
              <div>
                <h2
                  className="check-question"
                  style={{
                    marginBottom: 4,
                  }}
                >
                  Add match details
                </h2>

                <p
                  className="check-help"
                  style={{
                    margin: 0,
                  }}
                >
                  Optional numbers if you want
                  them recorded.
                </p>
              </div>

              {details ? (
                <ChevronUp />
              ) : (
                <ChevronDown />
              )}
            </button>

            {details && (
              <div
                style={{
                  marginTop: 22,
                }}
              >
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

                <label
                  className="row"
                  style={{
                    marginTop: 18,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={clubChanged}
                    onChange={(event) =>
                      setClubChanged(
                        event.target.checked,
                      )
                    }
                  />

                  My club/contract situation
                  changed
                </label>

                {clubChanged && (
                  <textarea
                    className="textarea"
                    style={{
                      marginTop: 12,
                    }}
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
            className="btn btn-navy btn-block"
            style={{
              marginTop: 4,
              minHeight: 54,
            }}
            onClick={() => submit(false)}
            disabled={busy}
          >
            {busy
              ? 'Sending…'
              : 'Send check-in'}

            <ArrowRight size={17} />
          </button>
        </div>
      </main>
    </PlayerShell>
  );
}
