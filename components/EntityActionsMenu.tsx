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
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { friendlyError } from '@/lib/platform-client';
import styles from './EntityActionsMenu.module.css';

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
}: Props) {
  const initialDraft = useMemo(
    () => Object.fromEntries(
      fields.map((field) => [field.key, textValue(field.value)]),
    ),
    [fields],
  );
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<Record<string, string>>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);

  const open = (
    next: Exclude<Mode, null>,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();
    setError('');
    setPreview(null);
    if (next === 'edit') setDraft(initialDraft);
    setMode(next);
    if (next === 'delete') {
      setBusy(true);
      void rpc<any>('redream_entity_action_preview', {
        p_entity_type: kind,
        p_entity_id: entityId,
      })
        .then(setPreview)
        .catch((cause) => setError(friendlyError(cause)))
        .finally(() => setBusy(false));
    }
  };

  const close = () => {
    if (busy) return;
    setError('');
    setPreview(null);
    setMode(null);
  };
  const finish = async (change: EntityChange) => {
    await onChanged(change);
    close();
  };

  const saveEdit = async () => {
    setBusy(true);
    setError('');
    try {
      await rpc('redream_entity_patch', {
        p_entity_type: kind,
        p_entity_id: entityId,
        p_patch: draft,
      });
      await finish('edit');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const archiveEntity = async () => {
    setBusy(true);
    setError('');
    try {
      await rpc('redream_entity_archive', {
        p_entity_type: kind,
        p_entity_id: entityId,
        p_archived: true,
      });
      await finish('archive');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const deleteEntity = async () => {
    setBusy(true);
    setError('');
    try {
      await rpc('redream_entity_delete', {
        p_entity_type: kind,
        p_entity_id: entityId,
        p_confirm: true,
      });
      await finish('delete');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`${styles.root} ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
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
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${label}`}
          >
            <div className={styles.handle} />
            <header className={styles.head}>
              <div>
                <span>{mode === 'menu' ? 'MANAGE RECORD' : mode.toUpperCase()}</span>
                <h3>{label}</h3>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={close}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>

            {mode === 'menu' ? (
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

            {mode === 'edit' ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <p className={styles.intro}>
                  Update only what has changed. Everything else stays untouched.
                </p>
                <div className={styles.fields}>
                  {fields.map((field) => (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea
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
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>Cancel</button>
                  <button type="submit" className={styles.primary} disabled={busy}>
                    {busy ? <LoaderCircle size={16} className={styles.spin} /> : <Pencil size={15} />}
                    Save changes
                  </button>
                </div>
              </form>
            ) : null}
            {mode === 'archive' ? (
              <div className={styles.confirm}>
                <div className={styles.confirmIcon}><Archive size={22} /></div>
                <h4>Archive this record?</h4>
                <p>
                  It will disappear from active work, but its underlying history stays intact.
                </p>
                {error ? <p className={styles.error}>{error}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>Keep active</button>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => void archiveEntity()}>
                    {busy ? <LoaderCircle size={16} className={styles.spin} /> : <Archive size={15} />}
                    Archive
                  </button>
                </div>
              </div>
            ) : null}

            {mode === 'delete' ? (
              <div className={styles.confirm}>
                <div className={`${styles.confirmIcon} ${styles.dangerIcon}`}>
                  <AlertTriangle size={22} />
                </div>
                <h4>Delete permanently?</h4>
                <p>
                  This cannot be undone. Archive is the safer choice when you only want this out of active work.
                </p>

                {busy && !preview ? (
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
                {error ? <p className={styles.error}>{error}</p> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close}>Cancel</button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy || !preview?.can_delete}
                    onClick={() => void deleteEntity()}
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
    </div>
  );
}
