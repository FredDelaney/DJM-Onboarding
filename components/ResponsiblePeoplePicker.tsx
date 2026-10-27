'use client';

import { useId, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Assignee } from '@/lib/calendar/tasks';
import styles from './ResponsiblePeoplePicker.module.css';

export default function ResponsiblePeoplePicker({
  members, selected, onChange, disabled = false, knownPeople = [], label = 'Responsible', showSelectAll = true,
}: {
  members: Assignee[]; selected: string[]; onChange: (ids: string[]) => void;
  disabled?: boolean; knownPeople?: Assignee[]; label?: string; showSelectAll?: boolean;
}) {
  const id = useId();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const people = [...members, ...knownPeople.filter(person => !members.some(member => member.user_id === person.user_id))];
  const activeIds = [...new Set(members.filter(member => member.active !== false).map(member => member.user_id))];
  const matches = members.filter(member => member.display_name.toLowerCase().includes(query.trim().toLowerCase()));
  const atLimit = selected.length >= 50;
  const allSelected = selected.length === activeIds.length && activeIds.every(userId => selected.includes(userId));
  const toggle = (userId: string) => {
    if (disabled) return;
    if (selected.includes(userId)) onChange(selected.filter(value => value !== userId));
    else if (!atLimit && activeIds.includes(userId)) onChange([...selected, userId]);
  };

  return <div className={styles.field} role="group" aria-labelledby={id}>
    <span id={id} className={styles.label}>{label}</span>
    {selected.length ? <div className={styles.selection}>
      {selected.map(userId => {
        const person = people.find(member => member.user_id === userId);
        return <button key={userId} type="button" className={styles.chip} disabled={disabled}
          aria-label={`Remove ${person?.display_name || 'team member'}`} onClick={() => { toggle(userId); search.current?.focus(); }}>
          <span className={styles.avatar} aria-hidden="true">{(person?.display_name || '?').split(' ').map(part => part[0]).slice(0, 2).join('')}</span>
          <span>{person?.display_name || 'Team member'}</span><X size={13} aria-hidden="true" />
        </button>;
      })}
    </div> : null}
    <div className={styles.picker}>
      <label className={styles.search}><Search size={15} aria-hidden="true" /><input ref={search} aria-label="Search agency members"
        value={query} placeholder="Find someone" disabled={disabled} onChange={event => setQuery(event.target.value)} /></label>
      <div className={styles.tools}>
        {showSelectAll && activeIds.length > 0 ? <button type="button" disabled={disabled || allSelected || activeIds.length > 50}
          onClick={() => { onChange([...selected.filter(userId => activeIds.includes(userId)), ...activeIds.filter(userId => !selected.includes(userId))]); search.current?.focus(); }}>All current staff</button> : null}
        {selected.length ? <button type="button" disabled={disabled} onClick={() => { onChange([]); search.current?.focus(); }}>Clear selection</button> : null}
      </div>
      {atLimit || activeIds.length > 50 ? <p className={styles.hint}>Choose up to 50 people.</p> : null}
      <div className={styles.options}>
        {matches.map(member => <label key={member.user_id} className={styles.option}>
          <input type="checkbox" checked={selected.includes(member.user_id)} disabled={disabled || member.active === false || (atLimit && !selected.includes(member.user_id))} onChange={() => toggle(member.user_id)} />
          <span>{member.display_name}{member.active === false ? <small>Inactive</small> : null}</span>{selected.includes(member.user_id) ? <Check size={16} aria-hidden="true" /> : null}
        </label>)}
        {!members.length ? <p>No agency staff available.</p> : !matches.length ? <p>No matching members.</p> : null}
      </div>
    </div>
  </div>;
}
