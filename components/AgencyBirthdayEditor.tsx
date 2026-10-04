'use client';

import { CakeSlice } from 'lucide-react';
import { FormEvent, useEffect, useId, useState } from 'react';
import { friendlyError } from '@/lib/platform-client';
import styles from './AgencyBirthdayEditor.module.css';

type Rpc = <T = any>(name: string, args?: Record<string, unknown>) => Promise<T>;
export default function AgencyBirthdayEditor({ entityKind, entityId, tenantId, rpc }: {
  entityKind: 'contact' | 'staff'; entityId: string; tenantId?: string; rpc: Rpc;
}) {
  const id = useId();
  const [record, setRecord] = useState<any>(null);
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [shared, setShared] = useState(entityKind === 'contact');
  const [busy, setBusy] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const apply = (value: any) => {
    const next = value?.record;
    setRecord(next); setCanEdit(Boolean(value?.can_edit));
    setMonth(next?.month ? String(next.month) : '');
    setDay(next?.day ? String(next.day) : '');
    setYear(next?.year ? String(next.year) : '');
    setShared(next ? Boolean(next.shared) : entityKind === 'contact');
  };
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setMessage(''); setCanEdit(false);
    void rpc('redream_birthday_record', { p_entity_kind: entityKind, p_entity_id: entityId, p_tenant_id: tenantId || null })
      .then(value => { if (active) apply(value); })
      .catch(err => { if (active) setError(friendlyError(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [entityKind, entityId, tenantId, rpc, retry]);
  const save = async (remove = false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await rpc('redream_birthday_save', { p_entity_kind: entityKind, p_entity_id: entityId,
        p_month: remove ? null : Number(month), p_day: remove ? null : Number(day),
        p_year: remove || !year ? null : Number(year), p_shared: shared, p_tenant_id: tenantId || null });
      apply(result); setMessage(remove ? 'Birthday removed.' : 'Birthday saved.');
      window.dispatchEvent(new Event('redream:birthdays-updated'));
    } catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void save(); };
  return <section className={styles.card} aria-labelledby={`${id}-title`}>
    <div className={styles.heading}><CakeSlice size={19}/><h3 id={`${id}-title`}>Birthday</h3></div>
    <p>{entityKind === 'staff' ? 'Choose whether your birthday appears in your team calendar.' : 'Add a birthday to the agency calendar.'} The year is optional.</p>
    {busy && !canEdit ? <p role="status">Loading birthday...</p> : null}
    {error ? <div role="alert" className={styles.error}>{error}{!canEdit ? <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button> : null}</div> : null}
    {message ? <p role="status">{message}</p> : null}
    {canEdit ? <form onSubmit={submit} className={styles.form}>
      <div className={styles.fields}>
        <div><label htmlFor={`${id}-day`}>Day</label><input id={`${id}-day`} type="number" inputMode="numeric" min="1" max="31" required value={day} onChange={e=>setDay(e.target.value)}/></div>
        <div><label htmlFor={`${id}-month`}>Month</label><select id={`${id}-month`} required value={month} onChange={e=>setMonth(e.target.value)}><option value="">Select</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{new Intl.DateTimeFormat('en-GB',{month:'long'}).format(new Date(2000,i,1))}</option>)}</select></div>
        <div><label htmlFor={`${id}-year`}>Year (optional)</label><input id={`${id}-year`} type="number" inputMode="numeric" min="1900" max={new Date().getFullYear()} value={year} onChange={e=>setYear(e.target.value)}/></div>
      </div>
      <label className={styles.check}><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>Show in the team calendar</label>
      <div className={styles.actions}><button type="submit" data-ui-button="primary" disabled={busy}>Save birthday</button>{record ? <button type="button" data-ui-button="secondary" disabled={busy} onClick={()=>void save(true)}>Remove birthday</button> : null}</div>
    </form> : !busy && !error ? <p>{record ? `${day}/${month}` : 'Birthday not shared.'}</p> : null}
  </section>;
}
