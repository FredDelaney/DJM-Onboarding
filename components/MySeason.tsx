'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import {
  dossierHeadlineStats,
  dossierPerformance,
  dossierVerifiedDate,
} from '@/lib/dossier';

const num = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const shortDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        day: 'numeric',
        month: 'short',
      },
    ).format(
      new Date(`${value}T12:00:00`),
    );
  } catch {
    return value;
  }
};

export default function MySeason({
  checkins = [],
  seasonLabel,
  seasonStart,
  verifiedProfile,
}: {
  checkins?: any[];
  seasonLabel?: string | null;
  seasonStart?: string | null;
  verifiedProfile?: any;
}) {
  const ordered = [...checkins]
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(a.week_start).getTime() -
        new Date(b.week_start).getTime(),
    );

  const bounded = seasonStart
    ? ordered.filter(
        (row) =>
          String(row.week_start) >=
          seasonStart,
      )
    : ordered;

  const tracked = bounded.filter(
    (row) =>
      row.matches_played != null ||
      row.minutes_played != null ||
      row.goals != null ||
      row.assists != null,
  );

  const latestWeekly =
    bounded[bounded.length - 1] || null;

  const isVerified = !!(
    verifiedProfile?.published &&
    verifiedProfile?.verified_at
  );

  const verifiedStats = isVerified
    ? dossierHeadlineStats(
        verifiedProfile,
        4,
      )
    : [];

  const verifiedPerformance = isVerified
    ? dossierPerformance(
        verifiedProfile,
        4,
      )
    : {
        metric: 'minutes',
        rows: [],
      };

  const verifiedDate =
    dossierVerifiedDate(
      verifiedProfile?.verified_at,
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

  const recent = tracked.slice(-8);
  const maxMinutes = Math.max(
    90,
    ...recent.map(
      (row) =>
        num(row.minutes_played),
    ),
  );

  const points = recent.map(
    (row, index) => {
      const x =
        recent.length === 1
          ? 50
          : 4 +
            (index /
              (recent.length - 1)) *
              92;
      const value = num(
        row.minutes_played,
      );
      const y =
        38 -
        Math.min(
          value / maxMinutes,
          1,
        ) *
          31;

      return {
        x,
        y,
        label: shortDate(
          row.week_start,
        ),
      };
    },
  );

  const trackerLabel = seasonLabel
    ? `MY SEASON · ${seasonLabel}`
    : 'MY SEASON';

  const hasVerified =
    verifiedStats.length > 0 ||
    verifiedPerformance.rows.length > 0;

  return (
    <section className="season-card season-premium-card">
      <div className="season-top">
        <div>
          <div className="season-kicker">
            {trackerLabel}
          </div>
          <h2>
            Your football picture.
          </h2>
        </div>

        {isVerified ? (
          <span className="season-verified-pill">
            <ShieldCheck size={13} />
            DJM verified
          </span>
        ) : (
          <span className="season-private">
            Private
          </span>
        )}
      </div>

      {hasVerified ? (
        <>
          <div className="season-verified-head">
            <div>
              <span>
                VERIFIED CAREER DATA
              </span>
              <strong>
                Club-facing numbers DJM has reviewed.
              </strong>
            </div>
            {verifiedDate && (
              <small>
                Checked {verifiedDate}
              </small>
            )}
          </div>

          {verifiedStats.length > 0 && (
            <div className="season-verified-grid">
              {verifiedStats.map(
                (
                  stat: any,
                  index: number,
                ) => (
                  <div key={index}>
                    <strong>
                      {stat.value}
                    </strong>
                    <span>
                      {stat.label}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          {verifiedPerformance.rows.length > 0 && (
            <div className="season-verified-performance">
              {verifiedPerformance.rows
                .slice(0, 3)
                .map(
                  (
                    row: any,
                    index: number,
                  ) => (
                    <div
                      key={index}
                      className="season-verified-row"
                    >
                      <div>
                        <strong>
                          {row.season_label ||
                            row.season ||
                            'Season'}
                        </strong>
                        <span>
                          {[
                            row.club_name ||
                              row.club,
                            row.league,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>

                      <div className="season-verified-bar">
                        <span
                          style={{
                            width: `${row.visualPercentage}%`,
                          }}
                        />
                      </div>

                      <strong>
                        {row.visualLabel}
                      </strong>
                    </div>
                  ),
                )}
            </div>
          )}
        </>
      ) : (
        <div className="season-awaiting-verified">
          <ShieldCheck size={20} />
          <div>
            <strong>
              DJM is building your verified football record.
            </strong>
            <span>
              Official club-facing numbers appear here once they have been reviewed.
            </span>
          </div>
        </div>
      )}

      <div className="season-personal-log">
        <div className="season-personal-head">
          <div>
            <span>
              YOUR WEEKLY LOG
            </span>
            <strong>
              A private record for you and DJM.
            </strong>
          </div>
          <Activity size={18} />
        </div>

        {tracked.length > 0 ? (
          <>
            <div className="season-personal-metrics">
              <div>
                <strong>{totals.matches}</strong>
                <span>Matches logged</span>
              </div>
              <div>
                <strong>
                  {totals.minutes.toLocaleString(
                    'en-GB',
                  )}
                </strong>
                <span>Minutes logged</span>
              </div>
              <div>
                <strong>
                  {totals.goals}
                </strong>
                <span>Goals logged</span>
              </div>
              <div>
                <strong>
                  {totals.assists}
                </strong>
                <span>Assists logged</span>
              </div>
            </div>

            {recent.length > 1 && (
              <div className="season-trend season-premium-trend">
                <div className="season-trend-head">
                  <div>
                    <span>
                      RECENT MINUTES LOGGED
                    </span>
                    <strong>
                      Your last {recent.length}
                      {' '}
                      entries
                    </strong>
                  </div>
                  <TrendingUp size={18} />
                </div>

                <div className="season-chart">
                  <svg
                    viewBox="0 0 100 42"
                    preserveAspectRatio="none"
                    aria-label="Recent minutes logged"
                    role="img"
                  >
                    <line
                      x1="4"
                      x2="96"
                      y1="38"
                      y2="38"
                      className="season-chart-base"
                    />
                    <polyline
                      points={points
                        .map(
                          (point) =>
                            `${point.x},${point.y}`,
                        )
                        .join(' ')}
                      className="season-chart-line"
                    />
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
                    {points.map(
                      (
                        point,
                        index,
                      ) => (
                        <span key={index}>
                          {point.label}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="season-personal-empty">
            <CheckCircle2 size={18} />
            <div>
              <strong>
                Match numbers are optional.
              </strong>
              <span>
                Your weekly check-in is mainly for availability, how you are feeling and anything DJM should know.
              </span>
            </div>
          </div>
        )}

        <div className="season-foot season-premium-foot">
          <span>
            Player-entered numbers stay in your private log. DJM verifies statistics separately before clubs see them.
          </span>
          <Link href="/check-in">
            {latestWeekly
              ? 'Update week'
              : 'Check in'}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
