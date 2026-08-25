'use client';

import Link from 'next/link';

import {
  Activity,
  ArrowRight,
  Target,
  TrendingUp,
} from 'lucide-react';

const num = (value: any) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const shortDate = (
  value: string,
) => {
  try {
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        day: 'numeric',
        month: 'short',
      },
    ).format(
      new Date(
        `${value}T12:00:00`,
      ),
    );
  } catch {
    return value;
  }
};

export default function MySeason({
  checkins = [],
  seasonLabel,
  seasonStart,
}: {
  checkins?: any[];
  seasonLabel?: string | null;
  seasonStart?: string | null;
}) {
  const ordered = [...checkins]
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(
          a.week_start,
        ).getTime() -
        new Date(
          b.week_start,
        ).getTime(),
    );

  const bounded =
    seasonStart
      ? ordered.filter(
          (row) =>
            String(
              row.week_start,
            ) >= seasonStart,
        )
      : ordered;

  const tracked = bounded.filter(
    (row) =>
      row.matches_played != null ||
      row.minutes_played != null ||
      row.goals != null ||
      row.assists != null,
  );

  const totals = tracked.reduce(
    (acc, row) => ({
      matches:
        acc.matches +
        num(row.matches_played),

      minutes:
        acc.minutes +
        num(row.minutes_played),

      goals:
        acc.goals +
        num(row.goals),

      assists:
        acc.assists +
        num(row.assists),
    }),
    {
      matches: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
    },
  );

  const contributions =
    totals.goals +
    totals.assists;

  const minsPerContribution =
    contributions > 0
      ? Math.round(
          totals.minutes /
            contributions,
        )
      : null;

  const recent =
    tracked.slice(-8);

  const maxMinutes =
    Math.max(
      90,
      ...recent.map(
        (row) =>
          num(
            row.minutes_played,
          ),
      ),
    );

  const points =
    recent.map(
      (row, index) => {
        const x =
          recent.length === 1
            ? 50
            : 4 +
              (
                index /
                (
                  recent.length -
                  1
                )
              ) *
                92;

        const value =
          num(
            row.minutes_played,
          );

        const y =
          38 -
          Math.min(
            value /
              maxMinutes,
            1,
          ) *
            31;

        return {
          x,
          y,
          label:
            shortDate(
              row.week_start,
            ),
        };
      },
    );

  const linePoints =
    points
      .map(
        (point) =>
          `${point.x},${point.y}`,
      )
      .join(' ');

  const nextMilestone =
    Math.max(
      500,
      Math.ceil(
        (
          totals.minutes +
          1
        ) /
          500,
      ) *
        500,
    );

  const remaining =
    nextMilestone -
    totals.minutes;

  const trackerLabel =
    seasonLabel
      ? `MY SEASON · ${seasonLabel}`
      : 'MY SEASON';

  if (!tracked.length) {
    return (
      <section className="season-card season-card-empty">
        <div className="season-top">
          <div>
            <div className="season-kicker">
              {trackerLabel}
            </div>

            <h2>
              Build your season record.
            </h2>
          </div>

          <div className="season-icon">
            <Activity size={19} />
          </div>
        </div>

        <p>
          Add match details during your
          weekly check-in and DJM Player
          will build your private playing
          record automatically.
        </p>

        <Link
          href="/check-in"
          className="season-link"
        >
          Add this week
          <ArrowRight size={16} />
        </Link>
      </section>
    );
  }

  return (
    <section className="season-card">
      <div className="season-top">
        <div>
          <div className="season-kicker">
            {trackerLabel}
          </div>

          <h2>
            {seasonStart
              ? 'Your season, at a glance.'
              : 'Your tracked record, at a glance.'}
          </h2>
        </div>

        <span className="season-private">
          {seasonStart
            ? 'Season tracker'
            : 'Recent tracker'}
        </span>
      </div>

      <div className="season-primary">
        <div>
          <strong>
            {totals.minutes.toLocaleString(
              'en-GB',
            )}
          </strong>

          <span>
            minutes tracked
          </span>
        </div>

        <div className="season-primary-side">
          <span>
            {tracked.length}
            {' '}
            weekly update
            {tracked.length === 1
              ? ''
              : 's'}
          </span>
        </div>
      </div>

      <div className="season-metrics">
        <div>
          <strong>
            {totals.matches}
          </strong>
          <span>Apps</span>
        </div>

        <div>
          <strong>
            {totals.goals}
          </strong>
          <span>Goals</span>
        </div>

        <div>
          <strong>
            {totals.assists}
          </strong>
          <span>Assists</span>
        </div>

        <div>
          <strong>
            {contributions}
          </strong>
          <span>G + A</span>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="season-trend">
          <div className="season-trend-head">
            <div>
              <span>
                RECENT MINUTES
              </span>

              <strong>
                Last {recent.length}
                {' '}
                tracked weeks
              </strong>
            </div>

            <TrendingUp
              size={18}
            />
          </div>

          <div className="season-chart">
            <svg
              viewBox="0 0 100 42"
              preserveAspectRatio="none"
              aria-label="Recent minutes trend"
              role="img"
            >
              <line
                x1="4"
                x2="96"
                y1="38"
                y2="38"
                className="season-chart-base"
              />

              {points.length >
                1 && (
                <polyline
                  points={
                    linePoints
                  }
                  className="season-chart-line"
                />
              )}

              {points.map(
                (
                  point,
                  index,
                ) => (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r="1.8"
                    className="season-chart-point"
                  />
                ),
              )}
            </svg>

            <div className="season-chart-labels">
              {recent.map(
                (
                  row,
                  index,
                ) => (
                  <span key={index}>
                    {shortDate(
                      row.week_start,
                    )}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      <div className="season-insights">
        {minsPerContribution !==
          null && (
          <div className="season-insight">
            <Target size={17} />

            <div>
              <strong>
                {
                  minsPerContribution
                }
              </strong>

              <span>
                mins per goal
                contribution
              </span>
            </div>
          </div>
        )}

        <div className="season-insight">
          <Activity size={17} />

          <div>
            <strong>
              {remaining.toLocaleString(
                'en-GB',
              )}
            </strong>

            <span>
              mins to{' '}
              {nextMilestone.toLocaleString(
                'en-GB',
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="season-foot">
        <span>
          Private player tracker.
          Club-facing statistics are
          verified separately by DJM
          before publication.
        </span>

        <Link href="/check-in">
          Update
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
