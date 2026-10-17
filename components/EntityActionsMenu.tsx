'use client';
import {
  Archive,
  AlertTriangle,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { friendlyError } from '@/lib/platform-client';
import { changedEntityFields } from '@/lib/entity-edit-draft';
import styles from './EntityActionsMenu.module.css';
import JourneyStatus from './JourneyStatus';
import ConfirmActionDialog from './ConfirmActionDialog';

export type EntityActionKind =
  | 'club_need'
  | 'deal_room'
  | 'club'
  | 'club_contact'
  | 'player'
  | 'recruitment_target';

export type EntityEditField = {
  key: string;
  label: string;
  value?: unknown;
  type?: 'text' | 'date' | 'url' | 'textarea';
  placeholder?: string;
};

type Rpc = <T,>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;
type Props = {
  kind: EntityActionKind;
  entityId: string;
  label: string;
  rpc: Rpc;
  fields: EntityEditField[];
  onChanged: (change: EntityChange) => Promise<void> | void;
  className?: string;
  showEdit?: boolean;
};

export type EntityChange = 'edit' | 'archive' | 'delete';
type Mode = 'menu' | EntityChange | null;

const textValue = (value: unknown) =>
  value === null || value === undefined ? '' : String(value);

const impactEntries = (value: unknown) =>
  Object.entries(
    value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {},
  ).filter(([, count]) => {
    if (typeof count === 'number') return count > 0;
    return Boolean(count);
  });

export default function EntityActionsMenu({
  kind,
  entityId,
  label,
  rpc,
  fields,
  onChanged,
  className = '',
  showEdit = false,
}: Props) {
  const initialDraft = useMemo(
    () => Object.fromEntries(
      fields.map((field) => [field.key, textValue(field.value)]),
    ),
    [fields],
  );
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<Record<string, string>>(initialDraft);
  const [editFields, setEditFields] = useState(fields);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedChange, setSavedChange] = useState<EntityChange | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const dialog=useRef<HTMLElement>(null), mutation=useRef(false), previewRequest=useRef(0);
  const patch = changedEntityFields(editFields, draft);
  const dirty = mode === 'edit' && Object.keys(patch).length > 0 && !savedChange;
  const isOpen = Boolean(mode);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.contains(dialog.current));
    const inert=siblings.map(node=>node.inert);siblings.forEach(node=>{node.inert=true;});document.body.style.overflow='hidden';
    const update=()=>{const view=window.visualViewport;if(view)setViewport({top:view.offsetTop,height:view.height});};
    update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return()=>{previewRequest.current++;siblings.forEach((node,index)=>{node.inert=inert[index];});document.body.style.overflow=overflow;window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);if(previous?.isConnected)previous.focus();};
  },[isOpen]);
  useEffect(()=>{if(mode)dialog.current?.querySelector<HTMLElement>(mode==='edit'?'input,textarea':'button')?.focus();},[mode]);

  const open = (
    next: Exclude<Mode, null>,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();
    setError('');
    setPreview(null);
    setChecking(false);
    setSavedChange(null);
    setDiscardOpen(false);
    const request = ++previewRequest.current;
    if (next === 'edit') { setDraft(initialDraft); setEditFields(fields.map(field => ({ ...field }))); }
    setMode(next);
    if (next === 'delete') {
      setChecking(true);
      void rpc<any>('redream_entity_action_preview', {
        p_entity_type: kind,
        p_entity_id: entityId,
      })
        .then(value => { if (previewRequest.current === request) setPreview(value); })
        .catch((cause) => { if (previewRequest.current === request) setError(friendlyError(cause)); })
        .finally(() => { if (previewRequest.current === request) setChecking(false); });
    }
  };

  const dismiss = () => {
    previewRequest.current++;
    setError('');
    setPreview(null);
    setChecking(false);
    setDiscardOpen(false);
    setSavedChange(null);
    setMode(null);
  };
  const close = () => {
    if (mutation.current) return;
    if (dirty) { setDiscardOpen(true); return; }
    dismiss();
  };
  const finish = async (change: EntityChange) => {
    try { await onChanged(change); dismiss(); }
    catch { setError('Your changes are saved, but the list could not refresh. Try refreshing the list or close this panel.'); }
  };
  const mutate = async (change: EntityChange, name: string, args: Record<string, unknown>) => {
    if (mutation.current || savedChange) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    try {
      await rpc(name, { p_entity_type: kind, p_entity_id: entityId, ...args });
      setSavedChange(change);
      await finish(change);
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!savedChange || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try { await finish(savedChange); }
    finally { mutation.current = false; setBusy(false); }
  };

  const saveEdit = async () => {
    if (!Object.keys(patch).length) return;
    await mutate('edit', 'redream_entity_patch', { p_patch: patch });
  };

  return (
    <div
      className={`${styles.root} ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {showEdit?<button type="button" className={styles.edit} onClick={event=>open('edit',event)} aria-label={'Edit '+label}><Pencil size={15}/><span>Edit</span></button>:null}
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Manage ${label}`}
        title={`Manage ${label}`}
        onClick={(event) => open('menu', event)}
      >
        <MoreHorizontal size={18} />
      </button>

      {mode ? createPortal(
        <div
          className={styles.backdrop}
          style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            ref={dialog}
            className={styles.sheet}
            onKeyDown={event=>{
              if(event.key==='Escape'){event.stopPropagation();if(!busy)close();}
              if(event.key==='Tab'){
                const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')||[]).filter(node=>node.getClientRects().length);
                const first=controls[0],last=controls.at(-1);
                if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
                else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${label}`}
            inert={discardOpen || undefined}
          >
            <div className={styles.handle} />
            <header className={styles.head}>
              <div>
                <span>{mode === 'menu' ? 'Manage record' : mode === 'edit' ? 'Edit details' : mode === 'archive' ? 'Archive record' : 'Delete record'}</span>
                <h3>{label}</h3>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={close}
                aria-label="Close"
                disabled={busy}
              >
                <X size={17} />
              </button>
            </header>

            {savedChange ? <div className={styles.saved}>
              <JourneyStatus compact kind="info" title="Changes saved" description={error || 'Refreshing the list...'} onRetry={()=>void refresh()} retryLabel="Refresh list" retryBusy={busy}/>
              <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Close</button>
            </div> : mode === 'menu' ? (
              <div className={styles.menu}>
                <button type="button" onClick={() => open('edit')}>
                  <span className={styles.menuIcon}><Pencil size={17} /></span>
                  <span><strong>Edit</strong><small>Change the details.</small></span>
                </button>
                <button type="button" onClick={() => open('archive')}>
                  <span className={styles.menuIcon}><Archive size={17} /></span>
                  <span><strong>Archive</strong><small>Hide it from active work without losing history.</small></span>
                </button>
                <button
                  type="button"
                  className={styles.dangerMenu}
                  onClick={() => open('delete')}
                >
                  <span className={styles.menuIcon}><Trash2 size={17} /></span>
                  <span><strong>Delete</strong><small>Permanently remove the record after a safety check.</small></span>
                </button>
              </div>
            ) : null}

            {mode === 'edit' && !savedChange ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <div className={styles.fields}>
                  {editFields.map((field) => (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea
                          aria-label={field.label}
                          disabled={busy}
                          value={draft[field.key] || ''}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <input
                          aria-label={field.label}
                          disabled={busy}
                          type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
                          value={draft[field.key] || ''}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
                {error ? <div className={styles.feedback}><JourneyStatus compact kind="error" description={error}/></div> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Cancel</button>
                  <button type="submit" className={styles.primary} disabled={busy || !dirty}>
                    {busy ? <LoaderCircle size={16} className={styles.spin} /> : <Pencil size={15} />}
                    {busy ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            ) : null}
            {mode === 'archive' && !savedChange ? (
              <div className={styles.confirm}>
                <div className={styles.confirmIcon}><Archive size={22} /></div>
                <h4>Archive this record?</h4>
                <p>
                  It will disappear from active work, but its underlying history stays intact.
                </p>
                {error ? <JourneyStatus compact kind="error" description={error}/> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Keep active</button>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => void mutate('archive', 'redream_entity_archive', { p_archived: true })}>
                    {busy ? <LoaderCircle size={16} className={styles.spin} /> : <Archive size={15} />}
                    Archive
                  </button>
                </div>
              </div>
            ) : null}

            {mode === 'delete' && !savedChange ? (
              <div className={styles.confirm}>
                <div className={`${styles.confirmIcon} ${styles.dangerIcon}`}>
                  <AlertTriangle size={22} />
                </div>
                <h4>Delete permanently?</h4>
                <p>
                  This cannot be undone. Archive is the safer choice when you only want this out of active work.
                </p>

                {checking && !preview ? (
                  <div className={styles.checking}>
                    <LoaderCircle size={17} className={styles.spin} />
                    Checking linked records…
                  </div>
                ) : null}

                {preview ? (
                  <div className={styles.impact}>
                    <span>Deletion impact</span>
                    {impactEntries(preview?.impact).length ? (
                      impactEntries(preview.impact).map(([key, value]) => (
                        <div key={key}>
                          <strong>{String(key).replaceAll('_', ' ')}</strong>
                          <em>{String(value)}</em>
                        </div>
                      ))
                    ) : (
                      <div><strong>Linked records</strong><em>None</em></div>
                    )}
                  </div>
                ) : null}

                {preview && preview.can_delete === false ? (
                  <p className={styles.warning}>
                    Only a workspace owner or admin can permanently delete this record.
                  </p>
                ) : null}
                {error ? <JourneyStatus compact kind="error" description={error}/> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Cancel</button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy || checking || !preview?.can_delete}
                    onClick={() => void mutate('delete', 'redream_entity_delete', { p_confirm: true })}
                  >
                    {busy ? <LoaderCircle size={16} className={styles.spin} /> : <Trash2 size={15} />}
                    Delete permanently
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>,
        document.body,
      ) : null}
      <ConfirmActionDialog open={discardOpen} tone="warning" title="Discard these changes?" description="Your unsaved changes will be lost." confirmLabel="Discard changes" onClose={()=>setDiscardOpen(false)} onConfirm={dismiss}/>
    </div>
  );
}
