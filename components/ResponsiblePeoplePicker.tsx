'use client';

import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Assignee } from '@/lib/calendar/tasks';
import styles from './ResponsiblePeoplePicker.module.css';

export default function ResponsiblePeoplePicker({
  members, selected, onChange, disabled = false, knownPeople = [], label = 'Responsible',
}: {
  members: Assignee[]; selected: string[]; onChange: (ids: string[]) => void;
  disabled?: boolean; knownPeople?: Assignee[]; label?: string;
}) {
  const id = useId();
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [query, setQuery] = useState('');
  const people = [...members, ...knownPeople.filter(person => !members.some(member => member.user_id === person.user_id))];
  const toggle = (userId: string) => onChange(selected.includes(userId) ? selected.filter(value => value !== userId) : [...selected, userId]);
  const close = () => { if (menu.current) menu.current.open = false; trigger.current?.focus(); };

  return <div className={styles.field} role="group" aria-labelledby={id}>
    <span id={id} className={styles.label}>{label}</span>
    <div className={styles.selection}>
      {selected.map(userId => {
        const person = people.find(member => member.user_id === userId);
        return <button key={userId} type="button" className={styles.chip} disabled={disabled}
          aria-label={`Remove ${person?.display_name || 'team member'}`} onClick={() => toggle(userId)}>
          <span className={styles.avatar} aria-hidden="true">{(person?.display_name || '?').split(' ').map(part => part[0]).slice(0, 2).join('')}</span>
          <span>{person?.display_name || 'Team member'}</span><X size={13} aria-hidden="true" />
        </button>;
      })}
      <details ref={menu} className={styles.menu} onKeyDown={event => {
        if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); close(); }
      }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { if (menu.current) menu.current.open = false; } }}>
        <summary ref={trigger} aria-label="Choose responsible people" aria-disabled={disabled}
          onClick={event => { if (disabled) event.preventDefault(); }}>
          {selected.length ? 'Add people' : 'Choose people'}<ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className={styles.popover}>
          <label className={styles.search}><Search size={15} aria-hidden="true" /><input aria-label="Search agency members"
            value={query} placeholder="Find someone" disabled={disabled} onChange={event => setQuery(event.target.value)} /></label>
          <div className={styles.options}>
            {members.length > 0 ? <button type="button" className={styles.selectAll} disabled={disabled || members.filter(member => member.active !== false).length > 50}
              onClick={() => onChange([...new Set(members.filter(member => member.active !== false).map(member => member.user_id))])}>All staff</button> : null}
            {members.filter(member => member.active !== false).length > 50 ? <p>Choose up to 50 people for one task.</p> : null}
            {members.filter(member => member.display_name.toLowerCase().includes(query.toLowerCase())).map(member =>
              <label key={member.user_id} className={styles.option}>
                <input type="checkbox" checked={selected.includes(member.user_id)} disabled={disabled || member.active === false} onChange={() => toggle(member.user_id)} />
                <span>{member.display_name}</span>{selected.includes(member.user_id) ? <Check size={16} aria-hidden="true" /> : null}
              </label>)}
            {!members.length ? <p>Agency members are unavailable. Try again shortly.</p> : !members.some(member => member.display_name.toLowerCase().includes(query.toLowerCase())) ? <p>No matching members.</p> : null}
          </div>
          <button type="button" className={styles.done} onClick={close}>Done</button>
        </div>
      </details>
    </div>
  </div>;
}
