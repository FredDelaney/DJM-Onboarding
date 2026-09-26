'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  CakeSlice,
  CalendarDays,
  Clock3,
  FileText,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import styles from './AgencyCalendarWorkspace.module.css';

type Horizon = 7 | 30 | 90;

type AgendaItem = {
  key: string;
  kind: 'meeting' | 'follow_up' | 'birthday' | 'deadline';
  dateAt: string;
  dateOnly?: boolean;
  state?: string;
  title: string;
  detail: string;
  category: string;
  playerId?: string;
  clubNeedId?: string;
  entityType?: string;
  entityId?: string;
  personId?: string;
  organisationId?: string;
  meetingUrl?: string;
  source?: string;
  deadlineType?: string;
};

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const parseDate = (value: unknown, dateOnly = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const date = new Date(
    dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T12:00:00`
      : raw,
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const categoryForDeadline = (value: unknown) => {
  switch (String(value || '')) {
    case 'contract_expiry':
      return 'Playing contract';
    case 'representation_record_end':
      return 'Agency agreement';
    case 'document_expiry':
      return 'Player document';
    case 'player_next_action':
      return 'Player action';
    case 'deal_next_action':
      return 'Deal';
    case 'club_need_expiry':
      return 'Club need';
    case 'player_request_due':
      return 'Player request';
    case 'career_strategy_review':
      return 'Career review';
    case 'target_window_end':
      return 'Move window';
    default:
      return 'Agency date';
  }
};

export default function AgencyCalendarWorkspace({
  data,
  basePath,
}: {
  data: any;
  basePath: string;
}) {
  const [horizon, setHorizon] = useState<Horizon>(30);

  const agenda = useMemo(() => {
    const deadlines = list(data?.operations?.deadlines?.items).map(
      (item: any): AgendaItem => ({
        key: `deadline:${item?.deadline_type || 'date'}:${item?.entity_id || item?.title}`,
        kind: 'deadline',
        dateAt: item?.deadline_at,
        dateOnly: Boolean(item?.date_only),
        state: item?.deadline_state,
        title: item?.title || 'Agency date',
        detail:
          item?.next_action?.instruction ||
          categoryForDeadline(item?.deadline_type),
        category: categoryForDeadline(item?.deadline_type),
        playerId: item?.context?.player_id
          ? String(item.context.player_id)
          : undefined,
        clubNeedId: item?.context?.club_need_id
          ? String(item.context.club_need_id)
          : undefined,
        entityType: item?.entity_type,
        entityId: item?.entity_id
          ? String(item.entity_id)
          : undefined,
        deadlineType: item?.deadline_type,
      }),
    );

    const birthdays = list(
      data?.operations?.important_dates?.birthdays?.items,
    ).map(
      (item: any): AgendaItem => ({
        key: `birthday:${item?.item_id || item?.player_id}`,
        kind: 'birthday',
        dateAt: item?.date_at,
        dateOnly: true,
        state: item?.date_state,
        title: item?.title || `${item?.player_name || 'Player'} birthday`,
        detail: item?.turns_age
          ? `Turns ${item.turns_age}`
          : 'Player birthday',
        category: 'Birthday',
        playerId: item?.player_id
          ? String(item.player_id)
          : undefined,
      }),
    );

    const meetings = list(data?.meetings?.items).map(
      (item: any): AgendaItem => ({
        key: `meeting:${item?.meeting_id}`,
        kind: 'meeting',
        dateAt: item?.starts_at,
        title: item?.title || 'Meeting',
        detail:
          [item?.person_name, item?.organisation_name]
            .filter(Boolean)
            .join(' · ') || 'Agency meeting',
        category: 'Meeting',
        personId: item?.person_id
          ? String(item.person_id)
          : undefined,
        organisationId: item?.organisation_id
          ? String(item.organisation_id)
          : undefined,
        meetingUrl: item?.meeting_url || undefined,
      }),
    );

    const followUps = list(data?.follow_ups?.items).map(
      (item: any): AgendaItem => ({
        key: `follow-up:${item?.task_id}`,
        kind: 'follow_up',
        dateAt: item?.due_at,
        title: item?.title || 'Follow-up',
        detail:
          [
            item?.player_name,
            item?.club_name,
            item?.person_name,
            item?.organisation_name,
          ]
            .filter(Boolean)
            .join(' · ') || 'Your follow-up',
        category: 'Follow-up',
        playerId: item?.player_id
          ? String(item.player_id)
          : undefined,
        clubNeedId: item?.club_need_id
          ? String(item.club_need_id)
          : undefined,
        personId: item?.person_id
          ? String(item.person_id)
          : undefined,
        organisationId: item?.organisation_id
          ? String(item.organisation_id)
          : undefined,
        source: item?.source || undefined,
      }),
    );

    const preferred = new Map<string, AgendaItem>();

    [...deadlines, ...birthdays, ...meetings, ...followUps].forEach(
      (item) => {
        let dedupeKey = item.key;

        if (
          item.kind === 'deadline' &&
          item.deadlineType === 'deal_next_action' &&
          item.entityId
        ) {
          dedupeKey = `deal:${item.entityId}`;
        }

        const dealFollowUp = item.source?.match(
          /^redream:deal_followup:(.+)$/,
        )?.[1];

        if (item.kind === 'follow_up' && dealFollowUp) {
          dedupeKey = `deal:${dealFollowUp}`;
        }

        const existing = preferred.get(dedupeKey);
        if (!existing || item.kind === 'follow_up') {
          preferred.set(dedupeKey, item);
        }
      },
    );

    const now = Date.now();
    const max = now + horizon * 24 * 60 * 60 * 1000;

    return [...preferred.values()]
      .filter((item) => {
        const date = parseDate(item.dateAt, item.dateOnly);
        if (!date) return false;
        return item.state === 'overdue' || date.getTime() <= max;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.dateAt, a.dateOnly);
        const bDate = parseDate(b.dateAt, b.dateOnly);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
      });
  }, [data, horizon]);

  const groups = useMemo(() => {
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');

    const grouped = new Map<string, { label: string; items: AgendaItem[] }>();

    agenda.forEach((item) => {
      const date = parseDate(item.dateAt, item.dateOnly);
      if (!date) return;

      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');

      const overdue =
        item.state === 'overdue' ||
        (!item.dateOnly && date.getTime() < Date.now());

      const key = overdue ? 'overdue' : dateKey;
      const label = overdue
        ? 'Overdue'
        : dateKey === todayKey
          ? 'Today'
          : dateKey === tomorrowKey
            ? 'Tomorrow'
            : new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }).format(date);

      const current = grouped.get(key) || { label, items: [] };
      current.items.push(item);
      grouped.set(key, current);
    });

    return [...grouped.entries()].map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [agenda]);

  const formatWhen = (item: AgendaItem) => {
    const date = parseDate(item.dateAt, item.dateOnly);
    if (!date) return 'Date not recorded';

    if (item.dateOnly) {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const iconFor = (item: AgendaItem) => {
    if (item.kind === 'meeting') return <Users size={15} />;
    if (item.kind === 'follow_up') return <Clock3 size={15} />;
    if (item.kind === 'birthday') return <CakeSlice size={15} />;
    if (item.deadlineType === 'contract_expiry') {
      return <BriefcaseBusiness size={15} />;
    }
    if (
      item.deadlineType === 'representation_record_end' ||
      item.deadlineType === 'document_expiry'
    ) {
      return <FileText size={15} />;
    }
    return <CalendarDays size={15} />;
  };

  const actionFor = (item: AgendaItem) => {
    if (item.kind === 'meeting' && item.meetingUrl) {
      return {
        label: 'Meeting link',
        href: item.meetingUrl,
        external: true,
      };
    }

    if (item.playerId) {
      return {
        label: 'Open player',
        href: `${basePath}?view=players&player=${encodeURIComponent(item.playerId)}`,
      };
    }

    if (
      item.clubNeedId ||
      item.entityType === 'deal' ||
      item.entityType === 'club_need'
    ) {
      return {
        label: 'Open Opportunities',
        href: `${basePath}?view=opportunities`,
      };
    }

    if (
      item.kind === 'meeting' ||
      item.personId ||
      item.organisationId
    ) {
      return {
        label: 'Open Network',
        href: `${basePath}?view=network`,
      };
    }

    return {
      label: 'Open Home',
      href: `${basePath}?view=home`,
    };
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.controls}>
        <div className={styles.range} aria-label="Calendar range">
          {([7, 30, 90] as Horizon[]).map((days) => (
            <button
              key={days}
              type="button"
              className={
                horizon === days ? styles.rangeActive : styles.rangeButton
              }
              onClick={() => setHorizon(days)}
            >
              {days} days
            </button>
          ))}
        </div>

        <span className={styles.count}>
          {agenda.length} coming up
        </span>
      </section>

      <section className={styles.agenda}>
        {groups.map((group) => (
          <div className={styles.dayGroup} key={group.key}>
            <div
              className={
                group.key === 'overdue'
                  ? styles.dayLabelAttention
                  : styles.dayLabel
              }
            >
              {group.label}
            </div>

            <div className={styles.rows}>
              {group.items.map((item) => {
                const action = actionFor(item);

                return (
                  <article
                    className={
                      group.key === 'overdue'
                        ? styles.rowAttention
                        : styles.row
                    }
                    key={item.key}
                  >
                    <div className={styles.when}>
                      <span>{formatWhen(item)}</span>
                    </div>

                    <div className={styles.icon}>
                      {iconFor(item)}
                    </div>

                    <div className={styles.copy}>
                      <div className={styles.meta}>
                        <span>{item.category}</span>
                        {item.state ? (
                          <small>{human(item.state)}</small>
                        ) : null}
                      </div>

                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </div>

                    {action.external ? (
                      <a
                        className={styles.action}
                        href={action.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {action.label}
                        <ArrowRight size={13} />
                      </a>
                    ) : (
                      <Link
                        className={styles.action}
                        href={action.href}
                      >
                        {action.label}
                        <ArrowRight size={13} />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {!groups.length ? (
          <div className={styles.empty}>
            <CalendarDays size={20} />
            <strong>Nothing coming up</strong>
            <span>
              Meetings, follow-ups and recorded agency dates will appear here.
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
