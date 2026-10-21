'use client';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Clock3,
  Users,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import {
  briefFollowUp,
  workRecordHref,
  workTaskHref,
  workDealHref,
  type WorkBrief,
  type WorkRecord,
} from '@/lib/agency-work-brief';
import styles from './AgencyWorkBrief.module.css';
export default function AgencyWorkBrief({
  brief,
  workspaceSlug,
  onSelect,
  onPrepare,
  onNavigate,
  onRefresh,
  busy,
  showNotes,
}: {
  brief: WorkBrief;
  workspaceSlug: string;
  onSelect: (record: WorkRecord) => void;
  onPrepare?: (text: string) => void;
  onNavigate?: () => void;
  onRefresh: () => void;
  busy: boolean;
  showNotes?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const date = (raw?: string | null, dateOnly = false) => {
    if (!raw) return 'No date';
    const value = new Date(dateOnly ? raw.slice(0, 10) + 'T12:00:00Z' : raw);
    if (Number.isNaN(value.getTime())) return 'Date needs checking';
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      ...(!dateOnly ? { timeStyle: 'short' as const } : {}),
      timeZone: dateOnly ? 'UTC' : brief.time_zone || 'Europe/Rome',
    }).format(value);
  };
  if (brief.mode === 'choose')
    return (
      <section className={styles.brief} aria-label="Choose a work record">
        <header>
          <span>YOUR AGENCY RECORDS</span>
          <h3>
            {brief.candidates?.length
              ? 'Which record did you mean?'
              : brief.search
                ? 'No matching record found'
                : 'Which record should I look up?'}
          </h3>
        </header>
        <p>
          {brief.candidates?.length
            ? 'Choose once to see its linked work and recorded context.'
            : 'Try the full player, contact or club name. Only records you can access are searched.'}
        </p>
        <div className={styles.choices}>
          {(brief.candidates || []).map((record) => (
            <button
              key={record.kind + record.id}
              type="button"
              onClick={() => onSelect(record)}
              disabled={busy}
            >
              <span>
                <strong>{record.title}</strong>
                <small>
                  {record.kind === 'recruitment'
                    ? 'Recruitment prospect'
                    : record.kind}
                </small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        {brief.limited ? (
          <small>There are more matches. Use a more specific name.</small>
        ) : null}
      </section>
    );
  const tasks = brief.tasks || [],
    notes = brief.notes || [],
    blockers = brief.blockers || [],
    recordHref = brief.record
      ? workRecordHref(brief.record, workspaceSlug)
      : null;
  return (
    <section className={styles.brief} aria-label="Your work brief">
      <header>
        <div>
          <span>YOUR WORK</span>
          <h3>{brief.record?.title || 'My priorities'}</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          aria-label="Refresh work brief"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      <div className={styles.summary}>
        <span>
          {tasks.length}
          {brief.limited ? '+' : ''} open
        </span>
        <span>{tasks.filter((task) => task.overdue).length} overdue</span>
        <small>Checked {date(brief.as_of)}</small>
      </div>
      <div className={styles.work}>
        {!tasks.length ? (
          <p className={styles.empty}>
            {brief.limited
              ? 'No items in this limited selection. Open Calendar or the record to review the rest.'
              : brief.record
                ? 'No open work linked to this record is assigned to you.'
                : 'No open work is recorded for you.'}
          </p>
        ) : (
          (showAll ? tasks : tasks.slice(0, 5)).map((task) => {
            const href = workTaskHref(task, workspaceSlug);
            return (
              <article key={task.kind + task.id}>
                <div className={styles.taskTitle}>
                  <strong>{task.title}</strong>
                  {task.overdue ? (
                    <span className={styles.overdue}>Overdue</span>
                  ) : null}
                </div>
                <div className={styles.meta}>
                  <span>
                    <Clock3 size={13} />
                    {date(
                      task.date_only ? task.due_on : task.due_at,
                      task.date_only,
                    )}
                  </span>
                  <span>
                    <Users size={13} />
                    {task.owner_user_id === brief.user_id
                      ? 'You'
                      : task.owner_name}
                    {task.shared ? ' · Shared' : ''}
                  </span>
                </div>
                {task.people?.length ? (
                  <small className={styles.people}>
                    Responsible:{' '}
                    {task.people
                      .map((person) =>
                        person.user_id === brief.user_id
                          ? 'You'
                          : person.display_name,
                      )
                      .join(', ')}
                  </small>
                ) : null}
                <div className={styles.actions}>
                  {href ? (
                    <Link href={href} onClick={onNavigate}>
                      {task.kind === 'calendar_task'
                        ? 'Open task'
                        : Object.values(task.context || {}).some(Boolean)
                          ? 'Open record'
                          : 'Open Calendar'}
                      <ArrowUpRight size={13} />
                    </Link>
                  ) : null}
                  {onPrepare &&
                  task.owner_user_id === brief.user_id &&
                  ['task', 'calendar_task'].includes(task.kind) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onPrepare(`Update on my task "${task.title}": `)
                      }
                    >
                      Update with Tell
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
      {tasks.length > 5 ? (
        <button
          type="button"
          className={styles.more}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Show less' : `Show all ${tasks.length} items`}
        </button>
      ) : null}
      {brief.limited ? (
        <p className={styles.scope}>
          Showing a bounded selection. Open Calendar or a specific record to
          review the rest.
        </p>
      ) : null}
      {blockers.length ? (
        <details className={styles.evidence} open>
          <summary>
            Blockers and next decisions <span>{blockers.length}</span>
          </summary>
          {blockers.map((item) => (
            <article key={item.id}>
              <strong>{item.title}</strong>
              {item.blocker ? <p>{item.blocker}</p> : null}
              {item.next_decision ? (
                <p>
                  <small>Next decision</small>
                  {item.next_decision}
                </p>
              ) : null}
              {workDealHref(item.id, workspaceSlug) ? (
                <Link
                  href={workDealHref(item.id, workspaceSlug)!}
                  onClick={onNavigate}
                >
                  Open deal
                  <ArrowUpRight size={13} />
                </Link>
              ) : null}
              {onPrepare ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onPrepare(
                      briefFollowUp(brief, item.blocker || item.next_decision),
                    )
                  }
                >
                  Plan a follow-up
                </button>
              ) : null}
            </article>
          ))}
        </details>
      ) : null}
      {brief.record && brief.notes_visible ? (
        <details className={styles.evidence} open={showNotes}>
          <summary>
            <FileText size={15} />
            Recent recorded notes <span>{notes.length}</span>
          </summary>
          <p className={styles.scope}>
            Recorded context may need confirmation before you rely on it as an
            agreement.
          </p>
          {notes.length ? (
            notes.map((note) => (
              <article key={note.id}>
                <small>
                  {date(note.occurred_at)}
                  {note.source_type
                    ? ' · ' + note.source_type.replaceAll('_', ' ')
                    : ''}
                </small>
                <p>{note.summary}</p>
                {onPrepare ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onPrepare(briefFollowUp(brief, note.summary))
                    }
                  >
                    Plan a follow-up
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p>No recent notes are recorded for this record.</p>
          )}
        </details>
      ) : null}
      <p className={styles.scope}>
        {brief.record
          ? 'Work is linked to this record; unlinked Calendar tasks appear in My priorities.'
          : 'Includes your tasks and work shared with you.'}
        {!brief.notes_visible
          ? ' Internal notes and deal blockers require administrator access.'
          : ''}
      </p>
      <footer>
        {recordHref ? (
          <Link href={recordHref} onClick={onNavigate}>
            Open{' '}
            {brief.record?.kind === 'recruitment'
              ? 'recruitment record'
              : brief.record?.kind}
            <ArrowUpRight size={14} />
          </Link>
        ) : (
          <Link
            href={`/workspace/${workspaceSlug}?view=calendar`}
            onClick={onNavigate}
          >
            Open Calendar
            <ArrowUpRight size={14} />
          </Link>
        )}
        {onPrepare ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPrepare(briefFollowUp(brief))}
          >
            Prepare follow-up
            <ArrowRight size={14} />
          </button>
        ) : null}
      </footer>
    </section>
  );
}
