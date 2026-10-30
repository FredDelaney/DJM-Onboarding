'use client';
import {
  Check,
  ClipboardCheck,
  MessageCircleMore,
  Route,
  X,
} from 'lucide-react';

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { friendlyError } from '@/lib/platform-client';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { writeWithDeadline } from '@/lib/write-with-deadline';
import styles from './AgencyRelationshipActions.module.css';

type Rpc = <T = any>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type Mode =
  | ''
  | 'conversation'
  | 'followup'
  | 'promise'
  | 'relationship';

const clean = (value: unknown) =>
  String(value || '').trim();

const scoreOptions = {
  strength: [
    ['Developing', 25],
    ['Useful', 50],
    ['Strong', 75],
    ['Very strong', 90],
  ],
  access: [
    ['Difficult', 20],
    ['Possible', 45],
    ['Direct', 75],
    ['Immediate', 90],
  ],
  trust: [
    ['Limited', 25],
    ['Working', 50],
    ['Strong', 75],
    ['Trusted', 90],
  ],
} as const;

const toIso = (value: string) => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
};

export default function AgencyRelationshipActions({
  personId,
  rpc,
  onSaved,
  onReload,
}: {
  personId: string;
  rpc: Rpc;
  onSaved: (result: any) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [mode, setMode] =
    useState<Mode>('');

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');
  const [notice,setNotice]=useState('');
  const [reviewActivity,setReviewActivity]=useState(false);
  const [refreshFailed,setRefreshFailed]=useState(false),[refreshing,setRefreshing]=useState(false),[uncertain,setUncertain]=useState(false);
  const lifetime=useRef<AbortController|null>(null),pending=useRef(false),lastResult=useRef<any>(null);
  const form=useRef<HTMLFormElement>(null),triggers=useRef<Partial<Record<Exclude<Mode,''>,HTMLButtonElement>>>({}),returnFocus=useRef<Mode>('');
  const unconfirmedMode=useRef<Mode>('');
  useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[]);
  useEffect(()=>{
    if(mode)form.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
  },[mode]);
  useEffect(()=>{
    if(!mode&&!busy&&!refreshing&&returnFocus.current){triggers.current[returnFocus.current]?.focus();returnFocus.current='';}
  },[mode,busy,refreshing]);

  const [summary, setSummary] =
    useState('');

  const [channel, setChannel] =
    useState('whatsapp');

  const [title, setTitle] =
    useState('');

  const [dueAt, setDueAt] =
    useState('');
  const [promiseTitle,setPromiseTitle]=useState(''),[promiseDueAt,setPromiseDueAt]=useState('');

  const [notes, setNotes] =
    useState('');

  const [strength, setStrength] =
    useState('');

  const [access, setAccess] =
    useState('');

  const [trust, setTrust] =
    useState('');

  const actions = useMemo(
    () => [
      {
        key: 'conversation' as const,
        label: 'Log conversation',
        mobileLabel: 'Log conversation',
        icon: MessageCircleMore,
      },
      {
        key: 'followup' as const,
        label: 'Add follow-up',
        mobileLabel: 'Follow-up',
        icon: Check,
      },
      {
        key: 'promise' as const,
        label: 'Add promise',
        mobileLabel: 'Promise',
        icon: ClipboardCheck,
      },
      {
        key: 'relationship' as const,
        label: 'Update relationship',
        mobileLabel: 'Relationship',
        icon: Route,
      },
    ],
    [],
  );

  const close = () => {
    if(pending.current)return;
    returnFocus.current=mode;
    setMode('');
    setError('');
  };

  const current=()=>!lifetime.current?.signal.aborted;
  const refresh=async()=>{
    if(refreshing||busy)return;
    setRefreshing(true);
    try{
      await readWithDeadline(uncertain?onReload():onSaved(lastResult.current));
      if(!current())return;
      setRefreshFailed(false);
      if(uncertain){returnFocus.current=mode||unconfirmedMode.current;unconfirmedMode.current='';setMode('');setUncertain(false);setError('');setReviewActivity(true);setNotice('Latest activity loaded. Check whether your change is already there before recording it again.');}
    }catch{if(current())setRefreshFailed(true);}
    finally{if(current())setRefreshing(false);}
  };

  const save=async(message:string,write:()=>Promise<any>,clearDraft:()=>void)=>{
    if(pending.current||refreshing||uncertain)return;
    pending.current=true;setBusy(true);setError('');setNotice('');setReviewActivity(false);setRefreshFailed(false);
    try{
      const outcome=await writeWithDeadline(async()=>{
        try{return {result:await write()};}catch(error){return {error};}
      },12000,lifetime.current?.signal);
      if(!current())return;
      if(outcome.status==='unknown'||!('result' in outcome.result)||!outcome.result.result?.person){
        unconfirmedMode.current=mode;
        setUncertain(true);
        if(outcome.status==='complete'&&'error' in outcome.result)setError(friendlyError(outcome.result.error));
        return;
      }
      const result=outcome.result.result;
      lastResult.current=result;clearDraft();returnFocus.current=mode;setMode('');setNotice(message);
      try{await readWithDeadline(onSaved(result));}catch{if(current())setRefreshFailed(true);}
    }finally{if(current()){pending.current=false;setBusy(false);}}
  };

  const submitConversation = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) return;

    if (clean(summary).length < 2) {
      setError('Add a short note about the conversation.');
      return;
    }

    await save('Conversation saved.',()=>rpc<any>(
        'redream_relationship_record_interaction',
        {
          p_person_id: personId,
          p_channel: channel,
          p_summary: clean(summary),
          p_occurred_at: new Date().toISOString(),
        },
      ),()=>setSummary(''));
  };

  const submitWork = async (
    event: FormEvent,
    kind: 'followup' | 'promise',
  ) => {
    event.preventDefault();

    if (busy) return;

    const workTitle=kind==='promise'?promiseTitle:title;
    const iso = toIso(kind==='promise'?promiseDueAt:dueAt);

    if (clean(workTitle).length < 2) {
      setError(
        kind === 'promise'
          ? 'Add what we promised to do.'
          : 'Add what needs to happen next.',
      );
      return;
    }

    if (!iso) {
      setError('Choose when this is due.');
      return;
    }

    await save(kind==='promise'?'Promise saved.':'Follow-up saved.',()=>rpc<any>(
        'redream_relationship_add_work',
        {
          p_person_id: personId,
          p_kind: kind,
          p_title: clean(workTitle),
          p_due_at: iso,
        },
      ),()=>{if(kind==='promise'){setPromiseTitle('');setPromiseDueAt('');}else{setTitle('');setDueAt('');}});
  };

  const submitRelationship = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) return;

    if(!strength||!access||!trust){setError('Choose your relationship, access and trust assessments.');return;}
    await save('Relationship updated.',()=>rpc<any>(
        'redream_relationship_update_route',
        {
          p_person_id: personId,
          p_strength_score: Number(strength),
          p_access_score: Number(access),
          p_trust_score: Number(trust),
          p_notes: clean(notes) || null,
        },
      ),()=>{setNotes('');setStrength('');setAccess('');setTrust('');});
  };

  return (
    <section className={styles.section} aria-label="Relationship actions" onKeyDown={event=>{if(event.key==='Escape'&&mode){event.preventDefault();event.stopPropagation();close();}}}>
      <div className={styles.head}>
        <div>
          <span>DO NEXT</span>
          <h3>Work from the relationship</h3>
        </div>
      </div>

      <div className={styles.actions}>
        {actions.map((action) => {
          const Icon = action.icon;
          const active = mode === action.key;

          return (
            <button
              key={action.key}
              ref={node=>{if(node)triggers.current[action.key]=node;else delete triggers.current[action.key];}}
              type="button"
              disabled={busy||refreshing}
              aria-expanded={active}
              data-ui-button={action.key === 'conversation' ? 'primary' : 'secondary'}
              className={active ? styles.active : ''}
              onClick={() => {
                if(active){close();return;}
                if(!reviewActivity)setNotice('');
                setError('');
                setMode(active ? '' : action.key);
              }}
            >
              <Icon size={15} />
              <span className={styles.actionLabel}>{action.label}</span>
              <span className={styles.actionLabelMobile}>{action.mobileLabel}</span>
            </button>
          );
        })}
      </div>

      {notice?<p className={styles.notice} role="status">{notice}</p>:null}
      {uncertain?<div className={styles.recovery} role="alert"><p>Could not confirm the save. Your draft is kept. Check the latest activity before recording it again; the earlier request may still finish.</p><button type="button" disabled={busy||refreshing} onClick={()=>void refresh()}>{refreshing?'Loading activity...':'Check latest activity'}</button></div>:refreshFailed?<div className={styles.recovery} role="alert"><p>Your change is saved. Network could not refresh.</p><button type="button" disabled={busy||refreshing} onClick={()=>void refresh()}>{refreshing?'Refreshing...':'Refresh Network'}</button></div>:null}

      {error ? (
        <div className={styles.error} role="alert" aria-atomic="true">
          {error}
        </div>
      ) : null}

      {mode === 'conversation' ? (
        <form ref={form}
          className={styles.form}
          onSubmit={submitConversation}
        >
          <div className={styles.formHead}>
            <strong>Log conversation</strong>
            <button data-ui-button="icon"
              type="button"
              onClick={close}
              disabled={busy||refreshing}
              aria-label="Close conversation form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            Where did you speak?
            <select disabled={busy||refreshing}
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value)
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            What mattered?
            <textarea disabled={busy||refreshing}
              value={summary}
              onChange={(event) =>
                setSummary(event.target.value)
              }
              placeholder="What did they tell us, what player was discussed, or what changed?"
              rows={4}
            />
          </label>

          <button
            data-ui-button="primary"
              className={styles.save}
            type="submit"
            disabled={busy||refreshing||uncertain}
          >
            {busy ? 'Saving...' : 'Save conversation'}
          </button>
        </form>
      ) : null}

      {mode === 'followup' ? (
        <form ref={form}
          className={styles.form}
          onSubmit={(event) =>
            void submitWork(event, 'followup')
          }
        >
          <div className={styles.formHead}>
            <strong>Add follow-up</strong>
            <button data-ui-button="icon"
              type="button"
              onClick={close}
              disabled={busy||refreshing}
              aria-label="Close follow-up form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            What needs to happen?
            <input disabled={busy||refreshing}
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="Call about the left-back requirement"
            />
          </label>

          <label>
            When?
            <input disabled={busy||refreshing}
              type="datetime-local"
              value={dueAt}
              onChange={(event) =>
                setDueAt(event.target.value)
              }
            />
          </label>

          <button
            data-ui-button="primary"
              className={styles.save}
            type="submit"
            disabled={busy||refreshing||uncertain}
          >
            {busy ? 'Saving...' : 'Add follow-up'}
          </button>
        </form>
      ) : null}

      {mode === 'promise' ? (
        <form ref={form}
          className={styles.form}
          onSubmit={(event) =>
            void submitWork(event, 'promise')
          }
        >
          <div className={styles.formHead}>
            <strong>Add promise</strong>
            <button data-ui-button="icon"
              type="button"
              onClick={close}
              disabled={busy||refreshing}
              aria-label="Close promise form"
            >
              <X size={14} />
            </button>
          </div>

          <label>
            What did we promise?
            <input disabled={busy||refreshing}
              value={promiseTitle}
              onChange={(event) =>
                setPromiseTitle(event.target.value)
              }
              placeholder="Send two centre-back profiles"
            />
          </label>

          <label>
            Due by
            <input disabled={busy||refreshing}
              type="datetime-local"
              value={promiseDueAt}
              onChange={(event) =>
                setPromiseDueAt(event.target.value)
              }
            />
          </label>

          <button
            data-ui-button="primary"
              className={styles.save}
            type="submit"
            disabled={busy||refreshing||uncertain}
          >
            {busy ? 'Saving...' : 'Save promise'}
          </button>
        </form>
      ) : null}

      {mode === 'relationship' ? (
        <form ref={form}
          className={styles.form}
          onSubmit={submitRelationship}
        >
          <div className={styles.formHead}>
            <strong>Update your relationship</strong>
            <button data-ui-button="icon"
              type="button"
              onClick={close}
              disabled={busy||refreshing}
              aria-label="Close relationship form"
            >
              <X size={14} />
            </button>
          </div>

          <div className={styles.scoreGrid}>
            <label>
              Relationship
              <select disabled={busy||refreshing} required
                value={strength}
                onChange={(event) =>
                  setStrength(event.target.value)
                }
              >
                <option value="">Choose assessment</option>
                {scoreOptions.strength.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Access
              <select disabled={busy||refreshing} required
                value={access}
                onChange={(event) =>
                  setAccess(event.target.value)
                }
              >
                <option value="">Choose assessment</option>
                {scoreOptions.access.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Trust
              <select disabled={busy||refreshing} required
                value={trust}
                onChange={(event) =>
                  setTrust(event.target.value)
                }
              >
                <option value="">Choose assessment</option>
                {scoreOptions.trust.map(
                  ([label, value]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label>
            Relationship note
            <textarea disabled={busy||refreshing}
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              placeholder="What should the agency remember about how to work with this person?"
              rows={3}
            />
          </label>

          <button
            data-ui-button="primary"
              className={styles.save}
            type="submit"
            disabled={busy||refreshing||uncertain}
          >
            {busy ? 'Saving...' : 'Update relationship'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
