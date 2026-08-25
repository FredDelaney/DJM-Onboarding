'use client';

import {
  Check,
  Circle,
  ShieldCheck,
} from 'lucide-react';

export default function ClubReadyPanel({
  state,
}: {
  state: any;
}) {
  return (
    <section className="admin-card club-ready-panel">
      <div className="club-ready-head">
        <div>
          <div className="section-kicker">
            CLUB READY
          </div>

          <h3>
            {state.isReady
              ? 'Ready to present.'
              : 'Finish the essentials.'}
          </h3>
        </div>

        <div
          className={`club-ready-score ${
            state.isReady
              ? 'is-ready'
              : ''
          }`}
        >
          {state.isReady ? (
            <ShieldCheck size={18} />
          ) : (
            <strong>
              {state.requiredDone}/
              {state.requiredTotal}
            </strong>
          )}
        </div>
      </div>

      <div className="club-ready-meter">
        <span
          style={{
            width: `${state.score}%`,
          }}
        />
      </div>

      <div className="club-ready-list">
        {state.required.map(
          (item: any) => (
            <div
              key={item.key}
              className={`club-ready-item ${
                item.ok
                  ? 'is-complete'
                  : ''
              }`}
            >
              {item.ok ? (
                <Check size={15} />
              ) : (
                <Circle size={15} />
              )}

              <span>
                {item.label}
              </span>
            </div>
          ),
        )}
      </div>

      {state.isReady &&
        state.recommendedMissing
          ?.length > 0 && (
          <div className="club-ready-polish">
            <strong>
              Next polish
            </strong>

            <span>
              {state.recommendedMissing
                .slice(0, 2)
                .map(
                  (item: any) =>
                    item.label,
                )
                .join(' · ')}
            </span>
          </div>
        )}

      {!state.isReady && (
        <p className="club-ready-copy">
          DJM can save the player at any
          stage, but the dossier cannot be
          marked Club Ready or published
          until these essentials are
          complete.
        </p>
      )}
    </section>
  );
}
