'use client';
import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
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

import { changedEntityFields } from '@/lib/entity-edit-draft';
import {emptyClubNeedBrief, validateClubNeedBrief} from '@/lib/club-need-brief';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {confirmsEntityAction,isDefinitiveEntityDenial,entityActionErrorMessage} from '@/lib/entity-action-result';
import AgencyRecordSelect,{type AgencyRecordLookup,type AgencyLookupKind} from './AgencyRecordSelect';
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
  type?: 'text' | 'date' | 'url' | 'textarea' | 'number' | 'select' | 'reference';
  lookupKind?:AgencyLookupKind;
  section?:string;
  options?: readonly (readonly [string,string])[];
  placeholder?: string;
};

type Rpc = <T,>(
  name: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<T>;
type Props = {
  kind: EntityActionKind;
  entityId: string;
  label: string;
  rpc: Rpc;
  fields: EntityEditField[];
  onChanged: (change: EntityChange, signal?: AbortSignal) => Promise<void> | void;
  scope?: string;
  className?: string;
  showEdit?: boolean;
  editOnly?: boolean;
  versionedEdit?: boolean;
  lookup?:AgencyRecordLookup;
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

export default function EntityActionsMenu(props:Props){
  return <EntityActionsPanel key={`${props.scope||''}:${props.kind}:${props.entityId}`} {...props}/>;
}

function EntityActionsPanel({
  kind,
  entityId,
  label,
  rpc,
  fields,
  onChanged,
  className = '',
  showEdit = false,
  editOnly = false,
  versionedEdit = false,
  lookup,
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
  const [editSections,setEditSections]=useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedChange, setSavedChange] = useState<EntityChange | null>(null);
  const [uncertainChange,setUncertainChange]=useState<EntityChange|null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const dialog=useRef<HTMLElement>(null), mutation=useRef(false), previewRequest=useRef(0);
  const lifetime=useRef<AbortController|null>(null),previewAbort=useRef<AbortController|null>(null);
  if(!lifetime.current)lifetime.current=new AbortController();
  const current=(request:number)=>!lifetime.current?.signal.aborted&&previewRequest.current===request;
  useEffect(()=>{
    if(lifetime.current?.signal.aborted)lifetime.current=new AbortController();
    return()=>{lifetime.current?.abort();previewAbort.current?.abort();previewRequest.current++;};
  },[]);
  const patch = changedEntityFields(editFields, draft);
  const dirty = mode === 'edit' && Object.keys(patch).length > 0 && !savedChange;
  const isOpen = Boolean(mode);
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement|null,releaseScroll = lockPageScroll();
    const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.contains(dialog.current));
    const releaseBackground = isolateElements(siblings);
    const update=()=>{const view=window.visualViewport;if(view)setViewport({top:view.offsetTop,height:view.height});};
    update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return()=>{previewRequest.current++;previewAbort.current?.abort();releaseBackground();releaseScroll();window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);requestAnimationFrame(()=>{
      const focused=document.activeElement;
      const blockedByModal=Array.from(document.querySelectorAll('[aria-modal="true"]')).some(modal=>!modal.closest('[inert]')&&!modal.contains(previous));
      if(!lifetime.current?.signal.aborted&&previous?.isConnected&&!previous.closest('[inert]')&&!blockedByModal&&(!focused||focused===document.body||focused===document.documentElement))previous.focus({preventScroll:true});
    });};
  },[isOpen]);
  useEffect(()=>{if(mode)dialog.current?.querySelector<HTMLElement>(mode==='edit'?'input,textarea,select':'button')?.focus();},[mode]);

  const open = (
    next: Exclude<Mode, null>,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();
    if(mutation.current)return;
    setBusy(false);
    setError('');
    setPreview(null);
    setChecking(false);
    setSavedChange(null);
    setUncertainChange(null);
    setEditSections([]);
    setDiscardOpen(false);
    previewAbort.current?.abort();
    ++previewRequest.current;
    if (next === 'edit') { setDraft(initialDraft); setEditFields(fields.map(field => ({ ...field }))); }
    setMode(next);
    if (next === 'delete') void loadPreview();
  };

  const loadPreview=async()=>{
    if(mutation.current)return;
    previewAbort.current?.abort();const controller=new AbortController();previewAbort.current=controller;
    const request=++previewRequest.current;setChecking(true);setError('');setPreview(null);
    try{
      const value=await readWithDeadline(rpc<any>('redream_entity_action_preview',{p_entity_type:kind,p_entity_id:entityId},controller.signal),12000,controller.signal);
      if(!current(request))return;
      if(!value||value.entity_type!==kind||value.entity_id!==entityId||typeof value.can_delete!=='boolean'||value.delete_requires_confirmation!==true||!value.impact||typeof value.impact!=='object'||Array.isArray(value.impact))throw new Error('The safety check could not be confirmed. Please try again.');
      setPreview(value);
    }catch(cause){if(current(request))setError(entityActionErrorMessage(cause));}
    finally{controller.abort();if(current(request))setChecking(false);}
  };

  const dismiss = () => {
    previewRequest.current++;
    previewAbort.current?.abort();
    setError('');
    setPreview(null);
    setChecking(false);
    setDiscardOpen(false);
    setSavedChange(null);
    setBusy(false);
    setMode(null);
  };
  const close = () => {
    if (mutation.current) return;
    if (dirty) { setDiscardOpen(true); return; }
    dismiss();
  };
  const refreshRecord=async(change:EntityChange,request:number)=>{
    if(!current(request))return;
    const controller=new AbortController(),owner=lifetime.current!.signal,stop=()=>controller.abort();
    owner.addEventListener('abort',stop,{once:true});
    try{await readWithDeadline(Promise.resolve().then(()=>current(request)?onChanged(change,controller.signal):undefined),12000,controller.signal);}
    finally{owner.removeEventListener('abort',stop);controller.abort();}
  };
  const finish = async (change: EntityChange,request:number) => {
    try { await refreshRecord(change,request);if(current(request))dismiss(); }
    catch {if(current(request))setError('Your change is saved, but the list could not refresh. Refresh the list or close this panel.');}
  };
  const mutate = async (change: EntityChange, name: string, args: Record<string, unknown>) => {
    if (mutation.current || savedChange || uncertainChange) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    const request=previewRequest.current;
    const unconfirmed=()=>{setUncertainChange(change);setError(`Could not confirm the ${change==='edit'?'update':change==='archive'?'archive':'deletion'}. It may still finish. Check the latest details before trying again.`);};
    try {
      const outcome=await writeWithDeadline(async signal=>{try{return {value:await rpc(name,{p_entity_type:kind,p_entity_id:entityId,...args},signal)};}catch(error){return {error};}},12000,lifetime.current!.signal);
      if(!current(request))return;
      if(outcome.status==='unknown'){unconfirmed();return;}
      if('error' in outcome.result){
        if(isDefinitiveEntityDenial(outcome.result.error))throw outcome.result.error;
        unconfirmed();return;
      }
      if(!confirmsEntityAction(outcome.result.value,change,kind,entityId,versionedEdit&&change==='edit')){unconfirmed();return;}
      setSavedChange(change);
      await finish(change,request);
    } catch (cause) {
      if(current(request))setError(entityActionErrorMessage(cause));
    } finally {
      mutation.current = false;
      if(current(request))setBusy(false);
    }
  };

  const refresh = async () => {
    if (!savedChange || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    const request=previewRequest.current;
    try { await finish(savedChange,request); }
    finally { mutation.current = false;if(current(request))setBusy(false); }
  };

  const saveEdit = async () => {
    if (!Object.keys(patch).length) return;
    if(kind==='club_need' && Object.keys(patch).some(key=>key in emptyClubNeedBrief)){
      try{validateClubNeedBrief(draft);}catch(cause){setError(entityActionErrorMessage(cause));return;}
    }
    await mutate('edit', 'redream_entity_patch', { p_patch: patch });
  };
  const reloadUncertain = async () => {
    if(mutation.current)return;
    mutation.current=true;setBusy(true);
    const request=previewRequest.current;
    try{await refreshRecord('edit',request);if(current(request))dismiss();}catch{if(current(request))setError(`The latest details could not load. ${uncertainChange==='edit'?'Your draft is kept. ':''}Close this panel to check the record from its list, or retry the read.`);}
    finally{mutation.current=false;if(current(request))setBusy(false);}
  };

  const renderEditField=(field:EntityEditField)=>field.type==='reference'?<AgencyRecordSelect key={field.key} label={field.label} kind={field.lookupKind||'contact'} value={draft[field.key]||''} disabled={busy} lookup={lookup} onChange={id=>setDraft(current=>({...current,[field.key]:id}))}/>: (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      {field.type === 'select' ? <select aria-label={field.label} disabled={busy} value={draft[field.key]||''} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))}>
                        {draft[field.key]&&!field.options?.some(([value])=>value===draft[field.key])?<option value={draft[field.key]}>Current: {draft[field.key]}</option>:null}
                        {field.options?.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                      </select> : field.type === 'textarea' ? (
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
                          type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : field.type==='number'?'number':'text'}
                          min={field.type==='number'?'0':undefined}
                          step={field.type==='number'?'any':undefined}
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
                  );

  return (
    <div
      className={`${styles.root} ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {showEdit||editOnly?<button type="button" className={styles.edit} onClick={event=>open('edit',event)} aria-label={'Edit '+label}><Pencil size={15}/><span>Edit</span></button>:null}
      {!editOnly?<button
        type="button"
        className={styles.trigger}
        aria-label={`Manage ${label}`}
        title={`Manage ${label}`}
        onClick={(event) => open('menu', event)}
      >
        <MoreHorizontal size={18} />
      </button>:null}

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
                const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]')||[]).filter(node=>node.getClientRects().length);
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
              <JourneyStatus compact kind="info" title={savedChange==='edit'?'Changes saved':savedChange==='archive'?'Record archived':'Record deleted'} description={error || 'Refreshing the list...'} onRetry={()=>void refresh()} retryLabel="Refresh list" retryBusy={busy}/>
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

            {uncertainChange&&!savedChange?<div className={styles.saved}>
              <JourneyStatus compact kind="error" title="Change not confirmed" description={error}/>
              {uncertainChange==='edit'?<><details className={styles.retainedDraft}><summary>Retained draft</summary><dl>{editFields.filter(field=>field.key in patch).map(field=><div key={field.key}><dt>{field.label}</dt><dd>{draft[field.key]||'Cleared'}</dd></div>)}</dl></details><p className={styles.recoveryCopy}>Reloading opens the latest details and replaces this draft.</p></>:null}
              <button type="button" className={styles.secondary} onClick={()=>void reloadUncertain()} disabled={busy}>{versionedEdit?'Reload request':'Reload record'}</button>
              <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Close</button>
            </div>:null}
            {mode === 'edit' && !savedChange && !uncertainChange ? (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <div className={styles.fields}>
                  {editFields.filter(field=>!field.section).map(renderEditField)}
                  {Array.from(new Set(editFields.map(field=>field.section).filter((section):section is string=>Boolean(section)))).map(section=><details key={section} className={styles.fieldSection} onToggle={event=>{const open=event.currentTarget.open;setEditSections(current=>open?current.includes(section)?current:[...current,section]:current.filter(value=>value!==section));}}><summary>{section}</summary>{editSections.includes(section)?<div className={styles.sectionFields}>{editFields.filter(field=>field.section===section).map(renderEditField)}</div>:null}</details>)}
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
            {mode === 'archive' && !savedChange && !uncertainChange ? (
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

            {mode === 'delete' && !savedChange && !uncertainChange ? (
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
                    This record cannot be permanently deleted. Archive it to retain its history.
                  </p>
                ) : null}
                {error ? <JourneyStatus compact kind="error" description={error} onRetry={!preview?()=>void loadPreview():undefined} retryLabel="Retry safety check" retryBusy={checking}/> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Cancel</button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy || checking || preview?.can_delete!==true}
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
      <ConfirmActionDialog open={discardOpen} tone="warning" title="Discard these changes?" description={uncertainChange?'Your draft will be discarded. The original change may still finish.':'Your unsaved changes will be lost.'} confirmLabel="Discard changes" onClose={()=>setDiscardOpen(false)} onConfirm={dismiss}/>
    </div>
  );
}
