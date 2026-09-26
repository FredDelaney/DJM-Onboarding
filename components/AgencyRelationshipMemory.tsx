'use client';

import {
  CalendarClock,
  Clock3,
  MessageCircleMore,
  Route,
  ShieldCheck,
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
  const followups = list(
    memory?.followups ?? memory?.open_tasks,
  );
  const promises = list(
    memory?.promises ?? memory?.commitments,
  );
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
            <small>WHO KNOWS THEM</small>
            <strong>
              {routes.length} recorded
            </strong>
            <em>
              {routes.length > 1
                ? 'Multiple agency relationships are available'
                : routes.length === 1
                  ? 'One agency relationship is recorded'
                  : 'No agency relationship recorded'}
            </em>
          </span>
        </div>

        <div>
          <CalendarClock size={15} />
          <span>
            <small>NEXT FOLLOW-UP</small>
            <strong>{followups.length}</strong>
            <em>
              {followups[0]?.due_at
                ? `Next ${relativeDate(followups[0].due_at)}`
                : 'Nothing currently due'}
            </em>
          </span>
        </div>

        <div>
          <ShieldCheck size={15} />
          <span>
            <small>PROMISES TO KEEP</small>
            <strong>{promises.length}</strong>
            <em>
              {promises[0]?.due_at
                ? `Next ${relativeDate(promises[0].due_at)}`
                : 'No open promise recorded'}
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

      <div className={styles.routes}>
        <div className={styles.blockHead}>
          <div>
            <Users size={14} />
            <strong>Agency routes</strong>
          </div>
          <span>{routes.length}</span>
        </div>

        {routes.length ? (
          <div className={styles.routeChips}>
            {routes.slice(0, 6).map((route: any) => (
              <div key={clean(route?.owner_user_id) || clean(route?.owner_name)}>
                <strong>
                  {clean(route?.owner_name) || 'Agency relationship'}
                </strong>
                <span>
                  {route?.last_meaningful_at
                    ? `Last meaningful ${relativeDate(route.last_meaningful_at)}`
                    : 'No meaningful date recorded'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No agency relationship is recorded yet.
          </p>
        )}
      </div>

      <div className={styles.columns}>
        <MemoryBlock
          title="Recent conversations"
          count={interactions.length}
          icon="conversation"
          empty="No conversations are recorded yet."
          items={interactions.slice(0, 6).map((item: any) => ({
            id: item?.interaction_id,
            title: clean(item?.summary) || 'Interaction recorded',
            meta: [
              item?.occurred_at
                ? relativeDate(item.occurred_at)
                : null,
              clean(item?.channel),
              clean(item?.team_member_name),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <MemoryBlock
          title="Open follow-up"
          count={followups.length}
          icon="followup"
          empty="Nothing is currently due with this person."
          items={followups.slice(0, 6).map((item: any) => ({
            id: item?.task_id,
            title: clean(item?.title) || 'Follow up',
            meta: [
              item?.due_at
                ? relativeDate(item.due_at)
                : 'No date',
              clean(item?.owner_name),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <MemoryBlock
          title="Promises"
          count={promises.length}
          icon="promise"
          empty="No open promise is recorded."
          items={promises.slice(0, 6).map((item: any) => ({
            id:
              item?.commitment_id ||
              item?.task_id,
            title:
              clean(item?.title) ||
              clean(item?.task_title) ||
              'Promise',
            meta: [
              item?.due_at
                ? relativeDate(item.due_at)
                : 'No date',
              clean(item?.owner_name),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
      </div>
    </section>
  );
}

function MemoryBlock({
  title,
  count,
  empty,
  items,
  icon,
}: {
  title: string;
  count: number;
  empty: string;
  items: Array<{
    id: string;
    title: string;
    meta: string;
  }>;
  icon: 'conversation' | 'followup' | 'promise';
}) {
  const HeaderIcon =
    icon === 'conversation'
      ? MessageCircleMore
      : icon === 'promise'
        ? ShieldCheck
        : CalendarClock;

  const RowIcon =
    icon === 'conversation'
      ? Clock3
      : icon === 'promise'
        ? ShieldCheck
        : CalendarClock;

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <div>
          <HeaderIcon size={14} />
          <strong>{title}</strong>
        </div>
        <span>{count}</span>
      </div>

      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => (
            <div
              className={styles.row}
              key={item.id}
            >
              <RowIcon size={13} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </div>
  );
}
