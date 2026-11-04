'use client';

import {Search} from 'lucide-react';
import {useState} from 'react';
import type {RequestStaff} from '@/lib/club-request-preferences';
import styles from './RequestStaffPicker.module.css';

export default function RequestStaffPicker({staff, value, disabled, onChange}: {
  staff: RequestStaff[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [query,setQuery] = useState('');
  const selected = new Set(value.split(',').filter(Boolean));
  const filtered = staff.filter(member=>member.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <fieldset className={styles.picker} disabled={disabled}>
    <legend>Assign users</legend>
    <details>
      <summary>{selected.size ? `${selected.size} assigned` : 'Assign users...'}</summary>
      <label><Search size={16}/><input type="search" aria-label="Search request staff" placeholder="Search staff..." value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className={styles.members}>
        {filtered.map(member=><label key={member.id}>
          <input type="checkbox" checked={selected.has(member.id)} onChange={event=>{
            if(event.target.checked)selected.add(member.id);else selected.delete(member.id);
            onChange([...selected].join(','));
          }}/>{member.name}
        </label>)}
        {!filtered.length?<p>No matching agency staff.</p>:null}
      </div>
      {selected.size?<button type="button" onClick={()=>onChange('')}>Clear assignments</button>:null}
    </details>
  </fieldset>;
}
