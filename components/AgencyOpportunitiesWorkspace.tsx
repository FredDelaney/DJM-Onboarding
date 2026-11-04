'use client';

import {
  ChevronRight, ChevronsUpDown, Columns3, FileText, Filter, ListOrdered, Plus, Snowflake, Sun,
  BriefcaseBusiness,
  MessageCircleMore,
  Target,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyIntelligenceRequest } from '@/components/AgencyEntityIntelligenceDrawer';
import type { AgencyPursuitRequest } from '@/components/AgencyPursuitRoom';
import AgencyOwnershipChip from '@/components/AgencyOwnershipChip';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import WorkspaceListSearch from './WorkspaceListSearch';
import ClubPitchHistory from './ClubPitchHistory';
import ClubIdentityMark,{CountryFlag} from './ClubIdentityMark';
import type {PitchHistoryInvoke} from '@/lib/club-pitch-history';
import { opportunityReadState } from '@/lib/opportunity-read-state';
import { relativeDate } from '@/lib/platform-client';
import { readWithDeadline } from '@/lib/read-with-deadline';
import {clubNeedBriefFields, clubNeedFinancialFacts,clubNeedFootballFacts,clubNeedFieldValue,formatCommercialAmount} from '@/lib/club-need-brief';
import {filterClubRequests, type RequestPriorityFilter, type RequestDealFilter} from '@/lib/club-request-filters';
import {additionalRequestFields,preferenceValue,requestPreferenceKeys,requestPreferencesPatch,type RequestPreferencesResult} from '@/lib/club-request-preferences';
import {workspaceClubHref} from '@/lib/workspace-record-navigation';

import styles from './AgencyOpportunitiesWorkspace.module.css';

const AgencyOpportunityOverview = dynamic(() => import('./AgencyOpportunityOverview'));
const TransferWindowsDialog = dynamic(() => import('./TransferWindowsDialog'));
const requestColumns = ['Position', 'Window', 'Priority', 'Notes', 'Players', 'Budget'] as const;
type RequestColumn = typeof requestColumns[number];
const requestWidths: Record<RequestColumn, string> = {Position:'1.4fr', Window:'.7fr', Priority:'.85fr', Notes:'.62fr', Players:'.65fr', Budget:'1fr'};
const priorityNames: Record<string,string> = {1:'Low',2:'Routine',3:'Normal',4:'High',5:'Urgent'};

type OpportunityView = 'overview' | 'needs' | 'routes' | 'deals';

const opportunityViewFrom = (value: unknown): OpportunityView =>
  value === 'overview' || value === 'routes' || value === 'deals' ? value : 'needs';

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const candidateCoverageLabel = (item: any) => {
  const value = item?.candidate_coverage?.recorded_candidates;
  const count = typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  return count === null ? 'Coverage not recorded' : `${count} recorded candidate${count === 1 ? '' : 's'}`;
};
const salaryFigure=(amount:unknown,currency:unknown,period:unknown,basis:unknown)=>{
 const value=formatCommercialAmount(amount,currency);if(value===null)return 'Not recorded';
 return `${value} ${period==='monthly'?'per month':period==='weekly'?'per week':period==='annual'?'per year':'· period unknown'} · ${basis==='gross'?'gross':basis==='net'?'net':'tax basis unknown'}`;
};

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (value:unknown,currency?:string|null) => formatCommercialAmount(value,currency)||'Commission not set';

const careerGateLabel = (value: unknown) => {
  const state = String(value || '').trim().toLowerCase();
  if (!state) return 'Recorded';
  if (state.startsWith('open_')) return 'Open to progress';
  if (state.startsWith('review_')) return 'Review needed';
  if (state.startsWith('hold_')) return 'Player decision needed';
  return human(state);
};

function ConnectedOpportunityContext({
  context,
}: {
  context: any;
}) {
  if (!context) return null;

  const latest = context?.latest_contact || null;
  const followup = context?.open_followup || null;
  const sourceName =
    context?.source_person_name || 'Known source';
  const label =
    context?.scope === 'deal_source_contact'
      ? 'DEAL CONTACT'
      : 'NEED SOURCE';

  return (
    <div className={styles.connectedContext}>
      <div className={styles.connectedContextIcon}>
        <MessageCircleMore size={13} />
      </div>

      <div className={styles.connectedContextCopy}>
        <small>{label}</small>

        {latest ? (
          <>
            <strong>
              {latest?.person_name || sourceName}
            </strong>
            <span>
              {latest?.summary ||
                'Contact linked.'}
            </span>
            <div className={styles.connectedContextMeta}>
              <em>
                {human(latest?.channel || 'Connected')}
                {latest?.direction
                  ? ` · ${human(latest.direction)}`
                  : ''}
                {latest?.occurred_at
                  ? ` · ${relativeDate(
                      latest.occurred_at,
                    )}`
                  : ''}
              </em>
              <AgencyOwnershipChip
                label="Contact owner"
                name={latest?.owner_name || null}
                emptyText={
                  latest?.owner_user_id
                    ? 'Needs reassignment'
                    : 'Unassigned'
                }
                attention={
                  latest?.owner_state !== 'active_staff'
                }
              />
            </div>
          </>
        ) : (
          <>
            <strong>{sourceName}</strong>
            <span>
              No connected conversation yet.
            </span>
          </>
        )}

        {followup ? (
          <div className={styles.connectedFollowup}>
            <span>
              Open follow-up: {followup?.title || 'Follow up'}
              {followup?.due_at
                ? ` · ${relativeDate(followup.due_at)}`
                : ''}
            </span>
            <AgencyOwnershipChip
              label="Follow-up owner"
              name={followup?.owner_name || null}
              emptyText={
                followup?.owner_user_id
                  ? 'Needs reassignment'
                  : 'Unassigned'
              }
              attention={
                followup?.owner_state !== 'active_staff'
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AgencyOpportunitiesWorkspace({
  data,
  basePath,
  onRetry,
  onRefresh,
  onRecordRefresh,
  rpc,
  onOpenAction,
  onOpenPursuit,
  onOpenIntelligence,
  invoke,
  marketInvoke,
  recordRefreshKey,
  onCreateNeed,
}: {
  data: any;
  invoke: <T,>(action: string, body?: Record<string, unknown>) => Promise<T>;
  marketInvoke?: PitchHistoryInvoke;
  recordRefreshKey?: number;
  onCreateNeed?: () => void;
  basePath: string;
  onRetry?: () => void;
  onRefresh: () => Promise<void>;
  onRecordRefresh?: () => Promise<void>;
  rpc: <T,>(name: string, args?: Record<string, unknown>, signal?:AbortSignal) => Promise<T>;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenPursuit: (request: AgencyPursuitRequest) => void;
  onOpenIntelligence: (request: AgencyIntelligenceRequest) => void;
}) {
  const router = useRouter();
  const lookupRecords=useCallback((record_kind:'club'|'contact'|'organisation',query:string,selected_id:string)=>invoke('club_request_options',{record_kind,query,selected_id}),[invoke]);
  const searchParams = useSearchParams();
  const requestedView = opportunityViewFrom(searchParams.get('tab'));
  const [view, setView] = useState<OpportunityView>(requestedView);
  const [search, setSearch] = useState('');
  const [needPriority, setNeedPriority] = useState<RequestPriorityFilter>('all');
  const [needDeal, setNeedDeal] = useState<RequestDealFilter>('all');
  const [showWindows, setShowWindows] = useState(false);
  const requestTools = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(view!=='needs')return;
    const closeOutside=(event:PointerEvent)=>{
      for(const menu of requestTools.current?.querySelectorAll<HTMLDetailsElement>('details[open]')||[]){
        if(!menu.contains(event.target as Node))menu.open=false;
      }
    };
    document.addEventListener('pointerdown',closeOutside);
    return()=>document.removeEventListener('pointerdown',closeOutside);
  },[view]);
  const [requestPreferences, setRequestPreferences] = useState<RequestPreferencesResult|null>(null);
  const [columns, setColumns] = useState<RequestColumn[]>([...requestColumns]);
  const [requestSort, setRequestSort] = useState<{column: RequestColumn|'Club'; descending: boolean}|null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const currentColumns = requestColumns.filter(column=>columns.includes(column));
  const requestGrid = {'--request-columns':['minmax(155px,2fr)', ...currentColumns.map(column=>`minmax(0,${requestWidths[column]})`), '44px'].join(' ')} as CSSProperties;
  const filterCount = Number(needPriority !== 'all') + Number(needDeal !== 'all');

  const [archiveItems, setArchiveItems] = useState<any[]>([]);
  const [shortlistBusy,setShortlistBusy]=useState('');
  const [shortlistStates,setShortlistStates]=useState<Record<string,string>>({});
  const [shortlistNotice,setShortlistNotice]=useState('');
  const [shortlistError,setShortlistError]=useState('');
  const requestedRecord=String(searchParams.get('record')||'');
  const [expandedNeed, setExpandedNeed] = useState({scope: basePath, id: requestedView === 'needs' ? requestedRecord : ''});
  const [exactNeed,setExactNeed]=useState<any>(null);
  const [exactError,setExactError]=useState('');
  const [exactBusy,setExactBusy]=useState(false);
  const [exactRetry,setExactRetry]=useState(0);
  const needInSummary=list(data?.market?.demand?.items).some(item=>String(item?.club_need_id||'')===requestedRecord);
  const dealInSummary=list(data?.deals?.portfolio?.deals).some(item=>String(item?.deal_room_id||'')===requestedRecord);
  useEffect(()=>{
    setSearch('');
    // A deep link must never be hidden behind filters left over from another request.
    if(requestedRecord){setNeedPriority('all');setNeedDeal('all');}
  },[requestedRecord,requestedView]);
  useEffect(() => {
    setExpandedNeed({scope: basePath, id: requestedView === 'needs' ? requestedRecord : ''});
  }, [basePath, requestedRecord, requestedView]);
  useEffect(()=>{
    let current=true;
    setExactNeed(null);setExactError('');setExactBusy(false);
    if(!requestedRecord||requestedView!=='needs'||needInSummary)return;
    setExactBusy(true);
    void readWithDeadline(invoke<any>('workspace_need_record',{club_need_id:requestedRecord})).then(response=>{
      if(!current)return;
      const record=response?.record;
      if(!record?.available||String(record?.item?.club_need_id||'')!==requestedRecord)throw new Error('This opportunity is unavailable.');
      setExactNeed(record.item);
    }).catch(error=>{if(current)setExactError(error instanceof Error?error.message:'This opportunity could not load.');})
      .finally(()=>{if(current)setExactBusy(false);});
    return()=>{current=false;};
  },[requestedRecord,requestedView,needInSummary,invoke,exactRetry]);
  useEffect(()=>{
    if(requestedRecord&&requestedView==='deals'&&!dealInSummary){
      onOpenIntelligence({key:'deal-war-room:'+requestedRecord,kind:'deal',entityId:requestedRecord,title:'Deal details',context:null});
    }
  },[requestedRecord,requestedView,dealInSummary,onOpenIntelligence]);
  useEffect(()=>{
    if(!requestedRecord)return;
    const frame=requestAnimationFrame(()=>{
      const row=document.getElementById('opportunity-'+requestedRecord);
      if(row){row.scrollIntoView({block:'center',behavior:'instant'});row.focus({preventScroll:true});}
    });
    return()=>cancelAnimationFrame(frame);
  },[requestedRecord,data,view,exactNeed]);
  const readState = opportunityReadState(data, view);

  const reloadArchives = useCallback(async () => {
    const result = await rpc<any>('redream_entity_archives');
    setArchiveItems(Array.isArray(result?.items) ? result.items : []);
  }, [rpc]);

  const refreshEntities = useCallback(async () => {
    await Promise.all([(onRecordRefresh || onRefresh)(), reloadArchives()]);
  }, [onRefresh, onRecordRefresh, reloadArchives]);

  useEffect(() => {
    void reloadArchives().catch(() => undefined);
  }, [reloadArchives]);

  const changeShortlist = async(matchId:string,name:string,operation:'shortlist'|'remove')=>{
    if(shortlistBusy)return;
    setShortlistBusy(matchId);setShortlistError('');setShortlistNotice('');
    let savedStatus='';
    try{
      const response=await invoke<any>('club_need_shortlist',{player_match_id:matchId,operation});
      const result=response?.shortlist;
      if(result?.saved!==true||result.player_match_id!==matchId||
        (result.status!=='shortlisted'&&result.status!=='reviewing'))
        throw new Error('The change could not be confirmed. Review this request before retrying.');
      savedStatus=result.status;
      setShortlistStates(current=>({...current,[matchId]:savedStatus}));
      setShortlistNotice(operation==='shortlist'
        ? name+' added to your internal shortlist. No pitch was sent.'
        : name+' removed from the internal shortlist.');
    }catch(cause){
      setShortlistError(cause instanceof Error?cause.message:'Shortlist update unavailable.');
    }finally{setShortlistBusy('');}
    if(savedStatus)try{
      await (onRecordRefresh||onRefresh)();
      // Fresh server data takes precedence over our temporary confirmation label.
      setShortlistStates(current=>{const next={...current};delete next[matchId];return next;});
      if(requestedRecord)setExactRetry(current=>current+1);
    }catch{
      setShortlistNotice('Shortlist saved. The refreshed request could not load; check it again before another change.');
    }
  };
  const archived = useMemo(
    () => new Set(archiveItems.map((item: any) => `${String(item?.entity_type || '')}:${String(item?.entity_id || '')}`)),
    [archiveItems],
  );

  useEffect(() => {
    setView(requestedView);
  }, [requestedView]);

  const selectView = (nextView: OpportunityView) => {
    setView(nextView);
    setSearch('');
    router.replace(
      `${basePath}?view=opportunities&tab=${nextView}`,
      { scroll: false },
    );
  };

  const needs = [...list(data?.market?.demand?.items),...(exactNeed&&!needInSummary?[exactNeed]:[])].filter((item: any) =>
    !archived.has(`club_need:${String(item?.club_need_id || '')}`),
  );
  const preferenceIds=needs.map(item=>String(item.club_need_id||'')).filter(id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)).join(',');
  useEffect(()=>{
    if(view!=='needs'||!preferenceIds)return;
    const controller=new AbortController();
    void readWithDeadline(rpc<RequestPreferencesResult>('redream_club_request_preferences',{p_need_ids:preferenceIds.split(',').slice(0,251)},controller.signal),10000,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setRequestPreferences(result?.records&&Array.isArray(result.staff)?result:null);})
      .catch(()=>{if(!controller.signal.aborted)setRequestPreferences(null);});
    return()=>controller.abort();
  },[rpc,view,preferenceIds,recordRefreshKey]);
  const routes = list(data?.market?.pursuits?.items).filter((item: any) => {
    const needId = String(item?.club_need_id || item?.need?.club_need_id || item?.need?.id || '');
    return !needId || !archived.has(`club_need:${needId}`);
  });
  const deals = list(data?.deals?.portfolio?.deals).filter((deal: any) =>
    !archived.has(`deal_room:${String(deal?.deal_room_id || '')}`),
  );
  const connectedNeeds = list(data?.connected?.needs);
  const connectedRoutes = list(data?.connected?.routes);
  const connectedDeals = list(data?.connected?.deals);

  const needConnected = useMemo(
    () =>
      new Map(
        connectedNeeds.map((item: any) => [
          String(item?.club_need_id || ''),
          item,
        ]),
      ),
    [connectedNeeds],
  );

  const routeConnected = useMemo(
    () =>
      new Map(
        connectedRoutes.map((item: any) => [
          String(item?.player_match_id || ''),
          item,
        ]),
      ),
    [connectedRoutes],
  );

  const dealConnected = useMemo(
    () =>
      new Map(
        connectedDeals.map((item: any) => [
          String(item?.deal_room_id || ''),
          item,
        ]),
      ),
    [connectedDeals],
  );

  const searchValue = search.trim().toLowerCase();

  const matchedNeeds = filterClubRequests(needs,searchValue,needPriority,needDeal);
  const filteredNeeds = (selectionOnly ? matchedNeeds.filter(item=>selection.includes(String(item.club_need_id))) : matchedNeeds).slice();
  if (requestSort) {
    const value = (item:any) => {
      switch (requestSort.column) {
        case 'Club': return item.club?.name;
        case 'Position': return item.need?.position;
        case 'Window': return requestPreferences?.records[item.club_need_id]?.preferences.window_preference;
        case 'Priority': return item.need?.priority == null ? null : Number(item.need.priority);
        case 'Players': return item.candidate_coverage?.recorded_candidates;
        case 'Budget': return item.need?.transfer_budget == null ? null : Number(item.need.transfer_budget);
        default: return null;
      }
    };
    filteredNeeds.sort((left,right)=>{
      const a=value(left),b=value(right);
      if(requestSort.column==='Budget' && a!=null && b!=null) {
        const byCurrency=String(left.need?.currency||'').localeCompare(String(right.need?.currency||''));
        if(byCurrency) return byCurrency;
      }
      if(a==null||b==null) return Number(a==null)-Number(b==null);
      const order=typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b));
      return requestSort.descending?-order:order;
    });
  }
  const allSelected = matchedNeeds.length>0 && matchedNeeds.every(item=>selection.includes(String(item.club_need_id)));
  const changeSort = (column: RequestColumn|'Club') => setRequestSort(current=>({column,descending:current?.column===column&&!current.descending}));
  const sortHeading = (column: RequestColumn|'Club') => <button type="button" className={styles.sortRequest}
    aria-label={`Sort requests by ${column}${requestSort?.column===column ? (requestSort.descending?', descending':', ascending') : ''}`}
    onClick={()=>changeSort(column)}>{column}<ChevronsUpDown size={14} aria-hidden="true"/></button>;

  const filteredRoutes = useMemo(
    () =>
      routes.filter((item: any) =>
        !searchValue ||
        [
          item?.player?.name,
          item?.club?.name,
          item?.need?.title,
          item?.best_access_route?.person_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue),
      ),
    [routes, searchValue],
  );

  const filteredDeals = useMemo(
    () =>
      deals.filter((deal: any) =>
        !searchValue ||
        [
          deal?.title,
          deal?.organisation,
          deal?.stage,
          deal?.primary_blocker,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue),
      ),
    [deals, searchValue],
  );

  const activeItems =
    view === 'needs'
      ? filteredNeeds
      : view === 'routes'
        ? filteredRoutes
        : filteredDeals;

  const openNeedRoute = (item: any, candidate: any) => {
    onOpenPursuit({
      key: `pursuit:${candidate.player_match_id}`,
      playerMatchId: String(candidate.player_match_id),
      playerId: candidate.player_id
        ? String(candidate.player_id)
        : null,
      playerName: candidate.player_name || 'Player',
      clubId: item?.club?.organisation_id
        ? String(item.club.organisation_id)
        : null,
      clubName: item?.club?.name || 'Club',
      needTitle: item?.need?.title || null,
      careerGateState:
        candidate.career_gate_state ||
        candidate.match_status ||
        null,
      careerGateReason:
        candidate.career_gate_reason || null,
      accessLabel: null,
      accessDetail: null,
    });
  };

  const prepareSearch = (item: any) => {
    onOpenAction({
      key: `scouting:${item.club_need_id}`,
      eyebrow: 'CLUB NEED',
      title:
        `${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`,
      instruction:
        item.next_action?.instruction ||
        'Create scouting work.',
      label: 'Prepare search',
      action: 'scouting_mandate_prepare',
      payload: {
        club_need_id: item.club_need_id,
      },
      context:
        item.need?.position ||
        'Club need',
      facts: [
        {
          label: 'Need',
          value:
            item.need?.title ||
            'Player need',
          detail:
            `${human(item.need?.need_type || 'recorded')} · ${item.club?.name || 'Club recorded'}`,
        },
        {
          label: 'Profile',
          value:
            [
              item.need?.position,
              item.need?.preferred_foot
                ? `${item.need.preferred_foot} foot`
                : null,
              item.need?.min_height_cm
                ? `${item.need.min_height_cm}cm+`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') ||
            'Player profile needs more detail',
          detail: item.need?.transfer_type
            ? human(item.need.transfer_type)
            : 'Transfer type not set',
        },
        {
          label: 'Coverage',
          value: candidateCoverageLabel(item),
          detail: human(
            item.coverage_state ||
              'coverage not set',
          ),
        },
        {
          label: 'Timing',
          value: item.need?.expires_at
            ? relativeDate(item.need.expires_at)
            : 'No expiry set',
          detail: 'Club need timing',
        },
      ],
      successCondition:
        'A credible player is linked.',
      confirmationLabel: 'Create search task',
    });
  };

  const openRoute = (item: any) => {
    const accessMode =
      item.access_strategy?.recommended_mode ||
      item.best_access_route?.route_state ||
      'access_not_recorded';

    onOpenPursuit({
      key: `pursuit:${item.player_match_id}`,
      playerMatchId: String(item.player_match_id),
      playerId: item.player?.player_id
        ? String(item.player.player_id)
        : null,
      playerName: item.player?.name || 'Player',
      clubId: item.club?.organisation_id
        ? String(item.club.organisation_id)
        : null,
      clubName: item.club?.name || 'Club',
      needTitle: item.need?.title || null,
      careerGateState:
        item.career_strategy_gate?.state || null,
      careerGateReason:
        item.career_strategy_gate?.reason || null,
      accessLabel:
        item.best_access_route?.person_name ||
        human(accessMode),
      accessDetail:
        item.best_access_route?.why_this_route || null,
    });
  };

  const openDeal = (deal: any) => onOpenIntelligence({
    key: `deal-war-room:${deal.deal_room_id}`,
    kind: 'deal',
    entityId: String(deal.deal_room_id),
    title: deal.title || 'Live deal',
    context: deal.organisation || human(deal.stage),
  });

  const handleDeal = (deal: any) => {
    const controlInstruction = deal.next_control_fix?.instruction || '';
    if (!controlInstruction) { openDeal(deal); return; }

    const hasExpectedCommission =
      deal.expected_commission !== null &&
      deal.expected_commission !== undefined &&
      deal.expected_commission !== '' &&
      Number.isFinite(Number(deal.expected_commission));

    const commissionValue =
      hasExpectedCommission && deal.currency
        ? money(deal.expected_commission, deal.currency)
        : 'Commission not set';

    const introductionContext =
      deal.next_best_move?.introduction_context || {};

    const introductionTarget =
      introductionContext?.target_contact?.name || '';

    const introductionRole =
      introductionContext?.target_contact?.role_title || '';

    const introductionVia =
      introductionContext?.intermediary?.name || '';

    const needsOwner =
      /owner|ownership/i.test(controlInstruction);

    onOpenAction({
      key: `deal-control:${deal.deal_room_id}`,
      eyebrow: 'DEAL ACTION',
      title: deal.title || 'Live deal',
      instruction: controlInstruction,
      label: needsOwner ? 'Assign owner' : 'Fix this',
      action: 'deal_control_fix_prepare',
      payload: {
        deal_room_id: deal.deal_room_id,
      },
      context:
        deal.organisation || deal.stage,
      facts: [
        {
          label: 'Stage',
          value: human(deal.stage || 'recorded'),
          detail: human(
            deal.momentum_state ||
              'momentum recorded',
          ),
        },
        {
          label: 'Primary blocker',
          value:
            deal.primary_blocker ||
            'No blocker',
          detail: human(
            deal.control_state ||
              deal.rescue_state ||
              'control recorded',
          ),
        },
        {
          label: 'Commercial value',
          value: commissionValue,
          detail: hasExpectedCommission
            ? 'Expected commission'
            : 'Expected commission not set',
        },
        {
          label: 'Access route',
          value:
            introductionTarget ||
            deal.organisation ||
            'No contact route yet',
          detail: introductionVia
            ? `Warm introduction via ${introductionVia}`
            : introductionRole ||
              'No warm introduction yet',
        },
      ],
      successCondition:
        deal.next_control_fix?.success_condition ||
        (needsOwner
          ? 'One owner is accountable.'
          : 'Nothing needs attention.'),
      confirmationLabel:
        needsOwner ? 'Assign deal owner' : 'Apply fix',
    });
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.controls}>
        <div className={styles.tabs} aria-label="Opportunity view">
          <button type="button" className={view === 'overview' ? styles.tabActive : styles.tab} aria-pressed={view === 'overview'} onClick={() => selectView('overview')}>Overview</button>
          <button
            type="button"
            className={view === 'needs' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'needs'}
            onClick={() => selectView('needs')}
          >
            <Target size={15} />
            Needs
            {data?.market != null ? <span>{needs.length}</span> : null}
          </button>

          <button
            type="button"
            className={view === 'routes' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'routes'}
            onClick={() => selectView('routes')}
          >
            <Users size={15} />
            Player opportunities
            {data?.market != null ? <span>{routes.length}</span> : null}
          </button>

          <button
            type="button"
            className={view === 'deals' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'deals'}
            onClick={() => selectView('deals')}
          >
            <BriefcaseBusiness size={15} />
            Live deals
            {data?.deals != null ? <span>{deals.length}</span> : null}
          </button>
        </div>

        {view !== 'overview' && view !== 'needs' ? <WorkspaceListSearch className={styles.search} label="Search opportunities" placeholder={view==='routes'?'Search player or club':'Search live deals'} value={search} onChange={setSearch}/> : null}
      </section>

      {view === 'needs' ? <section className={styles.requestToolbar} aria-label="Request tools">
        <div className={styles.requestSearchRow}>
          <WorkspaceListSearch className={styles.search} label="Search opportunities" placeholder="Search clubs..." value={search} onChange={setSearch}/>
          <button type="button" className={styles.requestToolButton} onClick={()=>setShowWindows(true)}><ListOrdered size={17}/> Transfer windows</button>
          {onCreateNeed ? <button type="button" className={styles.addRequest} onClick={onCreateNeed}><Plus size={17}/> Add Request</button> : null}
        </div>
        <div ref={requestTools} className={styles.requestFilterBar} role="region" aria-label="Request filters" onKeyDown={event=>{
          if(event.key!=='Escape')return;
          const menu=(event.target as HTMLElement).closest<HTMLDetailsElement>('details[open]');
          if(menu){event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus();}
        }}>
          <details className={styles.requestColumns}><summary><Columns3 size={17}/> Columns</summary>
            <div className={styles.requestToolMenu}>{requestColumns.map(column=><label key={column}>
              <input type="checkbox" checked={columns.includes(column)} onChange={()=>setColumns(current=>current.includes(column)?current.filter(value=>value!==column):[...current,column])}/>
              {column}
            </label>)}</div>
          </details>
          <details className={styles.requestFilters}><summary><Filter size={17}/> Filter {filterCount>0?<span className={styles.filterBadge}>{filterCount}</span>:null}</summary>
          <div className={styles.requestToolMenu}>
        <label className={styles.requestFilter}><span>Priority</span>
          <select aria-label="Request priority" value={needPriority} onChange={event=>setNeedPriority(event.target.value as RequestPriorityFilter)}>
            <option value="all">All priorities</option>
            <option value="high">High or urgent</option>
            <option value="normal">Normal</option>
            <option value="low">Low or routine</option>
            <option value="unset">Not recorded</option>
          </select>
        </label>
        <label className={styles.requestFilter}><span>Deal type</span>
          <select aria-label="Request deal type" value={needDeal} onChange={event=>setNeedDeal(event.target.value as RequestDealFilter)}>
            <option value="all">All deal types</option>
            <option value="permanent">Permanent</option>
            <option value="loan">Loan</option>
            <option value="free_agent">Free agent</option>
            <option value="unset">Not recorded</option>
          </select>
        </label>
          </div></details>
          {filterCount ? <button type="button" className={styles.clearRequestFilters} onClick={()=>{setNeedPriority('all');setNeedDeal('all');requestTools.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu=>{menu.open=false;});}}>Clear filters</button>:null}
          {selection.length>0?<button type="button" className={styles.clearRequestFilters} aria-pressed={selectionOnly} onClick={()=>setSelectionOnly(value=>!value)}>{selectionOnly?'Show all requests':`Show selected (${selection.length})`}</button>:null}
          <span className={styles.requestFilterCount} aria-live="polite">{filteredNeeds.length} of {needs.length} requests</span>
        </div>
        {showWindows?<TransferWindowsDialog onClose={()=>setShowWindows(false)}/>:null}
      </section> : null}

      {exactBusy?<p role="status">Opening...</p>:null}
      {exactError?<div role="alert"><p>{exactError}</p><button type="button" className="btn" onClick={()=>setExactRetry(value=>value+1)}>Try again</button></div>:null}
      {view === 'overview' ? <AgencyOpportunityOverview
        needs={needs} routes={routes} deals={deals}
        connectedNeeds={connectedNeeds} connectedDeals={connectedDeals}
        marketReady={data?.market != null && !data?.opportunity_errors?.market}
        dealsReady={data?.deals != null && !data?.opportunity_errors?.deals}
        marketError={Boolean(data?.opportunity_errors?.market)}
        dealsError={Boolean(data?.opportunity_errors?.deals)}
        onRetry={onRetry || (() => void onRefresh())}
        onOpenNeed={(id) => router.push(`${basePath}?view=opportunities&tab=needs&record=${encodeURIComponent(id)}`, {scroll:false})}
        onOpenPursuit={(request) => onOpenPursuit(request)}
        onOpenDeal={(request) => onOpenIntelligence(request)}
      /> : null}
      {view !== 'overview' ? <section className={`${styles.listCard} ${view==='needs'?styles.requestList:''}`} style={view==='needs'?requestGrid:undefined}>
        {view==='needs'&&filteredNeeds.length>0?<div className={styles.requestHead}>
          <span className={styles.requestHeadName}>
            <input type="checkbox" aria-label="Select visible requests" checked={allSelected} onChange={()=>{
              const ids=matchedNeeds.map(item=>String(item.club_need_id));
              setSelection(current=>allSelected?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]);
              if(allSelected)setSelectionOnly(false);
            }}/>
            {sortHeading('Club')}
          </span>
          {currentColumns.map(column=><span key={column}>{column==='Notes'?column:sortHeading(column)}</span>)}<span/>
        </div>:null}
        {view === 'needs'
          ? filteredNeeds.map((item: any) => {
              const candidates = list(
                item?.candidate_coverage?.candidates,
              );
              const expiry = item.need?.expires_at ? Date.parse(item.need.expires_at) : null;
              const inactive = Boolean(item.need?.status && item.need.status !== 'active');
              const invalidExpiry = expiry !== null && !Number.isFinite(expiry);
              const expired = expiry !== null && expiry < Date.now();
              const needOpen = !inactive && !invalidExpiry && !expired;
              const statusLabel = inactive ? `Need ${human(item.need.status).toLowerCase()}` : invalidExpiry ? 'Expiry needs review' : expired ? 'Need expired' : '';
              const needId = String(item.club_need_id);
              const preferences = requestPreferences?.records[needId]?.preferences;
              const windowPreference = preferences?.window_preference;
              const refreshRequest = async () => {
                await refreshEntities();
                if (!preferences) return;
                const result = await rpc<RequestPreferencesResult>('redream_club_request_preferences',{p_need_ids:[needId]});
                setRequestPreferences(current=>current&&result?.records?{...current,records:{...current.records,...result.records}}:current);
              };
              const clubHref = workspaceClubHref(basePath, item.club?.organisation_id);
              const expanded = expandedNeed.scope === basePath && expandedNeed.id === needId;
              const toggleId = `need-review-${needId}`;
              const panelId = `need-detail-${needId}`;
              const toggle = () => setExpandedNeed({scope: basePath, id: expanded ? '' : needId});
              const facts = [
                ['Position', item.need?.position],
                ['Window',windowPreference&&windowPreference!=='unspecified'?human(windowPreference):null],
                ['Origin',preferences?.player_origin?human(preferences.player_origin):null],
                ['Club league',item.club?.league_name],
                ['Country',item.club?.country],
                ['Preferred foot', item.need?.preferred_foot],
                ['Minimum height', item.need?.min_height_cm ? `${item.need.min_height_cm} cm` : null],
                ['Transfer', item.need?.transfer_type ? human(item.need.transfer_type) : null],
                ...clubNeedFootballFacts(item.need||{}),
                ['Availability',item.need?.availability_notes],
              ].filter(([, value]) => value);
              const financialFacts=clubNeedFinancialFacts(item.need||{});
              for(const [label,key] of [['Minimum transfer fee','transfer_budget_min'],['Minimum wage','salary_budget_min']] as const){
                const figure=formatCommercialAmount(preferences?.[key],item.need?.currency);
                if(figure)financialFacts.push([label,figure]);
              }
              const sourceFacts=[
                ['Source contact',item.need?.source_person_name|| (item.need?.source_person_id?'Saved contact unavailable':null)],
                ['Source organisation',item.need?.source_organisation_name||(item.need?.source_organisation_id?'Saved organisation unavailable':null)],
                ['Received',item.need?.received_on],
                ['Priority',({1:'Low',2:'Routine',3:'Normal',4:'High',5:'Urgent'} as Record<string,string>)[String(item.need?.priority)]],
                ['Assigned users',Array.isArray(preferences?.assigned_user_ids)?requestPreferences?.staff.filter(member=>preferences.assigned_user_ids instanceof Array&&preferences.assigned_user_ids.includes(member.id)).map(member=>member.name).join(', '):null],
                ['Source status',item.need?.source_status?human(item.need.source_status):'Not established'],
                ['Expires', expiry !== null && Number.isFinite(expiry) ? relativeDate(item.need.expires_at) : null],
              ].filter(([, value]) => value);

              return (
                <article
                  className={`${styles.row} ${styles.needRow}`}
                  key={needId}
                  id={`opportunity-${needId}`}
                  data-search-match={requestedRecord === needId || undefined}
                  tabIndex={-1}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
                    event.preventDefault(); toggle();
                  }}
                >
                  <div className={styles.requestName}>
                  <input type="checkbox" className={styles.requestSelect} aria-label={`Select ${item.club?.name||'club'}: ${item.need?.title||'request'}`}
                    checked={selection.includes(needId)} onChange={()=>{
                      setSelection(current=>current.includes(needId)?current.filter(id=>id!==needId):[...current,needId]);
                      if(selection.length===1&&selection.includes(needId))setSelectionOnly(false);
                    }}/>
                  <button type="button" className={styles.needReview} id={toggleId} aria-label={`Review ${item.club?.name || 'club'}: ${item.need?.title || 'player need'}`} aria-expanded={expanded} aria-controls={panelId} onClick={toggle}>
                    <ClubIdentityMark name={item.club?.name||'Club'} country={item.club?.country}/>
                    <span className={styles.requestIdentity}>
                      <strong>{item.club?.name || 'Club'}</strong>
                      <small>{item.club?.country?<CountryFlag country={item.club.country}/>:null}{item.club?.country || item.need?.title || 'Player need'}</small>
                    </span>
                    <span className={`${styles.copy} ${styles.requestMobileCopy}`}>
                      <span className={styles.rowEyebrow}>Club need</span>
                      <strong>{item.club?.name || 'Club'} · {item.need?.title || 'Player need'}</strong>
                      <span>{statusLabel || item.next_action?.instruction || 'Review the requirements and recorded player opportunities.'}</span>
                      <small>{item.need?.position || 'Position not recorded'} · {candidateCoverageLabel(item)}</small>
                    </span>
                    <ChevronRight size={18} className={expanded ? styles.needChevronOpen : undefined}/>
                  </button>
                  </div>
                  {currentColumns.map(column=>{
                    const count=item.candidate_coverage?.recorded_candidates;
                    const hasNotes=Boolean(item.need?.profile_notes||item.need?.raw_request||item.need?.source_context);
                    const content = column==='Position' ? item.need?.position
                      : column==='Window' ? (windowPreference==='winter'?<Snowflake size={17} aria-label="Winter" color="#357ebf"/>:windowPreference==='summer'?<Sun size={17} aria-label="Summer" color="#a55e06"/>:null)
                      : column==='Priority' ? <span className={styles.requestPriority} data-priority={item.need?.priority}><i/>{priorityNames[String(item.need?.priority)]||'Unrecorded'}</span>
                      : column==='Notes' ? <button type="button" className={styles.requestCellButton} data-notes={hasNotes||undefined} aria-label={hasNotes?'Review request notes':'No notes recorded. Review request'} onClick={toggle}><FileText size={17}/></button>
                      : column==='Players' ? <button type="button" className={styles.requestCellButton} aria-label={candidateCoverageLabel(item)} title={candidateCoverageLabel(item)} onClick={toggle}><span className={typeof count==='number'?styles.requestCount:undefined}>{typeof count==='number'?count:'–'}</span></button>
                      : formatCommercialAmount(item.need?.transfer_budget,item.need?.currency);
                    return <div className={styles.requestCell} key={column}>{content||'–'}</div>;
                  })}
                  <div className={styles.rowActions}>
                    <EntityActionsMenu
                      kind="club_need"
                      requestClub={{name:item.club?.name||'Club', country:item.club?.country, league:item.club?.league_name}}
                      versionedEdit
                      lookup={lookupRecords}
                      entityId={needId}
                      label={`${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`}
                      rpc={(name,args,signal)=>{
                        if(name!=='redream_entity_patch')return rpc(name,args,signal);
                        const patch = args?.p_patch as Record<string,unknown>;
                        if(!preferences)return rpc('redream_club_need_patch',{p_need_id:needId,p_expected_updated_at:item.need?.updated_at||null,p_patch:patch},signal);
                        const ordinary = Object.fromEntries(Object.entries(patch).filter(([key])=>!requestPreferenceKeys.some(preference=>preference===key)));
                        return rpc('redream_club_need_patch_v2',{
                          p_need_id:needId,p_expected_updated_at:item.need?.updated_at||null,
                          p_patch:ordinary,p_preferences:requestPreferencesPatch(patch),
                        },signal);
                      }}
                      requestStaff={preferences?requestPreferences?.staff:undefined}
                      onChanged={refreshRequest}
                      fields={[
                        { key: 'title', label: 'Need title', value: item.need?.title },
                        { key: 'position', label: 'Position', value: item.need?.position },
                        { key: 'profile_notes', label: 'Profile notes', value: item.need?.profile_notes, type: 'textarea' },
                        { key: 'expires_at', label: 'Expires', value: item.need?.expires_at ? String(item.need.expires_at).slice(0, 10) : '', type: 'date' },
                        ...clubNeedBriefFields.map(field=>({...field,value:clubNeedFieldValue(field.key,item.need?.[field.key])})),
                        ...(preferences?[...additionalRequestFields.map(field=>({...field,value:preferenceValue(preferences[field.key])})),
                          {key:'loan_option',label:'Loan with option',value:preferenceValue(preferences.loan_option)},
                          {key:'assigned_user_ids',label:'Assign users',value:preferenceValue(preferences.assigned_user_ids)},
                        ]:[]),
                      ]}
                    />
                  </div>
                  {expanded ? <section id={panelId} className={styles.needDetail} aria-labelledby={toggleId} onKeyDown={event => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault(); event.stopPropagation(); setExpandedNeed({scope: basePath, id: ''}); document.getElementById(toggleId)?.focus();
                  }}>
                    <div className={styles.needBrief}>
                    {clubHref?<Link className={styles.needSearch} href={clubHref} prefetch={false}>Open club profile<ChevronRight size={16}/></Link>:null}
                    {facts.length ? <section className={styles.needBriefGroup}><h3>Football requirements</h3><dl className={styles.needFacts}>{facts.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section> : null}
                    {financialFacts.length?<section className={styles.needBriefGroup}><h3>Budget & contract</h3><dl className={styles.needFacts}>{financialFacts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={styles.needCoverage}>Request budgets only, not agreed earnings or agency revenue. No currency or tax conversion is applied.</p></section>:null}
                    {sourceFacts.length?<section className={styles.needBriefGroup}><h3>Source & priority</h3><dl className={styles.needFacts}>{sourceFacts.map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{item.need?.source_context?<p className={styles.needNotes}>{item.need.source_context}</p>:null}{item.need?.source_person_name&&item.need?.source_person_id?<a href={`${basePath}?view=network&person=${encodeURIComponent(item.need.source_person_id)}`} className={styles.needSearch}>Open source contact<ChevronRight size={16}/></a>:null}</section>:null}
                    {item.need?.profile_notes ? <p className={styles.needNotes}>{item.need.profile_notes}</p> : null}
                    {item.need?.raw_request?<details className={styles.needSource}><summary>Original request</summary><p className={styles.needNotes}>{item.need.raw_request}</p></details>:null}
                    {needConnected.has(needId) ? <details className={styles.needSource}><summary>Source conversation</summary><ConnectedOpportunityContext context={needConnected.get(needId)}/></details> : null}
                    </div>
                    <div className={styles.needWork}>
                    <div className={styles.needCandidates}>
                      <h3>Recorded player opportunities</h3>
                      <p className={styles.needCoverage}>Shortlist privately. Open a player opportunity to review the pitch.</p>
                      {shortlistError?<p role="alert" className={styles.shortlistError}>{shortlistError}</p>:null}
                      {shortlistNotice?<p role="status" className={styles.shortlistNotice}>{shortlistNotice}</p>:null}
                      {candidates.length ? <>
                        {typeof item.candidate_coverage?.recorded_candidates === 'number' && item.candidate_coverage.recorded_candidates > candidates.length ? <p className={styles.needCoverage}>Showing {candidates.length} of {item.candidate_coverage.recorded_candidates} recorded candidates.</p> : null}
                        <ul>{candidates.map((candidate: any, index: number) => {
                          const name = candidate.player_name || 'Player';
                          const canOpen = needOpen && typeof candidate.player_match_id === 'string' && Boolean(candidate.player_match_id.trim());
                          const matchId=String(candidate.player_match_id||'');
                          const currentStatus=shortlistStates[matchId]||String(candidate.match_status||'');
                          const canShortlist=needOpen && String(item.need?.status)==='active' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(matchId) && ['suggested','reviewing','shortlisted'].includes(currentStatus);
                          const isShortlisted=currentStatus==='shortlisted';
                          const summary = <>
                            <span>
                              <strong>{name}</strong>
                              {candidate.salary_check?.version===1?<span className={styles.salaryCheck} data-conflict={candidate.salary_check.state==='minimum_above_budget'||candidate.salary_check.state==='target_above_budget'||undefined}>
                                <strong>{candidate.salary_check.message}</strong>
                                {candidate.salary_gate?<small>{candidate.salary_gate.review_active?`Exploration review active${candidate.salary_gate.review_until?` until ${candidate.salary_gate.review_until}`:''}`:candidate.salary_gate.can_proceed?'Confirmed base-salary check passes':'Salary review required before a new pitch or deal'}</small>:null}
                                {candidate.salary_check.player_minimum!==null&&candidate.salary_check.player_minimum!==undefined?<small>Minimum: {salaryFigure(candidate.salary_check.player_minimum,candidate.salary_check.player_currency,candidate.salary_check.player_period,candidate.salary_check.player_tax_basis)}</small>:null}
                                {candidate.salary_check.player_target!==null&&candidate.salary_check.player_target!==undefined?<small>Target: {salaryFigure(candidate.salary_check.player_target,candidate.salary_check.player_currency,candidate.salary_check.player_period,candidate.salary_check.player_tax_basis)}</small>:null}
                                <small>Club budget: {salaryFigure(candidate.salary_check.club_budget,candidate.salary_check.club_currency,candidate.salary_check.club_period,candidate.salary_check.club_tax_basis)}</small>
                                {candidate.salary_check.needs_source_confirmation?<small>Source needs confirmation.</small>:null}{candidate.salary_check.checked_on?<small>Checked {candidate.salary_check.checked_on}</small>:null}
                              </span>:<small>Salary comparison not available. Review terms before presenting this player.</small>}
                              {isShortlisted?<small className={styles.shortlistStatus}>Shortlisted · internal only</small>:null}
                              <small>{candidate.salary_gate?'Career: ':''}{candidate.career_gate_state || currentStatus ? careerGateLabel(candidate.career_gate_state || currentStatus) : 'Recorded opportunity'}</small>
                              {candidate.career_gate_reason ? <span>{candidate.career_gate_reason}</span> : null}
                              {needOpen && !canOpen ? <small>Opportunity link unavailable</small> : null}
                            </span>
                            {canOpen ? <ChevronRight size={18}/> : null}
                          </>;
                          return <li key={typeof candidate.player_match_id === 'string' ? candidate.player_match_id : index}>
                            {canOpen ? <button type="button" className={styles.needCandidate} aria-label={`Open opportunity for ${name}`} onClick={() => openNeedRoute(item, candidate)}>{summary}</button> : <div className={styles.needCandidate}>{summary}</div>}
                            {canShortlist?<div className={styles.shortlistActions}>
                              <button type="button" className={isShortlisted?styles.shortlistRemove:styles.shortlistAdd}
                                aria-label={isShortlisted?'Remove '+name+' from shortlist':'Shortlist '+name}
                                disabled={Boolean(shortlistBusy)} onClick={()=>void changeShortlist(matchId,name,isShortlisted?'remove':'shortlist')}>
                                {shortlistBusy===matchId?'Saving…':isShortlisted?'Remove shortlist':'Shortlist player'}
                              </button>
                            </div>:null}
                          </li>;
                        })}</ul>
                      </> : <p className={styles.needCoverage}>{item.candidate_coverage?.recorded_candidates === 0 ? 'No candidates recorded yet.' : 'No player opportunities are shown for this need.'}</p>}
                    </div>
                    {needOpen ? <button type="button" data-ui-button="secondary" className={styles.needSearch} onClick={() => prepareSearch(item)}>Start search<ChevronRight size={16}/></button> : <p className={styles.needCoverage}>{statusLabel}. Review this need before starting new work.</p>}
                    {marketInvoke ? <ClubPitchHistory scope="request" scopeId={needId} basePath={basePath} invoke={marketInvoke} refreshKey={recordRefreshKey}
                      onReview={needOpen ? pitch => {
                        const candidate = candidates.find((item: any) => item.player_match_id === pitch.player_match_id && item.player_id === pitch.player_id);
                        if (candidate) return () => openNeedRoute(item, candidate);
                      } : undefined}/> : null}
                    </div>
                  </section> : null}
                </article>
              );
            })
          : null}

        {view === 'routes'
          ? filteredRoutes.map((item: any) => {
              const accessMode =
                item.access_strategy?.recommended_mode ||
                item.best_access_route?.route_state ||
                'access_not_recorded';

              const nextAction =
                item.career_strategy_gate?.next_action
                  ?.instruction ||
                item.best_access_route?.why_this_route ||
                'Review this opportunity.';

              return (
                <article
                  className={styles.row}
                  key={item.player_match_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRoute(item)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openRoute(item);
                  }}
                >
                  <div className={styles.icon}>
                    <Users size={16} />
                  </div>

                  <div className={styles.copy}>
                    <span className={styles.rowEyebrow}>Player opportunity</span>
                    <strong>
                      {item.player?.name || 'Player'} →{' '}
                      {item.club?.name || 'Club'}
                    </strong>
                    <span>{nextAction}</span>
                    <small>
                      {careerGateLabel(
                        item.career_strategy_gate?.state,
                      )}
                      {' · '}
                      {item.best_access_route?.person_name ||
                        human(accessMode)}
                    </small>

                    <ConnectedOpportunityContext
                      context={routeConnected.get(
                        String(item.player_match_id),
                      )}
                    />
                  </div>

                  <button
                    type="button"
                    data-ui-button="nav"
              className={styles.action}
                    onClick={(event) => {
                      event.stopPropagation();
                      openRoute(item);
                    }}
                  >
                    Open opportunity
                    <ChevronRight size={18} />
                  </button>
                </article>
              );
            })
          : null}

        {view === 'deals'
          ? filteredDeals.map((deal: any) => {
              const controlInstruction =
                deal.next_control_fix?.instruction || '';

              const nextMove =
                controlInstruction ||
                deal.next_best_move?.instruction ||
                deal.next_decision ||
                'Review the deal.';

              const hasExpectedCommission =
                deal.expected_commission !== null &&
                deal.expected_commission !== undefined &&
                deal.expected_commission !== '' &&
                Number.isFinite(
                  Number(deal.expected_commission),
                );

              const commissionValue =
                hasExpectedCommission && deal.currency
                  ? money(
                      deal.expected_commission,
                      deal.currency,
                    )
                  : 'Commission not set';

              return (
                <article
                  className={styles.row}
                  key={deal.deal_room_id}
                  id={`opportunity-${deal.deal_room_id}`}
                  data-search-match={requestedRecord===String(deal.deal_room_id)||undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDeal(deal)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openDeal(deal);
                  }}
                >
                  <div className={styles.icon}>
                    <BriefcaseBusiness size={16} />
                  </div>

                  <div className={styles.copy}>
                    <span className={styles.rowEyebrow}>Live deal</span>
                    <strong>
                      {deal.title || 'Live deal'}
                    </strong>
                    <span>{nextMove}</span>
                    <small>
                      {human(deal.stage || 'recorded')}
                      {' · '}
                      {deal.organisation || 'Club'}
                      {' · '}
                      {commissionValue}
                    </small>

                    <ConnectedOpportunityContext
                      context={dealConnected.get(
                        String(deal.deal_room_id),
                      )}
                    />
                  </div>

                  <div className={styles.rowActions}>
                    <EntityActionsMenu
                      kind="deal_room"
                      entityId={String(deal.deal_room_id)}
                      label={deal.title || 'Live deal'}
                      rpc={rpc}
                      onChanged={refreshEntities}
                      fields={[
                        { key: 'title', label: 'Deal title', value: deal.title },
                        { key: 'next_action_text', label: 'Next action', value: deal.next_action_text || deal.next_decision || '', type: 'textarea' },
                      ]}
                    />
                    <button
                      type="button"
                      data-ui-button="nav"
                      className={
                        controlInstruction
                          ? styles.actionAttention
                          : styles.action
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeal(deal);
                      }}
                    >
                      {controlInstruction
                        ? /owner|ownership/i.test(
                            controlInstruction,
                          )
                          ? 'Assign owner'
                          : 'Fix now'
                        : 'Open deal'}
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </article>
              );
            })
          : null}

        {readState !== 'ready' ? (
          <div className={styles.empty} role="status">
            <strong>{readState === 'error' ? 'Could not update' : 'Loading...'}</strong>
            <span>{readState === 'error' ? 'Try again.' : 'Checking...'}</span>
            {readState === 'error' && onRetry ? <button type="button" className={styles.tab} onClick={onRetry}>Try again</button> : null}
          </div>
        ) : null}

        {!activeItems.length && readState === 'ready' ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              {view === 'needs' ? (
                <Target size={22} />
              ) : view === 'routes' ? (
                <Users size={22} />
              ) : (
                <BriefcaseBusiness size={22} />
              )}
            </div>
            <strong>
              {search
                ? 'No matches'
                : view === 'needs'
                  ? 'No active club needs'
                  : view === 'routes'
                    ? 'No player opportunities yet'
                    : 'No live deals'}
            </strong>
            <span>
              {search
                ? 'Try another search.'
                : view === 'needs'
                  ? 'Add a club need to get started.'
                  : view === 'routes'
                    ? 'Linked players will appear here.'
                    : 'Live deals will appear here.'}
            </span>
          </div>
        ) : null}
      </section> : null}
    </div>
  );
}
