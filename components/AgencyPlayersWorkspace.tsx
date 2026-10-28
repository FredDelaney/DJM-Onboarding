'use client';

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  FileText,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Target,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import RecordContactActions from '@/components/RecordContactActions';
import AgencyCreateDrawer from './AgencyCreateDrawer';
import ConfirmActionDialog from './ConfirmActionDialog';
import WorkspaceListSearch from './WorkspaceListSearch';
import RecordActivitySummary from './RecordActivitySummary';
import PlayerStaffControl from './PlayerStaffControl';
import PlayerProfilePhoto from './PlayerProfilePhoto';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import { prefetchPlayerProfile, invalidatePlayerProfile } from '@/lib/player-profile-cache';
import { readWithDeadline } from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import { playerRosterPriority } from '@/lib/player-roster-priority';
import { publicFile } from '@/lib/supabase';
import {useWorkspaceListMemory,rememberListPosition,useRestoreListPosition} from '@/components/useWorkspaceListMemory';
import styles from './AgencyPlayersWorkspace.module.css';

type Invoke = <T,>(
  action: string,
  body?: Record<string, unknown>,
) => Promise<T>;

type Props = {
  theme?: CSSProperties;
  stateScope?: string;
  canManageRecords?: boolean;
  canWorkRecruitment?: boolean;
  canPromoteRecruitment?: boolean;
  canCreateRecords?: boolean;
  onCreatePlayer?: () => void;
  onRecordRefresh?: () => Promise<void>;
  data: any;
  basePath: string;
  invoke: Invoke;
  rpc: <T,>(name: string, args?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => Promise<void>;
  onLoadMore?: () => Promise<void>;
  directoryRefreshing?: boolean;
  onOpenAction: (request: AgencyActionRequest) => void;
};

const PIPELINE = [
  ['identified', 'Identified'],
  ['contact', 'Contact'],
  ['relationship', 'Relationship'],
  ['evaluation', 'Evaluation'],
  ['representation_discussion', 'Representation discussion'],
  ['offer', 'Offer'],
  ['represented', 'Represented'],
] as const;

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const ageFromDob = (value: unknown) => {
  const raw = String(value || '');
  if (!raw) return null;
  const dob = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const before =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (before) age -= 1;
  return age >= 0 ? age : null;
};

const nextBirthday = (value: unknown) => {
  const raw = String(value || '');
  if (!raw) return 'Birthday not set';
  const dob = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return 'Birthday not set';
  const now = new Date();
  const next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate(), 12);
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(next);
};

const nextMajorStage = (raw: unknown) => {
  const stage = String(raw || '');
  if (['identified', 'researching'].includes(stage)) return ['contacted', 'Contact'];
  if (['ready_to_contact', 'contacted'].includes(stage)) return ['replied', 'Relationship'];
  if (['replied', 'call_booked'].includes(stage)) return ['interested', 'Evaluation'];
  if (stage === 'interested') return ['terms_discussed', 'Representation discussion'];
  if (stage === 'terms_discussed') return ['agreement_sent', 'Offer'];
  if (['agreement_sent', 'negotiating'].includes(stage)) return ['signed', 'Represented'];
  return null;
};

function Avatar({
  name,
  path,
  large = false,
}: {
  name: string;
  path?: unknown;
  large?: boolean;
}) {
  const src = publicFile('player-public', String(path || '') || null);
  return (
    <div className={large ? styles.avatarLarge : styles.avatar}>
      {src ? <img src={src} alt="" /> : <span>{initials(name) || 'P'}</span>}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}><Icon size={18} /></div>
      <div><strong>{title}</strong><span>{copy}</span></div>
    </div>
  );
}

function PlayerDrawer({
  cacheScope = '',
  canManageRecords,
  playerId,
  summary,
  basePath,
  invoke,
  rpc,
  onRefresh,
  onClose,
  onOpenAction,
}: {
  cacheScope?: string;
  canManageRecords:boolean;
  playerId: string;
  summary?: any;
  basePath: string;
  invoke: Invoke;
  rpc: <T,>(name: string, args?: Record<string, unknown>) => Promise<T>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onOpenAction: (request: AgencyActionRequest) => void;
}) {
  const initialDetail = summary
    ? {
        identity: summary.identity || {},
        service: summary.service || {},
        career_alignment: {},
        profile: summary.profile || {},
        agreements: [],
        documents: [],
        opportunities: [],
        deals: [],
        activity: [],
      }
    : null;
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(!initialDetail);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(initialDetail);

  useEffect(() => {
    let active = true;

    void prefetchPlayerProfile(playerId, invoke, cacheScope).catch(() => undefined);

    void invoke<any>('player_workspace', { player_id: playerId })
      .then((response) => {
        if (active) setDetail(response?.player || null);
      })
      .catch((loadError) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [invoke, playerId, cacheScope]);

  const identity = detail?.identity || {};
  const service = detail?.service || {};
  const career = detail?.career_alignment || {};
  const agreements = Array.isArray(detail?.agreements) ? detail.agreements : [];
  const documents = Array.isArray(detail?.documents) ? detail.documents : [];
  const opportunities = Array.isArray(detail?.opportunities) ? detail.opportunities : [];
  const deals = Array.isArray(detail?.deals) ? detail.deals : [];
  const activity = Array.isArray(detail?.activity) ? detail.activity : [];
  const profile = detail?.profile || {};
  const representation = agreements.find((item: any) =>
    item?.status === 'active' &&
    ['representation', 'mandate', 'placement_authorisation'].includes(String(item?.agreement_type || '')),
  );
  const playerName = identity.name || 'Player';

  const openAction = () => {
    const control = service?.next_control_fix;
    const nextMove = service?.next_service_move;
    if (!control?.instruction && !nextMove?.instruction) return;

    onOpenAction({
      key: `player:${playerId}`,
      eyebrow: 'PLAYER',
      title: playerName,
      instruction: control?.instruction || nextMove?.instruction,
      label: control?.instruction ? 'Review next step' : 'Prepare next move',
      action: control?.instruction
        ? 'player_control_fix_prepare'
        : 'player_service_move_prepare',
      payload: { player_id: playerId },
      facts: [
        { label: 'Player status', value: human(service?.service_control?.state || 'Recorded') },
        { label: 'Next move', value: nextMove?.instruction || identity.next_action || 'Not set' },
        { label: 'Contract timing', value: identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'No expiry set' },
        { label: 'Market activity', value: human(service?.market_coverage?.state || 'Not set') },
      ],
      successCondition: control?.success_condition || nextMove?.success_condition ||
        'The next step is current.',
    });
  };

  return (
    <div className={styles.playerPage}>
      <aside className={`${styles.drawer} ${styles.playerPagePanel}`} role="region" aria-label={`${playerName} player workspace`}>
        <div className={`${styles.drawerTop} ${styles.drawerTopManaged}`}>
          <button type="button" data-ui-button="icon"
              className={styles.closeButton} onClick={onClose} aria-label="Back to Players">
            <ArrowLeft size={18} />
          </button>
          {!busy&&!error&&detail&&canManageRecords&&!summary?.access?.restricted&&!detail?.access?.restricted?<EntityActionsMenu
            showEdit
            kind="player"
            entityId={playerId}
            label={playerName}
            rpc={rpc}
            onChanged={async (change) => {
              await onRefresh();
              if (change === 'edit') {
                const response = await invoke<any>('player_workspace', { player_id: playerId });
                setDetail(response?.player || null);
              } else {
                onClose();
              }
            }}
            fields={[
              { key: 'first_name', label: 'First name', value: identity.first_name },
              { key: 'last_name', label: 'Last name', value: identity.last_name },
              { key: 'preferred_name', label: 'Preferred name', value: identity.preferred_name },
              { key: 'primary_position', label: 'Primary position', value: identity.primary_position },
              { key: 'current_club', label: 'Current club', value: identity.current_club },
              { key: 'current_country', label: 'Current country', value: identity.current_country },
              { key: 'contract_expiry', label: 'Contract expiry', value: identity.contract_expiry || '', type: 'date' },
            ]}
          />:null}
        </div>

        {busy ? (
          <div className={styles.drawerState}>
            <LoaderCircle size={20} className={styles.spin} />
            <div><strong>Opening player</strong><span>Loading details.</span></div>
          </div>
        ) : null}

        {error ? (
          <div className={styles.drawerState}>
            <CircleAlert size={19} />
            <div><strong>Player unavailable</strong><span>{error}</span></div>
          </div>
        ) : null}

        {!busy && !error && detail ? (
          <>
            <header className={styles.playerHero}>
              <PlayerProfilePhoto key={`${cacheScope}:${playerId}`} playerId={playerId} name={playerName}
                path={identity.profile_photo_path} className={styles.avatarLarge}
                canEdit={canManageRecords&&!summary?.access?.restricted&&!detail?.access?.restricted}
                invoke={invoke} onSaved={path=>{
                  invalidatePlayerProfile(playerId,cacheScope);
                  setDetail((current:any)=>current?{...current,identity:{...current.identity,profile_photo_path:path}}:current);
                  void onRefresh().catch(()=>undefined);
                }}/>

              <div className={styles.playerHeroCopy}>
                <p>PLAYER</p>
                <h2>{playerName}</h2>
                <span>
                  {[identity.primary_position, identity.current_club, identity.current_country]
                    .filter(Boolean).join(' · ') || 'Add position, club or country'}
                </span>
              </div>

              <div className={styles.heroActions}>
                <Link
                  className={styles.secondaryButton}
                  href={`${basePath}?view=players&player=${encodeURIComponent(playerId)}&profile=1`}
                >
                  <UserRound size={14} />
                  Player Profile
                </Link>
                <span className={styles.profileStatus}>
                  {profile.published ? 'Live' : 'Not published'}
                </span>
                {(service?.next_control_fix?.instruction || service?.next_service_move?.instruction) ? (
                  <button type="button" data-ui-button="primary" data-ui-tone="inverse"
              className={styles.primaryButton} onClick={openAction}>
                    <ArrowRight size={14} /> Next action
                  </button>
                ) : null}
              </div>
            </header>

            {canManageRecords&&!summary?.access?.restricted&&!detail?.access?.restricted?<RecordContactActions kind="player" recordId={playerId} name={playerName} scope={cacheScope} rpc={rpc}/>:null}
            <nav className={styles.playerTabs}>
              {['overview','opportunities','career','more'].map((key) => {
                const moreActive =
                  key === 'more' &&
                  ['more','activity','contracts','files'].includes(tab);
                return (
                  <button type="button" key={key}
                    className={tab === key || moreActive ? styles.playerTabActive : styles.playerTab}
                    onClick={() => setTab(key)}>
                    {human(key)}
                  </button>
                );
              })}
            </nav>

            <div className={styles.drawerBody}>
              {tab === 'overview' ? (
                <div className={styles.detailStack}>
                  <PlayerStaffControl key={cacheScope+playerId} playerId={playerId} scope={cacheScope} rpc={rpc}/>
                  <section className={styles.detailHero}>
                    <p>Next action</p>
                    <h3>{service?.next_service_move?.instruction || identity.next_action || 'No next action yet'}</h3>
                    <span>{identity.next_action_due ? relativeDate(identity.next_action_due) : 'No due date set'}</span>
                  </section>
                  <div className={styles.factGrid}>
                    <div><span>Birthday</span><strong>{nextBirthday(identity.date_of_birth)}</strong><small>{identity.date_of_birth || 'Date not set'}</small></div>
                    <div><span>Playing contract</span><strong>{identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'Not set'}</strong><small>{human(identity.contract_status || 'Status not set')}</small></div>
                    <div><span>Agency agreement</span><strong>{representation?.end_date ? relativeDate(representation.end_date) : representation ? 'No end date set' : 'Not set'}</strong><small>{representation ? human(representation.agreement_type) : 'No representation agreement'}</small></div>
                    <div><span>Opportunities</span><strong>{opportunities.filter((item: any) => !['won','lost','paused'].includes(String(item?.stage || ''))).length + deals.filter((deal: any) => deal?.status === 'active').length}</strong><small>Active opportunities</small></div>
                  </div>
                  <RecordActivitySummary summary={activity[0]?human(activity[0]?.event_type||'Agency activity'):null} when={activity[0]?.occurred_at||null}/>
                </div>
              ) : null}

              {tab === 'more' ? (
                <section className={styles.detailSection}>
                  <h3>More player detail</h3>
                  <div className={styles.moreMenu}>
                    <button type="button" onClick={() => setTab('activity')}>
                      <CalendarDays size={16} />
                      <span><strong>Activity</strong><small>Recent agency events</small></span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => setTab('contracts')}>
                      <ShieldCheck size={16} />
                      <span><strong>Contracts</strong><small>Playing and agency agreements</small></span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => setTab('files')}>
                      <FileText size={16} />
                      <span><strong>Files</strong><small>Player documents</small></span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </section>
              ) : null}

              {tab === 'opportunities' ? (
                <section className={styles.detailSection}>
                  <p>OPPORTUNITIES</p>
                  <h3>Current club situations</h3>
                  <div className={styles.rows}>
                    {[...opportunities, ...deals].map((item: any) => (
                      <article className={styles.row} key={`${item.id}:${item.stage}`}>
                        <div><strong>{item.club_name || item.title || 'Opportunity'}</strong>
                          <span>{item.summary || item.next_action || item.primary_blocker || 'Opportunity'}</span>
                          <small>{human(item.stage || item.status || 'Recorded')}</small></div>
                      </article>
                    ))}
                    {!opportunities.length && !deals.length ? (
                      <Empty icon={Target} title="No active opportunities"
                        copy="Routes and deals will appear here." />
                    ) : null}
                  </div>
                </section>
              ) : null}

              {tab === 'career' ? (
                <section className={styles.detailSection}>
                  <p>CAREER PLAN</p>
                  <h3>{career?.strategy?.objective || 'No career objective yet'}</h3>
                  <span className={styles.sectionCopy}>{career?.next_strategy_action?.instruction || 'No career-plan action yet'}</span>
                  {career?.next_strategy_action?.instruction ? (
                    <button type="button" data-ui-button="primary"
              className={styles.primaryButton} onClick={() =>
                      onOpenAction({
                        key: `career:${playerId}`,
                        eyebrow: 'CAREER PLAN',
                        title: playerName,
                        instruction: career.next_strategy_action.instruction,
                        label: 'Review career plan',
                        action: 'career_strategy_action_prepare',
                        payload: { player_id: playerId },
                        successCondition: 'The career plan is current.',
                      })
                    }><Target size={14} /> Review career plan</button>
                  ) : null}
                </section>
              ) : null}

              {tab === 'contracts' ? (
                <div className={styles.detailStack}>
                  <section className={styles.detailSection}>
                    <p>PLAYING CONTRACT</p>
                    <h3>{identity.current_club || 'Current club not set'}</h3>
                    <div className={styles.factGrid}>
                      <div><span>Status</span><strong>{human(identity.contract_status || 'Not set')}</strong></div>
                      <div><span>Expiry</span><strong>{identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'Not set'}</strong></div>
                    </div>
                  </section>
                  <section className={styles.detailSection}>
                    <p>AGENCY AGREEMENTS</p>
                    <h3>Representation</h3>
                    <div className={styles.rows}>
                      {agreements.map((item: any) => (
                        <article className={styles.row} key={item.id}>
                          <div><strong>{item.title || human(item.agreement_type || 'Agreement')}</strong>
                            <span>{human(item.status || 'Recorded')}</span>
                            <small>{item.end_date ? `Ends ${relativeDate(item.end_date)}` : 'No end date set'}</small></div>
                        </article>
                      ))}
                      {!agreements.length ? (
                        <Empty icon={ShieldCheck} title="No agreement recorded"
                          copy="No active agreement is recorded here." />
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : null}

              {tab === 'activity' ? (
                <section className={styles.detailSection}>
                  <p>ACTIVITY</p><h3>Agency activity</h3>
                  <div className={styles.rows}>
                    {activity.map((item: any, index: number) => (
                      <article className={styles.row} key={`${item.event_type}:${index}`}>
                        <div><strong>{human(item.event_type || 'Agency activity')}</strong>
                          <span>{item.occurred_at ? relativeDate(item.occurred_at) : 'Date not set'}</span></div>
                      </article>
                    ))}
                    {!activity.length ? <Empty icon={CalendarDays} title="No player activity yet"
                      copy="Agency activity will appear here." /> : null}
                  </div>
                </section>
              ) : null}

              {tab === 'files' ? (
                <section className={styles.detailSection}>
                  <p>FILES</p><h3>Player documents</h3>
                  <div className={styles.rows}>
                    {documents.map((item: any) => (
                      <article className={styles.row} key={item.id}>
                        <FileText size={15} />
                        <div><strong>{item.title || 'Player document'}</strong>
                          <span>{human(item.document_type || 'Document')}</span>
                          <small>{item.expires_at ? `Expires ${relativeDate(item.expires_at)}` : 'No expiry set'}</small></div>
                      </article>
                    ))}
                    {!documents.length ? <Empty icon={FileText} title="No player files yet"
                      copy="Player files will appear here." /> : null}
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

export default function AgencyPlayersWorkspace({
  theme,
  stateScope = '',
  canManageRecords = true,
  canWorkRecruitment = canManageRecords,
  canPromoteRecruitment = canManageRecords,
  canCreateRecords = true,
  onCreatePlayer,
  onRecordRefresh,
  data,
  basePath,
  invoke,
  rpc,
  onRefresh,
  onOpenAction,
  onLoadMore,
  directoryRefreshing = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<'players'|'recruitment'>(
    searchParams.get('tab') === 'recruitment' ? 'recruitment' : 'players',
  );
  const memory=useWorkspaceListMemory(stateScope,section,{search:'',stage:'all'});
  const search=memory.state.search,stageFilter=memory.state.stage;
  const setSearch=(value:string)=>memory.update({search:value});
  const setStageFilter=(value:string)=>memory.update({stage:value});
  const [archiveItems, setArchiveItems] = useState<any[]>([]);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const paging = useRef(false);
  const loadNextPage = async () => {
    if (!onLoadMore || paging.current || directoryRefreshing) return;
    paging.current = true;
    setPageBusy(true);
    setPageError('');
    try { await onLoadMore(); }
    catch (error) { setPageError(friendlyError(error)); }
    finally { paging.current = false; setPageBusy(false); }
  };

  const reloadArchives = useCallback(async () => {
    if (!canManageRecords) { setArchiveItems([]); return; }
    const result = await rpc<any>('redream_entity_archives');
    setArchiveItems(Array.isArray(result?.items) ? result.items : []);
  }, [rpc,canManageRecords]);

  const refreshEntities = useCallback(async () => {
    await Promise.all([(onRecordRefresh || onRefresh)(), reloadArchives()]);
  }, [onRefresh, onRecordRefresh, reloadArchives]);

  useEffect(() => {
    void reloadArchives().catch(() => undefined);
  }, [reloadArchives]);

  const archived = useMemo(
    () => new Set(archiveItems.map((item: any) => `${String(item?.entity_type || '')}:${String(item?.entity_id || '')}`)),
    [archiveItems],
  );
  const [playerId, setPlayerId] = useState<string|null>(() =>
    searchParams.get('profile') === '1'
      ? null
      : String(searchParams.get('player') || '').trim() || null,
  );
  const [targetId, setTargetId] = useState<string|null>(() => String(searchParams.get('target') || '').trim() || null);
  const [targetRecord, setTargetRecord] = useState<{ scope:string; id: string; detail: any } | null>(null);
  const targetDetail = targetRecord?.scope===stateScope&&targetRecord?.id === targetId ? targetRecord.detail : null;
  const targetRequest = useRef(0);
  const [targetReload, setTargetReload] = useState(0);
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [interaction, setInteraction] = useState('');
  const [interactionChannel, setInteractionChannel] = useState('whatsapp');
  const [interactionDirection,setInteractionDirection]=useState('outbound');
  const [createOpen, setCreateOpen] = useState(false);
  const openRecruitmentCreate = () => setCreateOpen(true);
  const closeRecruitmentCreate = () => setCreateOpen(false);
  const [targetSaving,setTargetSaving]=useState(''),[targetNotice,setTargetNotice]=useState(''),[targetWriteError,setTargetWriteError]=useState('');
  const [targetRefreshFailed,setTargetRefreshFailed]=useState(false),[targetUncertain,setTargetUncertain]=useState(false),[targetRefreshing,setTargetRefreshing]=useState(false);
  const [followupDraft,setFollowupDraft]=useState(''),[confirmStage,setConfirmStage]=useState<string|null>(null),[confirmPromotion,setConfirmPromotion]=useState<string|null>(null);
  const [promoted,setPromoted]=useState<{scope:string;id:string;playerId:string}|null>(null);
  const currentPromotion=promoted?.scope===stateScope&&promoted.id===targetId?promoted:null;
  const targetLocked=Boolean(targetSaving)||targetRefreshing||targetUncertain||targetRefreshFailed;
  const targetPending=useRef(false),targetLife=useRef<AbortController|null>(null),followupDirty=useRef(false);
  const currentTarget=useRef('');currentTarget.current=stateScope+':'+targetId;
  const targetHeading=useRef<HTMLHeadingElement>(null),focusTarget=useRef<string|null>(targetId);
  const targetOutcome=useRef<HTMLParagraphElement>(null),targetFailure=useRef<HTMLParagraphElement>(null),targetRecovery=useRef<HTMLDivElement>(null),targetLoadFailure=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(targetSaving||targetRefreshing)return;
    if(targetUncertain||targetRefreshFailed)targetRecovery.current?.focus();
    else if(targetWriteError)targetFailure.current?.focus();
    else if(targetNotice)targetOutcome.current?.focus();
  },[targetSaving,targetRefreshing,targetUncertain,targetRefreshFailed,targetWriteError,targetNotice]);
  useEffect(()=>{if(targetError&&!targetBusy)targetLoadFailure.current?.focus();},[targetError,targetBusy]);

  useEffect(()=>{
    const controller=new AbortController();targetLife.current=controller;targetPending.current=false;followupDirty.current=false;
    setTargetSaving('');setTargetNotice('');setTargetWriteError('');setTargetRefreshFailed(false);setTargetUncertain(false);setTargetRefreshing(false);setFollowupDraft('');setConfirmStage(null);setConfirmPromotion(null);
    return()=>controller.abort();
  },[targetId,stateScope]);
  useEffect(()=>{
    if(!followupDirty.current){const value=targetDetail?.target?.next_action_at;const date=value?new Date(value):null;setFollowupDraft(date&&!Number.isNaN(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'');}
    if(targetDetail&&!targetBusy&&focusTarget.current===targetId){targetHeading.current?.focus();focusTarget.current=null;}
  },[targetDetail,targetBusy,targetId]);

  useEffect(() => {
    setSection(
      searchParams.get('tab') === 'recruitment' || searchParams.get('target')
        ? 'recruitment'
        : 'players',
    );
    if (searchParams.get('profile') !== '1') {
      setPlayerId(String(searchParams.get('player') || '').trim() || null);
    }
    setTargetId(String(searchParams.get('target') || '').trim() || null);
  }, [searchParams]);

  const changeSection = (nextSection: 'players' | 'recruitment') => {
    setSection(nextSection);
    setPlayerId(null);
    setTargetId(null);

    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.delete('player');
    params.delete('profile');
    params.delete('target');

    if (nextSection === 'recruitment') {
      params.set('tab', 'recruitment');
    } else {
      params.delete('tab');
    }

    router.replace(`${basePath}?${params.toString()}`);
  };

  const openPlayer = (id: string) => {
    rememberListPosition(stateScope,section);
    setPlayerId(id);
    setTargetId(null);
    void prefetchPlayerProfile(id, invoke, stateScope).catch(() => undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.set('player', id);
    params.delete('tab');
    params.delete('target');
    params.delete('profile');
    router.push(`${basePath}?${params.toString()}`);
  };

  const openPlayerProfile = (id: string) => {
    rememberListPosition(stateScope,section);
    void prefetchPlayerProfile(id, invoke, stateScope).catch(() => undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.set('player', id);
    params.set('profile', '1');
    params.delete('tab');
    params.delete('target');
    router.push(`${basePath}?${params.toString()}`);
  };

  const closePlayer = () => {
    setPlayerId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.delete('player');
    params.delete('profile');
    const query = params.toString();
    router.replace(`${basePath}${query ? `?${query}` : ''}`);
  };

  const openTarget = (id: string) => {
    rememberListPosition(stateScope,section);
    setTargetId(id);
    focusTarget.current=id;
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.set('tab', 'recruitment');
    params.set('target', id);
    params.delete('player');
    params.delete('profile');
    router.push(`${basePath}?${params.toString()}`);
  };

  const closeTarget = () => {
    setTargetId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', 'players');
    params.set('tab', 'recruitment');
    params.delete('target');
    router.replace(`${basePath}?${params.toString()}`);
  };

  useRestoreListPosition(stateScope,section,memory.ready&&!playerId&&!targetId);

  useEffect(() => {
    setInteraction('');
    setInteractionChannel('whatsapp');
    setInteractionDirection('outbound');
  }, [targetId]);

  useEffect(() => {
    const request = ++targetRequest.current;
    setTargetRecord(null);
    setTargetError('');
    if (!targetId) { setTargetBusy(false); return; }
    setTargetBusy(true);
    void readWithDeadline(invoke<any>('recruitment_target', { prospect_id: targetId }))
      .then((response) => {
        if (request !== targetRequest.current) return;
        if (response?.recruitment?.target?.id!==targetId) throw new Error('This recruitment target is unavailable.');
        setTargetRecord({ scope:stateScope,id: targetId, detail: response.recruitment });
      })
      .catch((error) => {
        if (request === targetRequest.current) setTargetError(friendlyError(error));
      })
      .finally(() => {
        if (request === targetRequest.current) setTargetBusy(false);
      });
    return () => { targetRequest.current += 1; };
  }, [invoke, targetId, targetReload,stateScope]);

  const players = (Array.isArray(data?.directory?.items) ? data.directory.items : [])
    .filter((item: any) => !archived.has(`player:${String(item?.player_id || '')}`));
  const targets = (Array.isArray(data?.recruitment?.items) ? data.recruitment.items : [])
    .filter((item: any) => !archived.has(`recruitment_target:${String(item?.id || '')}`)&&!(promoted?.scope===stateScope&&promoted.id===item.id));
  const q = search.trim().toLowerCase();

  const filteredPlayers = useMemo(() => players.filter((item:any) => {
    if (!q) return true;
    const i=item?.identity||{};
    return [i.name,i.current_club,i.current_country,i.primary_position,...(Array.isArray(i.nationalities)?i.nationalities:[])]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }),[players,q]);

  const filteredTargets = useMemo(() => targets.filter((item:any) => {
    const searchMatch=!q || [item.full_name,item.current_club,item.current_country,item.primary_position,item.nationality]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
    const stageMatch=stageFilter==='all' || item.ui_stage===stageFilter;
    return searchMatch&&stageMatch;
  }),[targets,q,stageFilter]);

  const stageCounts=useMemo(() => {
    const result:Record<string,number>={};
    targets.forEach((item:any)=>{const key=String(item.ui_stage||'identified');result[key]=(result[key]||0)+1;});
    return result;
  },[targets]);

  const refreshTarget=async()=>{
    if (!targetId) return;
    const request = targetRequest.current;
    const response:any=await readWithDeadline(invoke('recruitment_target',{prospect_id:targetId}));
    if (response?.recruitment?.target?.id!==targetId) throw new Error('This recruitment target is unavailable.');
    if (request === targetRequest.current) setTargetRecord({ scope:stateScope,id: targetId, detail: response.recruitment });
  };

  const retryTargetRefresh=async()=>{
    if(targetPending.current||targetRefreshing)return;
    const captured=currentTarget.current;setTargetRefreshing(true);
    try{await Promise.all([currentPromotion?Promise.resolve():refreshTarget(),readWithDeadline(onRefresh())]);if(currentTarget.current===captured){setTargetRefreshFailed(false);setTargetUncertain(false);setTargetWriteError('');if(targetUncertain)setTargetNotice('Latest details loaded. Check your original change before trying again.');}}
    catch{if(currentTarget.current===captured)setTargetRefreshFailed(true);}
    finally{if(currentTarget.current===captured)setTargetRefreshing(false);}
  };

  const saveTarget=async(action:string,body:Record<string,unknown>,message:string,confirmed?:()=>void)=>{
    if(!canWorkRecruitment||(action==='recruitment_promote'&&!canPromoteRecruitment)||!targetId||currentTarget.current!==stateScope+':'+targetId||targetPending.current||targetRefreshing||targetUncertain)return;
    const captured=currentTarget.current;targetPending.current=true;setTargetSaving(action);setTargetNotice('');setTargetWriteError('');setTargetRefreshFailed(false);
    try{
      const outcome=await writeWithDeadline(async()=>{try{return {value:await invoke<any>(action,{prospect_id:targetId,...body})};}catch(error){return {error};}},12000,targetLife.current?.signal);
      if(currentTarget.current!==captured||targetLife.current?.signal.aborted)return;
      if(outcome.status==='unknown'){setTargetUncertain(true);return;}
      if('error' in outcome.result&&outcome.result.error)throw outcome.result.error;
      const result=outcome.result.value?.result;
      const validPromotion=typeof result?.player_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.player_id)&&(result.prospect_id===targetId||result.already_promoted===true);
      if(action==='recruitment_promote'?!validPromotion:result?.prospect_id!==targetId){setTargetUncertain(true);return;}
      setTargetNotice(message);confirmed?.();
      if(action==='recruitment_promote')setPromoted({scope:stateScope,id:targetId,playerId:result.player_id});
      try{await Promise.all([action==='recruitment_promote'?Promise.resolve():refreshTarget(),readWithDeadline(onRefresh())]);}catch{if(currentTarget.current===captured)setTargetRefreshFailed(true);}
    }catch(error){if(currentTarget.current===captured)setTargetWriteError(friendlyError(error));}
    finally{if(currentTarget.current===captured){targetPending.current=false;setTargetSaving('');}}
  };

  const changeStage=async()=>{
    const target=targetDetail?.target||{};
    const next=nextMajorStage(target.raw_stage);
    if (!next || !targetId) return;
    await saveTarget('recruitment_set_stage',{stage:next[0]},'Recruitment stage updated.');
  };

  const logInteraction=async()=>{
    if (!targetId || !interaction.trim()) return;
    await saveTarget('recruitment_log_interaction',{
      channel:interactionChannel,
      direction:interactionDirection,
      summary:interaction.trim(),
    },'Interaction saved.',()=>setInteraction(''));
  };

  const promote=async()=>{
    if (!targetId) return;
    await saveTarget('recruitment_promote',{},'Added to Our Players.');
  };

  const saveFollowup=async()=>{
    if(!canWorkRecruitment||!targetId||targetPending.current||targetLocked)return;
    const captured=currentTarget.current;targetPending.current=true;setTargetSaving('followup-tools');
    let toInstant:(date:string,time:string,zone:string)=>string;
    try{toInstant=(await readWithDeadline(import('@/lib/calendar/tasks'))).taskLocalInstant;}
    catch{if(currentTarget.current===captured)setTargetWriteError('Could not check the follow-up date. Please try again.');return;}
    finally{if(currentTarget.current===captured){targetPending.current=false;setTargetSaving('');}}
    if(currentTarget.current!==captured)return;
    const [date,time]=followupDraft.split('T');
    try{const iso=toInstant(date,time,Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');await saveTarget('recruitment_set_next_action',{next_action_at:iso},'Follow-up date saved.',()=>{followupDirty.current=false;});}
    catch{setTargetWriteError('Choose a valid follow-up date and time. Avoid times repeated or skipped by a clock change.');}
  };

  if (targetId) {
    return (
      <div className={styles.playerPage}>
        <aside className={`${styles.drawer} ${styles.playerPagePanel} ${styles.recruitmentPanel}`} role="region" aria-label="Recruitment target workspace">
          <div className={`${styles.drawerTop} ${styles.drawerTopManaged}`}>
            <button type="button" data-ui-button="icon"
              className={styles.closeButton} onClick={closeTarget} aria-label="Back to Recruitment">
              <ArrowLeft size={18} />
            </button>
            {targetDetail?.target && canManageRecords ? (
              <EntityActionsMenu
                kind="recruitment_target"
                entityId={targetId}
                label={targetDetail.target.full_name || 'Recruitment target'}
                rpc={rpc}
                onChanged={async (change) => {
                  await (onRecordRefresh || onRefresh)();
                  if (change === 'edit') await refreshTarget();
                  else closeTarget();
                }}
                fields={[
                  { key: 'full_name', label: 'Player name', value: targetDetail.target.full_name },
                  { key: 'primary_position', label: 'Position', value: targetDetail.target.primary_position },
                  { key: 'current_club', label: 'Current club', value: targetDetail.target.current_club },
                  { key: 'current_country', label: 'Current country', value: targetDetail.target.current_country },
                  { key: 'contract_expiry', label: 'Contract expiry', value: targetDetail.target.contract_expiry || '', type: 'date' },
                  { key: 'transfermarkt_url', label: 'Transfermarkt', value: targetDetail.target.transfermarkt_url, type: 'url' },
                ]}
              />
            ) : null}
          </div>
          {targetNotice?<p ref={targetOutcome} tabIndex={-1} className={styles.targetFeedback} role="status">{targetNotice}</p>:null}
          {targetWriteError?<p ref={targetFailure} tabIndex={-1} className={styles.targetFeedback} role="alert">{targetWriteError}</p>:null}
          {targetUncertain||targetRefreshFailed?<div ref={targetRecovery} tabIndex={-1} className={styles.targetFeedback} role="alert"><p>{targetUncertain?'Could not confirm the save. Your draft is kept. Check the latest details before trying again; the original request may still finish.':'Your change is saved. The latest details or list could not refresh.'}</p><button type="button" data-ui-button="secondary" className={styles.secondaryButton} disabled={Boolean(targetSaving)||targetRefreshing} onClick={()=>void retryTargetRefresh()}>{targetRefreshing?'Refreshing...':targetUncertain?'Check latest details':'Refresh details'}</button></div>:null}
          {currentPromotion?<div className={styles.targetFeedback}><button type="button" data-ui-button="primary" className={styles.primaryButton} onClick={()=>openPlayer(currentPromotion.playerId)}>Open player</button></div>:null}
          {targetBusy&&!currentPromotion?<div className={styles.drawerState} role="status"><LoaderCircle size={20} className={styles.spin}/><div><strong>Opening recruitment target</strong><span>Loading the latest recruitment details.</span></div></div>:null}
          {targetError&&!currentPromotion?<div ref={targetLoadFailure} tabIndex={-1} className={styles.drawerState} role="alert"><CircleAlert size={19}/><div><strong>Recruitment target unavailable</strong><span>{targetError}</span><button type="button" data-ui-button="secondary"
              className={styles.secondaryButton} onClick={()=>setTargetReload(value=>value+1)}>Try again</button></div></div>:null}
          {!targetBusy&&!targetError&&targetDetail&&!currentPromotion?(
            <div className={styles.drawerBody}>
              {canManageRecords?<RecordContactActions kind="recruitment_target" recordId={targetId} name={targetDetail.target?.full_name||'Recruitment player'} scope={stateScope} rpc={rpc}/>:null}
              <header className={styles.recruitHero}><div className={styles.recruitmentMark}>{initials(targetDetail.target?.full_name||'')||'P'}</div>
                <div><p>RECRUITMENT</p><h2 ref={targetHeading} tabIndex={-1}>{targetDetail.target?.full_name}</h2><span>{[targetDetail.target?.primary_position,targetDetail.target?.current_club,targetDetail.target?.current_country].filter(Boolean).join(' · ')||'Add more player details'}</span></div></header>
              <section className={styles.detailSection}><p>CURRENT STAGE</p><h3>{PIPELINE.find(([key])=>key===targetDetail.target?.ui_stage)?.[1]||human(targetDetail.target?.ui_stage)}</h3>
                <span className={styles.sectionCopy}>{targetDetail.target?.next_action_at?`Next follow-up ${relativeDate(targetDetail.target.next_action_at)}`:'No next follow-up yet'}</span>
                <div className={styles.actionRow}>
                  {canWorkRecruitment&&nextMajorStage(targetDetail.target?.raw_stage)?(<button type="button" data-ui-button="primary" disabled={targetLocked}
              className={styles.primaryButton} onClick={()=>{if(nextMajorStage(targetDetail.target?.raw_stage)?.[0]==='signed')setConfirmStage(currentTarget.current);else void changeStage();}}><ArrowRight size={14}/> {targetSaving==='recruitment_set_stage'?'Saving stage...':'Move to '+nextMajorStage(targetDetail.target?.raw_stage)?.[1]}</button>):null}
                  {canPromoteRecruitment&&targetDetail.target?.raw_stage==='signed'?(<button type="button" data-ui-button="primary" disabled={targetLocked}
              className={styles.primaryButton} onClick={()=>setConfirmPromotion(currentTarget.current)}><Users size={14}/> Add to Our Players</button>):null}
                </div>
              </section>
              {canWorkRecruitment&&!['signed','paused','declined','lost'].includes(targetDetail.target?.raw_stage)?<section className={styles.detailSection}><p>FOLLOW-UP</p><h3>Set the next follow-up</h3><div className={styles.followupForm}><label>Follow-up date and time<input type="datetime-local" value={followupDraft} disabled={targetLocked} onChange={event=>{followupDirty.current=true;setFollowupDraft(event.target.value);}}/></label><small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small><button type="button" data-ui-button="primary" className={styles.primaryButton} disabled={targetLocked||!followupDraft||new Date(followupDraft).getTime()===new Date(targetDetail.target?.next_action_at).getTime()} onClick={()=>void saveFollowup()}>{targetSaving==='recruitment_set_next_action'?'Saving follow-up...':'Save follow-up'}</button></div></section>:null}
              {canWorkRecruitment?<section className={styles.detailSection}><p>CONTACT</p><h3>Log what happened</h3>
                <div className={styles.interactionForm}>
                  <select aria-label="Interaction channel" disabled={targetLocked} value={interactionChannel} onChange={(e)=>setInteractionChannel(e.target.value)}><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="other">Other</option></select>
                  <select aria-label="Contact direction" disabled={targetLocked} value={interactionDirection} onChange={event=>setInteractionDirection(event.target.value)}><option value="outbound">Agency to player</option><option value="inbound">Player to agency</option><option value="mutual">Two-way conversation</option></select>
                  <textarea aria-label="Interaction note" disabled={targetLocked} rows={3} value={interaction} onChange={(e)=>setInteraction(e.target.value)} placeholder="Short factual note"/>
                  <button type="button" data-ui-button="primary"
              className={styles.primaryButton} disabled={targetLocked||!interaction.trim()} onClick={()=>void logInteraction()}><CheckCircle2 size={14}/> {targetSaving==='recruitment_log_interaction'?'Saving interaction...':'Save interaction'}</button>
                </div>
              </section>:null}
              <section className={styles.detailSection}><p>HISTORY</p><h3>Recruitment interactions</h3>
                <div className={styles.rows}>
                  {(targetDetail.interactions||[]).map((item:any)=>(<article className={styles.row} key={item.id}><div><strong>{human(item.channel)} · {human(item.direction)}</strong><span>{item.summary}</span><small>{relativeDate(item.occurred_at)}</small></div></article>))}
                  {!(targetDetail.interactions||[]).length?<Empty icon={UserRound} title="No recruitment interaction yet" copy="Log the first real conversation. Timestamps are never invented."/>:null}
                </div>
              </section>
            </div>
          ):null}
        </aside>
        <ConfirmActionDialog open={confirmStage===currentTarget.current} title="Confirm signed representation?" description="Only mark this player as represented once the representation agreement has been signed." confirmLabel="Confirm represented" onClose={()=>setConfirmStage(null)} onConfirm={()=>{if(confirmStage===currentTarget.current)void changeStage();setConfirmStage(null);}}/>
        <ConfirmActionDialog open={confirmPromotion===currentTarget.current} title="Add this player to Our Players?" description="This creates their agency player record and moves them out of Recruitment." confirmLabel="Add represented player" onClose={()=>setConfirmPromotion(null)} onConfirm={()=>{if(confirmPromotion===currentTarget.current)void promote();setConfirmPromotion(null);}}/>
      </div>
    );
  }

  if (playerId) {
    return (
      <PlayerDrawer
        key={`${stateScope}:${playerId}`}
        canManageRecords={canManageRecords}
        cacheScope={stateScope}
        playerId={playerId}
        summary={players.find(
          (item: any) => String(item?.player_id || '') === playerId,
        )}
        basePath={basePath}
        invoke={invoke}
        rpc={rpc}
        onRefresh={onRecordRefresh || onRefresh}
        onClose={closePlayer}
        onOpenAction={onOpenAction}
      />
    );
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.toolbar}>
        <div className={styles.sectionTabs} data-people-internal-tabs>
          <button type="button" className={section==='players'?styles.sectionTabActive:styles.sectionTab} onClick={()=>changeSection('players')}>
            Our Players {Array.isArray(data?.directory?.items)?<b>{data?.directory?.total ?? players.length}</b>:null}
          </button>
          <button type="button" className={section==='recruitment'?styles.sectionTabActive:styles.sectionTab} onClick={()=>changeSection('recruitment')}>
            Recruitment {Array.isArray(data?.recruitment?.items)?<b>{targets.length}</b>:null}
          </button>
        </div>
        <div className={styles.listControls}>
        <WorkspaceListSearch className={styles.search} label={section==='players'?'Search players':'Search recruitment'} placeholder={section==='players'?'Search players':'Search recruitment'} value={search} onChange={setSearch}/>
        {section==='players' && canCreateRecords && onCreatePlayer ? <button type="button" data-ui-button="secondary" className={styles.primaryButton} onClick={onCreatePlayer}><Plus size={14}/> Add player</button> : null}
        {section==='recruitment' && canCreateRecords?(
          <button type="button" data-ui-button="secondary"
              className={styles.primaryButton} onClick={openRecruitmentCreate}><Plus size={14}/> Add target</button>
        ):null}
        </div>
      </section>

      {section==='players'?(
        <section className={styles.playerGrid}>
          {filteredPlayers.map((item:any)=>{
            const identity=item?.identity||{};
            const service=item?.service||{};
            const name=identity.name||'Player';
            const age=ageFromDob(identity.date_of_birth);
            const priority=playerRosterPriority(item);
            const attention=priority.tone==='attention';
            const nextInstruction=priority.instruction;
            const openPriority=()=>{
              if(priority.kind==='work'){
                openPlayer(String(item.player_id));
                return;
              }
              const control=service?.next_control_fix;
              const move=service?.next_service_move;
              const isControl=priority.kind==='control';
              const directive=isControl?control:move;
              if(!directive?.instruction||!priority.actionLabel)return;
              onOpenAction({
                key:`player:${item.player_id}`,
                eyebrow:'PLAYER',
                title:name,
                instruction:directive.instruction,
                label:priority.actionLabel,
                action:isControl?'player_control_fix_prepare':'player_service_move_prepare',
                payload:{player_id:item.player_id},
                facts:[
                  {label:'Player status',value:human(service.state||'Recorded')},
                  {label:'Next move',value:move?.instruction||identity.next_action||'Not set'},
                  {label:'Contract timing',value:identity.contract_expiry?relativeDate(identity.contract_expiry):'No expiry set'},
                  {label:'Market activity',value:human(service?.market_coverage?.state||'Not set')},
                ],
                successCondition:directive.success_condition||'The next step is current.',
              });
            };
            return(
              <article
                className={styles.playerCard}
                key={item.player_id}
                role="button"
                aria-label={`Open ${name}`}
                tabIndex={0}
                onClick={() => openPlayerProfile(String(item.player_id))}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openPlayerProfile(String(item.player_id));
                  }
                }}
              >
                <div className={styles.playerCardTop}>
                  <Avatar name={name} path={identity.profile_photo_path}/>
                  <div className={styles.playerIdentity}><h3>{name}</h3>
                    <span>{[identity.primary_position,identity.current_club].filter(Boolean).join(' · ')||'Add position, club or country'}</span>
                    <small>{[age!==null?`${age}`:null,Array.isArray(identity.nationalities)?identity.nationalities[0]:null].filter(Boolean).join(' · ')||'Age and nationality not set'}</small></div>
                  <div className={styles.playerCardEnd}>
                    {!item.access?.restricted ? <>                    {canManageRecords ? <EntityActionsMenu
                      kind="player"
                      entityId={String(item.player_id)}
                      label={name}
                      rpc={rpc}
                      onChanged={refreshEntities}
                      fields={[
                        { key: 'first_name', label: 'First name', value: identity.first_name },
                        { key: 'last_name', label: 'Last name', value: identity.last_name },
                        { key: 'preferred_name', label: 'Preferred name', value: identity.preferred_name },
                        { key: 'primary_position', label: 'Primary position', value: identity.primary_position },
                        { key: 'current_club', label: 'Current club', value: identity.current_club },
                        { key: 'current_country', label: 'Current country', value: identity.current_country },
                        { key: 'contract_expiry', label: 'Contract expiry', value: identity.contract_expiry || '', type: 'date' },
                      ]}
                    /> : null}
</> : null}
                    <span className={attention?styles.attentionPill:`${styles.calmPill} ${styles.setupPill}`}>{priority.badge}</span>
                  </div>
                </div>
                {item.access?.restricted ? <p className={styles.sectionCopy}>Assigned player. Contract details require admin access.</p> : <>
                <div className={styles.mobilePlayerMeta}>
                  <span>
                    <CalendarDays size={12} />
                    <b>{identity.contract_expiry?relativeDate(identity.contract_expiry):'Contract not set'}</b>
                  </span>
                  <span>
                    <Target size={12} />
                    <b>{Number(item.active_opportunities||0)} active {Number(item.active_opportunities||0)===1?'opportunity':'opportunities'}</b>
                  </span>
                </div>
                {nextInstruction && priority.actionLabel ? <button type="button"
                  className={`${styles.mobileNextAction} ${attention?styles.mobileNextActionAttention:styles.setupNextAction}`}
                  aria-label={`${priority.actionLabel} for ${name}`}
                  onClick={event=>{event.stopPropagation();openPriority();}}>
                  <span className={styles.mobileNextActionHead}>
                    <span className={attention?styles.mobileStatusDot:styles.mobileStatusDotCalm} />
                    <span>{priority.heading}</span>
                    {priority.dueAt?<small>{priority.badge==='Due today'?'Today':relativeDate(priority.dueAt)}</small>:null}
                  </span>
                  <span className={styles.mobileNextActionBody}>
                    <strong>{nextInstruction||'No next action yet'}</strong>
                    <ChevronRight size={15} />
                  </span>
                </button> : null}
                <div className={styles.playerFacts}>
                  <div><span>Playing contract</span><strong>{identity.contract_expiry?relativeDate(identity.contract_expiry):'Not set'}</strong></div>
                  <div><span>Opportunities</span><strong>{Number(item.active_opportunities||0)}</strong></div>
                </div>
                </>}
                {!item.access?.restricted ? <div className={styles.profileShortcutRow}>
                  <button
                    type="button"
                    data-ui-button="secondary"
                    className={styles.profileShortcut}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPlayer(String(item.player_id));
                    }}
                    aria-label={`Open ${name} work view`}
                  >
                    <UserRound size={14} />
                    Work view
                  </button>
                </div> : null}
              </article>
            );
          })}
          {data?.directory?.has_more ? (
            <div className={styles.pagination}>
              <p>{players.length} of {data.directory.total} players loaded.{search ? ' This filter applies to loaded players. Use Find to search every player.' : ''}</p>
              {pageError ? <p role="alert">{pageError}</p> : null}
              <button type="button" data-ui-button="secondary" className={styles.secondaryButton} disabled={pageBusy || directoryRefreshing} onClick={()=>void loadNextPage()}>
                {pageBusy ? <LoaderCircle size={15} className={styles.spin}/> : <Plus size={15}/>}
                {directoryRefreshing ? 'Refreshing players...' : pageBusy ? 'Loading players...' : pageError ? 'Retry loading players' : 'Load more players'}
              </button>
            </div>
          ) : null}
          {!filteredPlayers.length?<Empty icon={Users} title={search?'No players match this search':data?.directory?.access?.scope==='assigned'?'No assigned players yet':'No players yet'} copy={search?'Try another name, club or position.':data?.directory?.access?.scope==='assigned'?'Ask an agency administrator to assign the players you should work with.':'Add the first represented player and their current position will appear here.'}/>:null}
        </section>
      ):(
        <div className={styles.recruitmentLayout}>
          <label className={styles.mobileStageSelect}>
            <span>Stage</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
            >
              <option value="all">All ({targets.length})</option>
              {PIPELINE.filter(([key]) => key === stageFilter || Number(stageCounts[key] || 0) > 0).map(([key, label]) => (
                <option value={key} key={key}>
                  {label} ({stageCounts[key] || 0})
                </option>
              ))}
            </select>
          </label>

          <section className={styles.stageFilters}>
            <button type="button" className={stageFilter==='all'?styles.stageFilterActive:styles.stageFilter} onClick={()=>setStageFilter('all')}>All <span>{targets.length}</span></button>
            {PIPELINE.filter(([key]) => key === stageFilter || Number(stageCounts[key] || 0) > 0).map(([key,label])=>(
              <button type="button" key={key} className={stageFilter===key?styles.stageFilterActive:styles.stageFilter} onClick={()=>setStageFilter(key)}>
                {label}<span>{stageCounts[key]||0}</span>
              </button>
            ))}
          </section>
          <section className={styles.recruitmentList}>
            {filteredTargets.map((item:any)=>(
              <div className={styles.recruitmentRowWrap} key={item.id}>
                <button type="button" className={styles.recruitmentRow} onClick={()=>openTarget(String(item.id))}>
                <div className={styles.recruitmentMark}>{initials(item.full_name||'')||'P'}</div>
                <div className={styles.recruitmentCopy}><div className={styles.recruitmentTitle}><strong>{item.full_name}</strong>{item.follow_up_overdue?<span className={styles.overduePill}>Follow-up overdue</span>:null}</div>
                  <span>{[item.primary_position,item.current_club,item.current_country].filter(Boolean).join(' · ')||'Add more player details'}</span>
                  <small>{item.last_interaction?.summary||(item.next_action_at?`Next follow-up ${relativeDate(item.next_action_at)}`:'No next follow-up yet')}</small></div>
                <div className={styles.recruitmentStage}><span>{PIPELINE.find(([key])=>key===item.ui_stage)?.[1]||human(item.ui_stage)}</span><ChevronRight size={15}/></div>
                </button>
                {canManageRecords ? <EntityActionsMenu
                  kind="recruitment_target"
                  entityId={String(item.id)}
                  label={item.full_name || 'Recruitment target'}
                  rpc={rpc}
                  onChanged={refreshEntities}
                  className={styles.recruitmentRowActions}
                  fields={[
                    { key: 'full_name', label: 'Player name', value: item.full_name },
                    { key: 'primary_position', label: 'Position', value: item.primary_position },
                    { key: 'current_club', label: 'Current club', value: item.current_club },
                    { key: 'current_country', label: 'Current country', value: item.current_country },
                    { key: 'contract_expiry', label: 'Contract expiry', value: item.contract_expiry || '', type: 'date' },
                    { key: 'transfermarkt_url', label: 'Transfermarkt', value: item.transfermarkt_url, type: 'url' },
                  ]}
                /> : null}
              </div>
            ))}
            {!filteredTargets.length?<Empty icon={Target} title="No recruitment targets here" copy="Add a target or change the filter."/>:null}
          </section>
        </div>
      )}



      {createOpen?<AgencyCreateDrawer key={stateScope+':recruitment-create'} kind="recruitment_target" theme={theme} invoke={invoke} onClose={closeRecruitmentCreate}
        onCreated={onRefresh}
        onOpenCreated={result=>{closeRecruitmentCreate();openTarget(result.result.prospect_id);}}/>:null}

    </div>
  );
}
