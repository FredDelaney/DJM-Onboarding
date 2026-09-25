'use client';

import {
  ArrowRight,
  CalendarClock,
  Clock3,
  MessageCircleMore,
  Route,
  Users,
} from 'lucide-react';

import { relativeDate } from '@/lib/platform-client';
import styles from './AgencyRelationshipMemory.module.css';

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const clean = (value: unknown) =>
  String(value || '').trim();

const stateCopy = (state: string) => {
  if (state === 'current') {
    return {
      label: 'Current',
      copy: 'Meaningful contact recorded in the last 45 days.',
    };
  }

  if (state === 'cooling') {
    return {
      label: 'Cooling',
      copy: 'No meaningful contact recorded for 46 to 90 days.',
    };
  }

  if (state === 'cold') {
    return {
      label: 'Needs attention',
      copy: 'No meaningful contact recorded for more than 90 days.',
    };
  }

  return {
    label: 'Not recorded',
    copy: 'ReDream has no meaningful interaction recorded yet.',
  };
};

export default function AgencyRelationshipMemory({
  memory,
}: {
  memory: any;
}) {
  const routes = list(memory?.routes);
  const interactions = list(memory?.recent_interactions);
  const tasks = list(memory?.open_tasks);
  const commitments = list(memory?.commitments);
  const best = memory?.best_route || {};
  const state = stateCopy(clean(memory?.state));

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <span>RELATIONSHIP MEMORY</span>
          <h3>What the agency knows</h3>
        </div>

        <div className={styles.state}>
          <strong>{state.label}</strong>
          <small>{state.copy}</small>
        </div>
      </div>

      <div className={styles.summary}>
        <div>
          <Route size={15} />
          <span>
            <small>BEST AGENCY ROUTE</small>
            <strong>
              {clean(best?.owner_name) || 'No route recorded'}
            </strong>
            <em>
              {best?.last_meaningful_at
                ? `Last meaningful ${relativeDate(best.last_meaningful_at)}`
                : 'No meaningful date recorded'}
            </em>
          </span>
        </div>

        <div>
          <Users size={15} />
          <span>
            <small>AGENCY ROUTES</small>
            <strong>
              {routes.length} recorded
            </strong>
            <em>
              {routes.length > 1
                ? 'More than one agency relationship is available'
                : routes.length === 1
                  ? 'One direct agency relationship is recorded'
                  : 'No direct agency relationship recorded'}
            </em>
          </span>
        </div>

        <div>
          <CalendarClock size={15} />
          <span>
            <small>OPEN FOLLOW-UP</small>
            <strong>
              {tasks.length + commitments.length}
            </strong>
            <em>
              {tasks[0]?.due_at
                ? `Next ${relativeDate(tasks[0].due_at)}`
                : commitments[0]?.due_at
                  ? `Next ${relativeDate(commitments[0].due_at)}`
                  : 'Nothing currently due'}
            </em>
          </span>
        </div>
      </div>

      {clean(best?.notes) ? (
        <div className={styles.note}>
          <span>RELATIONSHIP NOTE</span>
          <p>{clean(best.notes)}</p>
        </div>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <MessageCircleMore size={14} />
              <strong>Recent conversations</strong>
            </div>
            <span>{interactions.length}</span>
          </div>

          {interactions.length ? (
            <div className={styles.list}>
              {interactions.slice(0, 6).map((item: any) => (
                <div
                  className={styles.row}
                  key={item?.interaction_id}
                >
                  <Clock3 size={13} />
                  <span>
                    <strong>
                      {clean(item?.summary) || 'Interaction recorded'}
                    </strong>
                    <small>
                      {[
                        item?.occurred_at
                          ? relativeDate(item.occurred_at)
                          : null,
                        clean(item?.channel),
                        clean(item?.team_member_name),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              No conversations are recorded yet.
            </p>
          )}
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <ArrowRight size={14} />
              <strong>Open follow-up</strong>
            </div>
            <span>{tasks.length}</span>
          </div>

          {tasks.length ? (
            <div className={styles.list}>
              {tasks.slice(0, 6).map((item: any) => (
                <div
                  className={styles.row}
                  key={item?.task_id}
                >
                  <CalendarClock size={13} />
                  <span>
                    <strong>{clean(item?.title) || 'Follow up'}</strong>
                    <small>
                      {[
                        item?.due_at
                          ? relativeDate(item.due_at)
                          : 'No date',
                        clean(item?.owner_name),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              Nothing is currently due with this person.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
