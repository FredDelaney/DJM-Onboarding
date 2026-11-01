'use client';
import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Plus,
  Target,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';

import {
  FormEvent,
  type CSSProperties,
  useEffect,
  useCallback,
  useRef,
  useState,
} from 'react';
import {createPortal} from 'react-dom';

import { friendlyError } from '@/lib/platform-client';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {clubNeedBriefFields,clubNeedCommercialFields,clubNeedFootballFields,clubNeedSourceFields, emptyClubNeedBrief, validateClubNeedBrief, clubNeedFinancialFacts} from '@/lib/club-need-brief';
import AgencyRecordSelect from './AgencyRecordSelect';
import ConfirmActionDialog from './ConfirmActionDialog';

import styles from './AgencyCreateDrawer.module.css';

export type AgencyCreateKind =
  | 'recruitment_target'
  | 'player'
  | 'club'
  | 'club_need'
  | 'deal'
  | 'contact';

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

type PlayerOption = {
  player_id: string;
  name: string;
  current_club?: string | null;
  primary_position?: string | null;
};

const META: Record<
  AgencyCreateKind,
  {
    eyebrow: string;
    title: string;
    copy: string;
    submit: string;
    added: string;
  }
> = {
  recruitment_target: {
    eyebrow:'RECRUITMENT', title:'Add target', copy:'Track a player you may work with. This does not add them to Our Players.', submit:'Add target', added:'Target added',
  },
  player: {
    eyebrow: 'PLAYERS',
    title: 'Add player',
    copy: 'Start with a name and position.',
    submit: 'Add player',
    added: 'Player added',
  },
  club: {
    eyebrow: 'NETWORK',
    title: 'Add club',
    copy: 'Start with the club name.',
    submit: 'Add club',
    added: 'Club added',
  },
  club_need: {
    eyebrow: 'MARKET',
    title: 'Add request',
    copy: 'Record the position, budget and club requirements.',
    submit: 'Add request',
    added: 'Request added',
  },
  deal: {
    eyebrow: 'DEALS',
    title: 'Add deal',
    copy: 'Choose the player and club.',
    submit: 'Add deal',
    added: 'Deal added',
  },
  contact: {
    eyebrow: 'NETWORK',
    title: 'Add contact',
    copy: 'Start with a name and club.',
    submit: 'Add contact',
    added: 'Contact added',
  },
};

const initialValues = {
  ...emptyClubNeedBrief,
  full_name: '',
  first_name: '',
  last_name: '',
  primary_position: '',
  current_club: '',
  current_country: '',
  contract_expiry: '',
  transfermarkt_url: '',
  club_name: '',
  organisation_id:'',
  country: '',
  position: '',
  title: '',
  notes: '',
  expires_on: '',
  contact_name: '',
  contact_role: '',
  contact_email: '',
  contact_phone: '',
  player_id: '',
  stage: 'qualifying',
  expected_commission: '',
  currency: 'EUR',
  next_action: '',
  next_action_at: '',
};

export default function AgencyCreateDrawer({
  kind,
  invoke,
  onClose,
  onCreated,
  theme,
  onOpenCreated,
  prefillClub,
}: {
  kind: AgencyCreateKind;
  invoke: Invoke;
  onClose: () => void;
  onCreated: (result?: any) => Promise<void> | void;
  onOpenCreated?: (result: any) => void;
  theme?: CSSProperties;
  prefillClub?: {name:string;country?:string|null};
}) {
  const meta = META[kind];

  const baseline = {...initialValues, currency:kind==='club_need'?'':initialValues.currency,
    ...(kind==='contact'&&prefillClub?{club_name:prefillClub.name,country:prefillClub.country||''}:{})};
  const [values, setValues] = useState(baseline);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(kind === 'deal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [sourceOpen,setSourceOpen]=useState(false),[clubOpen,setClubOpen]=useState(false);
  const [created, setCreated] = useState(false);
  const [uncertain,setUncertain]=useState(false);
  const createdResult=useRef<any>(null),lifetime=useRef<AbortController|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [viewport, setViewport] = useState<{top: number; height: number} | null>(null);
  const dialog = useRef<HTMLElement>(null), backdrop = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const phase = useRef<'editing' | 'saving' | 'created' | 'unknown'>('editing');
  const refreshingRef = useRef(false), active = useRef(true);
  const invokeRef = useRef(invoke), createdCallback = useRef(onCreated), closeCallback = useRef(onClose);
  const openCreatedCallback=useRef(onOpenCreated);
  const lookupRecords=useCallback((record_kind:'club'|'contact'|'organisation',query:string,selected_id:string)=>invokeRef.current('club_request_options',{record_kind,query,selected_id}),[]);
  const dirty = !created && !uncertain && Object.entries(baseline).some(([key, value]) => values[key as keyof typeof initialValues] !== value);

  useEffect(() => {invokeRef.current = invoke; createdCallback.current = onCreated; closeCallback.current = onClose;openCreatedCallback.current=onOpenCreated;}, [invoke, onCreated, onClose,onOpenCreated]);

  const requestClose = () => {
    if (phase.current === 'saving') return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  };

  useEffect(() => {
    active.current = true;
    const controller=new AbortController();lifetime.current=controller;
    const releaseScroll = lockPageScroll();
    if (!dialog.current?.contains(document.activeElement)) opener.current = document.activeElement as HTMLElement | null;
    const siblings = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(backdrop.current));
    const releaseBackground = isolateElements(siblings);

    (dialog.current?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') || dialog.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();

    return () => {
      active.current = false;
      controller.abort();
      releaseBackground();
      releaseScroll();
      queueMicrotask(() => {if (!active.current && opener.current?.isConnected) opener.current.focus();});
    };
  }, []);

  useEffect(() => {
    const view = window.visualViewport;
    const update = () => setViewport({top: view?.offsetTop || 0, height: view?.height || window.innerHeight});
    update(); view?.addEventListener('resize', update); view?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => {view?.removeEventListener('resize', update); view?.removeEventListener('scroll', update); window.removeEventListener('resize', update);};
  }, []);

  useEffect(() => {
    if (created||uncertain) dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [created,uncertain]);

  useEffect(() => {
    setShowDetails(false);
  }, [kind]);

  useEffect(() => {
    if (kind !== 'deal') return;

    let active = true;
    setLoadingOptions(true);
    setOptionsError('');

    void readWithDeadline(Promise.resolve().then(() => invokeRef.current('create_options')))
      .then((response) => {
        if (!active) return;

        const rows = response?.options?.players;
        if (!Array.isArray(rows)) throw new Error('The player list could not be loaded. Please retry.');

        setPlayers(
          rows
            .map((item: any) => ({
              player_id: String(item?.player_id || ''),
              name: String(item?.name || 'Player'),
              current_club: item?.current_club || null,
              primary_position: item?.primary_position || null,
            }))
            .filter((item: PlayerOption) => item.player_id),
        );
      })
      .catch((cause) => {
        if (!active) return;
        setOptionsError(friendlyError(cause));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, [kind, optionsAttempt]);

  async function refreshCreatedList() {
    if (refreshingRef.current || !active.current) return;
    dialog.current?.focus();
    refreshingRef.current = true;
    setRefreshing(true); setRefreshError('');
    try {
      await readWithDeadline(Promise.resolve().then(() => createdCallback.current(createdResult.current)));
      if (active.current){if(openCreatedCallback.current)openCreatedCallback.current(createdResult.current);else closeCallback.current();}
    } catch {
      if (active.current) setRefreshError('Saved successfully. The list could not refresh. You can retry the refresh or close this panel.');
    } finally {
      refreshingRef.current = false;
      if (active.current) setRefreshing(false);
    }
  }

  function setValue(key: keyof typeof initialValues, value: string) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.current !== 'editing') return;

    phase.current = 'saving';
    // The container remains focusable while the pending form controls are disabled.
    dialog.current?.focus();
    setBusy(true);
    setError('');

    try {
      let action = '';
      let body: Record<string, unknown> = {};

      if(kind==='recruitment_target'){
        action='recruitment_create';
        body={full_name:values.full_name.trim(),primary_position:values.primary_position.trim()||null,current_club:values.current_club.trim()||null,current_country:values.current_country.trim()||null,contract_expiry:values.contract_expiry||null,transfermarkt_url:values.transfermarkt_url.trim()||null,recruitment_priority:3};
      }

      if (kind === 'player') {
        action = 'create_player';
        body = {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim() || null,
          primary_position: values.primary_position.trim(),
          current_club: values.current_club.trim() || null,
          current_country: values.current_country.trim() || null,
          contract_expiry: values.contract_expiry || null,
          transfermarkt_url: values.transfermarkt_url.trim() || null,
        };
      }

      if (kind === 'club') {
        action = 'create_club';
        body = {
          club_name: values.club_name.trim(),
          country: values.country.trim() || null,
        };
      }

      if (kind === 'club_need') {
        action = 'create_club_need_brief';
        validateClubNeedBrief(values);
        body = {
          club_name: values.club_name.trim(),
          organisation_id:values.organisation_id||null,
          country: values.country.trim() || null,
          position: values.position.trim(),
          title: values.title.trim() || null,
          notes: values.notes.trim() || null,
          expires_on: values.expires_on || null,
          brief:Object.fromEntries(clubNeedBriefFields.map(field=>[field.key,field.key==='currency'?values.currency.trim().toUpperCase():values[field.key].trim()||null])),
        };
      }

      if (kind === 'contact') {
        action = 'create_contact';
        body = {
          contact_name: values.contact_name.trim(),
          club_name: values.club_name.trim(),
          contact_role: values.contact_role.trim() || null,
          country: values.country.trim() || null,
          notes: values.notes.trim() || null,
          email: values.contact_email.trim() || null,
          phone: values.contact_phone.trim() || null,
        };
      }

      if (kind === 'deal') {
        action = 'create_deal';

        const commissionText = values.expected_commission.trim();
        const expectedCommission = commissionText
          ? Number(commissionText)
          : null;

        if (
          expectedCommission !== null &&
          (!Number.isFinite(expectedCommission) || expectedCommission < 0)
        ) {
          throw new Error('Expected commission must be zero or more.');
        }

        let nextActionAt: string | null = null;

        if (values.next_action_at) {
          const parsed = new Date(values.next_action_at);

          if (Number.isNaN(parsed.getTime())) {
            throw new Error('Choose a valid next action date and time.');
          }

          nextActionAt = parsed.toISOString();
        }

        body = {
          player_id: values.player_id,
          club_name: values.club_name.trim(),
          country: values.country.trim() || null,
          stage: values.stage,
          expected_commission: expectedCommission,
          currency: values.currency.trim().toUpperCase() || 'EUR',
          next_action: values.next_action.trim() || null,
          next_action_at: nextActionAt,
        };
      }

      const outcome=await writeWithDeadline(async()=>{
        try{return {value:await invoke(action,body)};}catch(error){return {error};}
      },12000,lifetime.current?.signal);
      if(!active.current)return;
      const unknown=()=>{phase.current='unknown';setUncertain(true);setError('Could not confirm the save. Check the list before adding this record again; the original request may still finish.');};
      if(outcome.status==='unknown'){unknown();return;}
      if('error' in outcome.result&&outcome.result.error)throw outcome.result.error;
      createdResult.current=outcome.result.value;
      if(kind==='club_need'&&(createdResult.current?.created?.brief_version!==1||createdResult.current?.created?.created!==true||typeof createdResult.current?.created?.club_need_id!=='string')){unknown();return;}
      if(kind==='recruitment_target'&&(createdResult.current?.result?.created!==true||typeof createdResult.current?.result?.prospect_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createdResult.current.result.prospect_id))){unknown();return;}
      phase.current = 'created';
      if (!active.current) return;
      setCreated(true);
      void refreshCreatedList();
    } catch (cause) {
      phase.current = 'editing';
      if (active.current) setError(friendlyError(cause));
    } finally {
      if (active.current) setBusy(false);
    }
  }

  if (typeof document === 'undefined') return null;
  return <>{createPortal(
    <div
      ref={backdrop}
      className={styles.backdrop}
      data-interface="calm"
      style={{...theme, ...(viewport ? {top: viewport.top, height: viewport.height, bottom: 'auto'} : {})}}
      onMouseDown={(event) => {
        if (
          event.currentTarget === event.target &&
          !busy
        ) {
          requestClose();
        }
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        inert={discardOpen || undefined}
        className={styles.drawer}
        onKeyDown={event => {
          if (event.defaultPrevented || discardOpen) return;
          if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); requestClose();}
          if (event.key === 'Tab') {
            const controls = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') || []].filter(node => node.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            const entering = document.activeElement === dialog.current || !dialog.current?.contains(document.activeElement);
            if (!first) {event.preventDefault(); dialog.current?.focus();}
            else if (event.shiftKey && (document.activeElement === first || entering)) {event.preventDefault(); last?.focus();}
            else if (!event.shiftKey && (document.activeElement === last || entering)) {event.preventDefault(); first.focus();}
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agency-create-title"
      >
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.icon}>
              {kind === 'player' ? <Users size={18} /> : null}
              {kind === 'club' ? <BriefcaseBusiness size={18} /> : null}
              {kind === 'club_need'||kind==='recruitment_target' ? <Target size={18} /> : null}
              {kind === 'deal' ? <BriefcaseBusiness size={18} /> : null}
              {kind === 'contact' ? <UserRoundPlus size={18} /> : null}
            </div>

            <button
              type="button"
              data-ui-button="icon"
              className={styles.close}
              onClick={requestClose}
              disabled={busy}
              aria-label={`Close ${meta.title}`}
            >
              <X size={17} />
            </button>
          </div>

          <p>{meta.eyebrow}</p>
          <h2 id="agency-create-title">{meta.title}</h2>
          <span>{meta.copy}</span>
        </header>

        <form className={styles.form} onSubmit={submit}>
          {created ? <div className={styles.saved} role="status">
            <CheckCircle2 size={28} aria-hidden="true" />
            <h3>{meta.added}</h3>
            <p role={refreshError ? 'alert' : undefined}>{refreshError || 'Refreshing the list...'}</p>
          </div> : <fieldset className={styles.fields} disabled={busy||uncertain} aria-label={meta.title + ' details'}>
          {error ? (
            <div className={styles.error} role="alert" aria-atomic="true">{error}</div>
          ) : null}

          {kind === 'player'||kind==='recruitment_target' ? (
            <>
              {kind==='recruitment_target'?<Field label="Player name" required value={values.full_name} onChange={value=>setValue('full_name',value)}/>:<div className={styles.pair}>
                <Field
                  label="First name"
                  required
                  value={values.first_name}
                  onChange={(value) => setValue('first_name', value)}
                />
                <Field
                  label="Last name"
                  value={values.last_name}
                  onChange={(value) => setValue('last_name', value)}
                />
              </div>}

              <Field
                label="Primary position"
                required={kind==='player'}
                placeholder="e.g. Left winger"
                value={values.primary_position}
                onChange={(value) => setValue('primary_position', value)}
              />

              <Field
                label="Current club"
                value={values.current_club}
                onChange={(value) => setValue('current_club', value)}
              />

              <DetailsToggle
                open={showDetails}
                onToggle={() => setShowDetails((current) => !current)}
              />

              {showDetails ? (
                <div className={styles.optionalDetails}>
                  <div className={styles.pair}>
                    <Field
                      label="Country"
                      value={values.current_country}
                      onChange={(value) => setValue('current_country', value)}
                    />
                    <Field
                      label="Contract expiry"
                      type="date"
                      value={values.contract_expiry}
                      onChange={(value) => setValue('contract_expiry', value)}
                    />
                  </div>

                  <Field
                    label="Transfermarkt URL"
                    type="url"
                    value={values.transfermarkt_url}
                    onChange={(value) => setValue('transfermarkt_url', value)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {kind === 'club' ? (
            <>
              <Field
                label="Club name"
                required
                value={values.club_name}
                onChange={(value) => setValue('club_name', value)}
              />

              <Field
                label="Country"
                value={values.country}
                onChange={(value) => setValue('country', value)}
                placeholder="Optional"
              />
            </>
          ) : null}

          {kind === 'club_need' ? (
            <>
              <Field
                label="Club"
                required
                value={values.club_name}
                onChange={(value) => {setValue('club_name', value);setValue('organisation_id','');if(values.organisation_id)setValue('country','');}}
              />

              <details className={styles.briefSection} onToggle={event=>setClubOpen(event.currentTarget.open)}><summary>Choose an existing club</summary>{clubOpen?<div className={styles.briefFields}><AgencyRecordSelect label="Existing club" kind="club" value={values.organisation_id} lookup={lookupRecords} onChange={(id,record)=>{setValue('organisation_id',id);if(record){setValue('club_name',record.name);setValue('country',record.country||'');}}}/></div>:null}</details>

              <Field
                label="Position"
                required
                placeholder="e.g. Left-footed winger"
                value={values.position}
                onChange={(value) => setValue('position', value)}
              />

              <TextArea
                label="What does the club need?"
                placeholder="Add the useful detail you already know."
                value={values.notes}
                onChange={(value) => setValue('notes', value)}
              />

              <details className={styles.briefSection} open>
                <summary>Deal & budget</summary>
                <div className={styles.briefFields}>
                  {clubNeedCommercialFields.map(field=><label key={field.key} className={styles.field}>
                    <span>{field.label}</span>
                    {field.type==='select'?<select aria-label={field.label} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}>{field.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:field.type==='textarea'?<textarea aria-label={field.label} value={values[field.key]} maxLength={2000} onChange={event=>setValue(field.key,event.target.value)}/>:<input aria-label={field.label} type={field.type} min={field.type==='number'?'0':undefined} step={field.type==='number'?'any':undefined} placeholder={field.key==='currency'?'e.g. EUR':'Optional'} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}/>}
                  </label>)}
                  {clubNeedFinancialFacts(values).length?<div className={styles.briefSummary} aria-live="polite"><dl>{clubNeedFinancialFacts(values).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Request budgets only. These are not agreed player earnings or agency revenue. No currency or tax conversion is applied.</p></div>:null}
                </div>
              </details>

              <details className={styles.briefSection}><summary>Football requirements</summary><div className={styles.briefFields}>{clubNeedFootballFields.map(field=><label key={field.key} className={styles.field}><span>{field.label}</span>{field.type==='select'?<select aria-label={field.label} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}>{field.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:field.type==='textarea'?<textarea aria-label={field.label} value={values[field.key]} maxLength={2000} onChange={event=>setValue(field.key,event.target.value)}/>:<input aria-label={field.label} type={field.type} min={field.type==='number'?'1':undefined} step={field.type==='number'?'1':undefined} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}/>}</label>)}</div></details>
              <details className={styles.briefSection} onToggle={event=>setSourceOpen(event.currentTarget.open)}><summary>Source & priority</summary>{sourceOpen?<div className={styles.briefFields}>{clubNeedSourceFields.map(field=>field.type==='reference'?<AgencyRecordSelect key={field.key} label={field.label} kind={field.lookupKind} value={values[field.key]} lookup={lookupRecords} onChange={id=>setValue(field.key,id)}/>:<label key={field.key} className={styles.field}><span>{field.label}</span>{field.type==='select'?<select aria-label={field.label} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}>{field.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:field.type==='textarea'?<textarea aria-label={field.label} value={values[field.key]} maxLength={2000} onChange={event=>setValue(field.key,event.target.value)}/>:<input aria-label={field.label} type={field.type} value={values[field.key]} onChange={event=>setValue(field.key,event.target.value)}/>}</label>)}</div>:null}</details>

              <DetailsToggle
                open={showDetails}
                onToggle={() => setShowDetails((current) => !current)}
              />

              {showDetails ? (
                <div className={styles.optionalDetails}>
                  <Field
                    label="Country"
                    value={values.country}
                    disabled={Boolean(values.organisation_id)}
                    onChange={(value) => setValue('country', value)}
                  />

                  <Field
                    label="Short title"
                    placeholder="Optional"
                    value={values.title}
                    onChange={(value) => setValue('title', value)}
                  />

                  <Field
                    label="Need valid until"
                    type="date"
                    value={values.expires_on}
                    onChange={(value) => setValue('expires_on', value)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {kind === 'contact' ? (
            <>
              <Field
                label="Contact name"
                required
                value={values.contact_name}
                onChange={(value) => setValue('contact_name', value)}
              />

              <div className={styles.pair}>
                <Field
                  label="Club"
                  required
                  value={values.club_name}
                  onChange={(value) => setValue('club_name', value)}
                />
                <Field
                  label="Role"
                  placeholder="e.g. Sporting Director"
                  value={values.contact_role}
                  onChange={(value) => setValue('contact_role', value)}
                />
              </div>
              <div className={styles.pair}>
                <Field label="Email" placeholder="Email address" value={values.contact_email} onChange={value=>setValue('contact_email',value)}/>
                <Field label="Phone" placeholder="Phone number" value={values.contact_phone} onChange={value=>setValue('contact_phone',value)}/>
              </div>
              <p style={{fontSize:12,color:'#75869b',margin:'0 0 8px'}}>Contact access follows your agency's existing permissions.</p>

              <DetailsToggle
                open={showDetails}
                onToggle={() => setShowDetails((current) => !current)}
              />

              {showDetails ? (
                <div className={styles.optionalDetails}>
                  <Field
                    label="Country"
                    value={values.country}
                    onChange={(value) => setValue('country', value)}
                  />

                  <TextArea
                    label="Relationship note"
                    placeholder="Optional context about how you know them."
                    value={values.notes}
                    onChange={(value) => setValue('notes', value)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {kind === 'deal' ? (
            <>
              {loadingOptions ? (
                <div className={styles.loading} role="status" aria-busy="true" aria-atomic="true">
                  <LoaderCircle size={17} className={styles.spin} />
                  Loading your players
                </div>
              ) : null}

              {optionsError ? <div className={styles.error} role="alert"><p>{optionsError}</p><button type="button" data-ui-button="secondary" className={styles.secondary} onClick={() => {dialog.current?.focus(); setOptionsAttempt(attempt => attempt + 1);}}>Retry players</button></div> : null}

              {!loadingOptions && !optionsError && !players.length ? (
                <div className={styles.notice} role="status" aria-atomic="true">
                  Add a player first. Every deal must belong to a real player in this agency.
                </div>
              ) : null}

              <label className={styles.field}>
                <span>Player</span>
                <select
                  required
                  value={values.player_id}
                  onChange={(event) =>
                    setValue('player_id', event.target.value)
                  }
                  disabled={loadingOptions || !players.length}
                >
                  <option value="">Choose player</option>
                  {players.map((player) => (
                    <option
                      key={player.player_id}
                      value={player.player_id}
                    >
                      {player.name}
                      {player.current_club
                        ? ` · ${player.current_club}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label="Club"
                required
                value={values.club_name}
                onChange={(value) => setValue('club_name', value)}
              />

              <Field
                label="Next action"
                placeholder="e.g. Send player profile to sporting director"
                value={values.next_action}
                onChange={(value) => setValue('next_action', value)}
              />

              <DetailsToggle
                open={showDetails}
                onToggle={() => setShowDetails((current) => !current)}
              />

              {showDetails ? (
                <div className={styles.optionalDetails}>
                  <div className={styles.pair}>
                    <Field
                      label="Country"
                      value={values.country}
                      onChange={(value) => setValue('country', value)}
                    />

                    <label className={styles.field}>
                      <span>Stage</span>
                      <select
                        value={values.stage}
                        onChange={(event) =>
                          setValue('stage', event.target.value)
                        }
                      >
                        <option value="qualifying">Qualifying</option>
                        <option value="contacted">Contacted</option>
                        <option value="interest">Interest</option>
                        <option value="negotiating">Negotiating</option>
                        <option value="offer">Offer</option>
                        <option value="contracting">Contracting</option>
                      </select>
                    </label>
                  </div>

                  <div className={styles.pair}>
                    <Field
                      label="Expected commission"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                      value={values.expected_commission}
                      onChange={(value) =>
                        setValue('expected_commission', value)
                      }
                    />
                    <Field
                      label="Currency"
                      maxLength={3}
                      value={values.currency}
                      onChange={(value) => setValue('currency', value)}
                    />
                  </div>

                  <Field
                    label="Next action date"
                    type="datetime-local"
                    value={values.next_action_at}
                    onChange={(value) => setValue('next_action_at', value)}
                  />

                  <div className={styles.truth}>
                    The system does not invent a success probability when you create a deal. It records what you know and helps you control the next action.
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          </fieldset>}
          <div className={styles.actions}>
            {uncertain?<button type="button" data-ui-button="secondary" className={styles.secondary} onClick={onClose}>Close and review the list</button>:created ? <>
              <button type="button" data-ui-button="secondary" className={styles.secondary} onClick={requestClose}>Close</button>
              {onOpenCreated?<button type="button" data-ui-button="secondary" className={styles.secondary} onClick={()=>onOpenCreated(createdResult.current)}>{kind==='club_need'?'Open club need':'Open target'}</button>:null}
              <button type="button" data-ui-button="primary" className={styles.primary} onClick={() => void refreshCreatedList()} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh list'}</button>
            </> : <>
            <button
              type="button"
              data-ui-button="secondary"
              className={styles.secondary}
              onClick={requestClose}
              disabled={busy}
            >
              Cancel
            </button>

            <button
              type="submit"
              data-ui-button="primary"
              className={styles.primary}
              disabled={
                busy ||
                (kind === 'deal' &&
                  (loadingOptions || Boolean(optionsError) || !players.length))
              }
            >
              {busy ? (
                <LoaderCircle size={16} className={styles.spin} />
              ) : (
                <Plus size={16} />
              )}
              {busy ? 'Saving' : meta.submit}
            </button>
            </>}
          </div>
        </form>
      </section>
    </div>, document.body)}
    <ConfirmActionDialog open={discardOpen} title="Discard these changes?" description="Your new record has not been saved." confirmLabel="Discard changes" tone="warning" onClose={() => setDiscardOpen(false)} onConfirm={onClose} />
    </>;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  min,
  step,
  maxLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type={type}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        min={min}
        step={step}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DetailsToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-ui-button="tertiary"
              className={styles.detailsToggle}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span>{open ? 'Hide details' : 'More details'}</span>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  );
}
