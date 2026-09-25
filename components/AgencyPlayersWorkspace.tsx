'use client';

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Target,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import { publicFile } from '@/lib/supabase';
import styles from './AgencyPlayersWorkspace.module.css';

type Invoke = <T,>(
  action: string,
  body?: Record<string, unknown>,
) => Promise<T>;

type Props = {
  data: any;
  invoke: Invoke;
  onRefresh: () => Promise<void>;
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
  if (!raw) return 'Birthday not recorded';
  const dob = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return 'Birthday not recorded';
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
  playerId,
  invoke,
  onClose,
  onOpenAction,
}: {
  playerId: string;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (request: AgencyActionRequest) => void;
}) {
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    let active = true;
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
  }, [invoke, playerId]);

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
      label: control?.instruction ? 'Fix this' : 'Prepare next move',
      action: control?.instruction
        ? 'player_control_fix_prepare'
        : 'player_service_move_prepare',
      payload: { player_id: playerId },
      facts: [
        { label: 'Player status', value: human(service?.service_control?.state || 'Recorded') },
        { label: 'Next move', value: nextMove?.instruction || identity.next_action || 'Not recorded' },
        { label: 'Contract timing', value: identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'No expiry recorded' },
        { label: 'Market activity', value: human(service?.market_coverage?.state || 'Not recorded') },
      ],
      successCondition: control?.success_condition || nextMove?.success_condition ||
        'The recorded player action is completed and the next step is current.',
    });
  };

  return (
    <div className={styles.backdrop} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true">
        <div className={styles.drawerTop}>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {busy ? (
          <div className={styles.drawerState}>
            <LoaderCircle size={20} className={styles.spin} />
            <div><strong>Opening player</strong><span>Loading the current agency record.</span></div>
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
              <Avatar name={playerName} path={identity.profile_photo_path} large />
              <div className={styles.playerHeroCopy}>
                <p>PLAYER</p>
                <h2>{playerName}</h2>
                <span>
                  {[identity.primary_position, identity.current_club, identity.current_country]
                    .filter(Boolean).join(' · ') || 'Football details not fully recorded'}
                </span>
              </div>
              <div className={styles.heroActions}>
                {profile.published && profile.public_slug ? (
                  <a className={styles.secondaryButton}
                    href={`/p/${encodeURIComponent(String(profile.public_slug))}`}
                    target="_blank" rel="noreferrer">
                    <UserRound size={14} /> Player Profile
                  </a>
                ) : <span className={styles.profileStatus}>Player Profile not published</span>}
                {(service?.next_control_fix?.instruction || service?.next_service_move?.instruction) ? (
                  <button type="button" className={styles.primaryButton} onClick={openAction}>
                    <ArrowRight size={14} /> Next action
                  </button>
                ) : null}
              </div>
            </header>

            <nav className={styles.playerTabs}>
              {['overview','opportunities','career','contracts','activity','files'].map((key) => (
                <button type="button" key={key}
                  className={tab === key ? styles.playerTabActive : styles.playerTab}
                  onClick={() => setTab(key)}>
                  {human(key)}
                </button>
              ))}
            </nav>

            <div className={styles.drawerBody}>
              {tab === 'overview' ? (
                <div className={styles.detailStack}>
                  <section className={styles.detailHero}>
                    <p>NEXT CAREER DECISION</p>
                    <h3>{service?.next_service_move?.instruction || identity.next_action || 'No next action recorded'}</h3>
                    <span>{identity.next_action_due ? relativeDate(identity.next_action_due) : 'No due date recorded'}</span>
                  </section>
                  <div className={styles.factGrid}>
                    <div><span>Birthday</span><strong>{nextBirthday(identity.date_of_birth)}</strong><small>{identity.date_of_birth || 'Date not recorded'}</small></div>
                    <div><span>Playing contract</span><strong>{identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'Not recorded'}</strong><small>{human(identity.contract_status || 'Status not recorded')}</small></div>
                    <div><span>Agency agreement</span><strong>{representation?.end_date ? relativeDate(representation.end_date) : representation ? 'No end date recorded' : 'Not recorded'}</strong><small>{representation ? human(representation.agreement_type) : 'Representation agreement not recorded'}</small></div>
                    <div><span>Opportunities</span><strong>{opportunities.filter((item: any) => !['won','lost','paused'].includes(String(item?.stage || ''))).length + deals.filter((deal: any) => deal?.status === 'active').length}</strong><small>Active recorded routes</small></div>
                  </div>
                </div>
              ) : null}

              {tab === 'opportunities' ? (
                <section className={styles.detailSection}>
                  <p>OPPORTUNITIES</p>
                  <h3>Current club situations</h3>
                  <div className={styles.rows}>
                    {[...opportunities, ...deals].map((item: any) => (
                      <article className={styles.row} key={`${item.id}:${item.stage}`}>
                        <div><strong>{item.club_name || item.title || 'Opportunity'}</strong>
                          <span>{item.summary || item.next_action || item.primary_blocker || 'Recorded opportunity'}</span>
                          <small>{human(item.stage || item.status || 'Recorded')}</small></div>
                      </article>
                    ))}
                    {!opportunities.length && !deals.length ? (
                      <Empty icon={Target} title="No active opportunities recorded"
                        copy="Player-club routes and live deals will appear here when they are created." />
                    ) : null}
                  </div>
                </section>
              ) : null}

              {tab === 'career' ? (
                <section className={styles.detailSection}>
                  <p>CAREER PLAN</p>
                  <h3>{career?.strategy?.objective || 'No career objective recorded'}</h3>
                  <span className={styles.sectionCopy}>{career?.next_strategy_action?.instruction || 'No career-plan action recorded'}</span>
                  {career?.next_strategy_action?.instruction ? (
                    <button type="button" className={styles.primaryButton} onClick={() =>
                      onOpenAction({
                        key: `career:${playerId}`,
                        eyebrow: 'CAREER PLAN',
                        title: playerName,
                        instruction: career.next_strategy_action.instruction,
                        label: 'Review career plan',
                        action: 'career_strategy_action_prepare',
                        payload: { player_id: playerId },
                        successCondition: 'The player-owned career plan is current and usable for market decisions.',
                      })
                    }><Target size={14} /> Review career plan</button>
                  ) : null}
                </section>
              ) : null}

              {tab === 'contracts' ? (
                <div className={styles.detailStack}>
                  <section className={styles.detailSection}>
                    <p>PLAYING CONTRACT</p>
                    <h3>{identity.current_club || 'Current club not recorded'}</h3>
                    <div className={styles.factGrid}>
                      <div><span>Status</span><strong>{human(identity.contract_status || 'Not recorded')}</strong></div>
                      <div><span>Expiry</span><strong>{identity.contract_expiry ? relativeDate(identity.contract_expiry) : 'Not recorded'}</strong></div>
                    </div>
                  </section>
                  <section className={styles.detailSection}>
                    <p>AGENCY AGREEMENTS</p>
                    <h3>Representation records</h3>
                    <div className={styles.rows}>
                      {agreements.map((item: any) => (
                        <article className={styles.row} key={item.id}>
                          <div><strong>{item.title || human(item.agreement_type || 'Agreement')}</strong>
                            <span>{human(item.status || 'Recorded')}</span>
                            <small>{item.end_date ? `Ends ${relativeDate(item.end_date)}` : 'No end date recorded'}</small></div>
                        </article>
                      ))}
                      {!agreements.length ? (
                        <Empty icon={ShieldCheck} title="Representation agreement not recorded"
                          copy="This means no active agreement record is stored here. It is not a legal conclusion about representation authority." />
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : null}

              {tab === 'activity' ? (
                <section className={styles.detailSection}>
                  <p>ACTIVITY</p><h3>Recorded agency activity</h3>
                  <div className={styles.rows}>
                    {activity.map((item: any, index: number) => (
                      <article className={styles.row} key={`${item.event_type}:${index}`}>
                        <div><strong>{human(item.event_type || 'Agency activity')}</strong>
                          <span>{item.occurred_at ? relativeDate(item.occurred_at) : 'Date not recorded'}</span></div>
                      </article>
                    ))}
                    {!activity.length ? <Empty icon={CalendarDays} title="No player activity recorded yet"
                      copy="Relevant agency events will appear here without exposing private event payloads." /> : null}
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
                          <small>{item.expires_at ? `Expires ${relativeDate(item.expires_at)}` : 'No expiry recorded'}</small></div>
                      </article>
                    ))}
                    {!documents.length ? <Empty icon={FileText} title="No player files recorded"
                      copy="File metadata appears here. Private storage paths are not exposed in this workspace." /> : null}
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
  data,
  invoke,
  onRefresh,
  onOpenAction,
}: Props) {
  const searchParams = useSearchParams();
  const [section, setSection] = useState<'players'|'recruitment'>(
    searchParams.get('tab') === 'recruitment' ? 'recruitment' : 'players',
  );
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [playerId, setPlayerId] = useState<string|null>(null);
  const [targetId, setTargetId] = useState<string|null>(null);
  const [targetDetail, setTargetDetail] = useState<any>(null);
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [interaction, setInteraction] = useState('');
  const [interactionChannel, setInteractionChannel] = useState('whatsapp');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    full_name:'',
    current_club:'',
    current_country:'',
    primary_position:'',
    contract_expiry:'',
    transfermarkt_url:'',
  });

  useEffect(() => {
    if (searchParams.get('tab') === 'recruitment') setSection('recruitment');
  }, [searchParams]);

  useEffect(() => {
    if (!targetId) {
      setTargetDetail(null);
      return;
    }
    setTargetBusy(true);
    setTargetError('');
    void invoke<any>('recruitment_target',{prospect_id:targetId})
      .then((response) => setTargetDetail(response?.recruitment || null))
      .catch((error) => setTargetError(friendlyError(error)))
      .finally(() => setTargetBusy(false));
  }, [invoke,targetId]);

  const players = Array.isArray(data?.directory?.items) ? data.directory.items : [];
  const targets = Array.isArray(data?.recruitment?.items) ? data.recruitment.items : [];
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
    const response:any=await invoke('recruitment_target',{prospect_id:targetId});
    setTargetDetail(response?.recruitment||null);
  };

  const changeStage=async()=>{
    const target=targetDetail?.target||{};
    const next=nextMajorStage(target.raw_stage);
    if (!next || !targetId) return;
    await invoke('recruitment_set_stage',{prospect_id:targetId,stage:next[0]});
    await Promise.all([refreshTarget(),onRefresh()]);
  };

  const logInteraction=async()=>{
    if (!targetId || !interaction.trim()) return;
    await invoke('recruitment_log_interaction',{
      prospect_id:targetId,
      channel:interactionChannel,
      direction:'outbound',
      summary:interaction.trim(),
    });
    setInteraction('');
    await Promise.all([refreshTarget(),onRefresh()]);
  };

  const promote=async()=>{
    if (!targetId) return;
    await invoke('recruitment_promote',{prospect_id:targetId});
    setTargetId(null);
    await onRefresh();
  };

  const createTarget=async()=>{
    if (!createForm.full_name.trim()) return;
    setCreateBusy(true);
    setCreateError('');
    try{
      await invoke('recruitment_create',{
        full_name:createForm.full_name.trim(),
        current_club:createForm.current_club.trim()||null,
        current_country:createForm.current_country.trim()||null,
        primary_position:createForm.primary_position.trim()||null,
        contract_expiry:createForm.contract_expiry||null,
        transfermarkt_url:createForm.transfermarkt_url.trim()||null,
        recruitment_priority:3,
      });
      setCreateForm({full_name:'',current_club:'',current_country:'',primary_position:'',contract_expiry:'',transfermarkt_url:''});
      setCreateOpen(false);
      await onRefresh();
    }catch(error){setCreateError(friendlyError(error));}
    finally{setCreateBusy(false);}
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.intro}>
        <div><p>PLAYERS</p><h2>Your players. Your next decisions.</h2>
          <span>Represented players and recruitment in one football-native workspace.</span></div>
        <div className={styles.sectionTabs}>
          <button type="button" className={section==='players'?styles.sectionTabActive:styles.sectionTab} onClick={()=>setSection('players')}>
            Our Players <b>{players.length}</b>
          </button>
          <button type="button" className={section==='recruitment'?styles.sectionTabActive:styles.sectionTab} onClick={()=>setSection('recruitment')}>
            Recruitment <b>{targets.length}</b>
          </button>
        </div>
      </section>

      <section className={styles.toolbar}>
        <label className={styles.search}><Search size={15}/><input value={search} onChange={(e)=>setSearch(e.target.value)}
          placeholder={section==='players'?'Search players':'Search recruitment'} /></label>
        {section==='recruitment'?(
          <button type="button" className={styles.primaryButton} onClick={()=>setCreateOpen(true)}><Plus size={14}/> Add target</button>
        ):null}
      </section>

      {section==='players'?(
        <section className={styles.playerGrid}>
          {filteredPlayers.map((item:any)=>{
            const identity=item?.identity||{};
            const service=item?.service||{};
            const name=identity.name||'Player';
            const age=ageFromDob(identity.date_of_birth);
            const attention=Boolean(service?.next_control_fix?.instruction||service?.next_service_move?.instruction);
            return(
              <article className={styles.playerCard} key={item.player_id}>
                <div className={styles.playerCardTop}>
                  <Avatar name={name} path={identity.profile_photo_path}/>
                  <div className={styles.playerIdentity}><h3>{name}</h3>
                    <span>{[identity.primary_position,identity.current_club].filter(Boolean).join(' · ')||'Football details not fully recorded'}</span>
                    <small>{[age!==null?`${age}`:null,Array.isArray(identity.nationalities)?identity.nationalities[0]:null].filter(Boolean).join(' · ')||'Age and nationality not fully recorded'}</small></div>
                  <span className={attention?styles.attentionPill:styles.calmPill}>{attention?'Needs action':'Current'}</span>
                </div>
                <div className={styles.playerFacts}>
                  <div><span>Next action</span><strong>{service?.next_service_move?.instruction||identity.next_action||'No next action recorded'}</strong><small>{identity.next_action_due?relativeDate(identity.next_action_due):'No due date recorded'}</small></div>
                  <div><span>Opportunities</span><strong>{Number(item.active_opportunities||0)}</strong><small>Active recorded routes</small></div>
                  <div><span>Playing contract</span><strong>{identity.contract_expiry?relativeDate(identity.contract_expiry):'Not recorded'}</strong><small>{human(identity.contract_status||'Status not recorded')}</small></div>
                  <div><span>Agency agreement</span><strong>{item?.representation?.recorded?(item.representation.end_date?relativeDate(item.representation.end_date):'No end date'):'Not recorded'}</strong><small>{item?.representation?.recorded?human(item.representation.agreement_type):'Representation agreement not recorded'}</small></div>
                </div>
                <div className={styles.playerCardActions}>
                  <button type="button" className={styles.secondaryButton} onClick={()=>setPlayerId(String(item.player_id))}><UserRound size={14}/> Open player</button>
                  {attention?(
                    <button type="button" className={styles.primaryButton} onClick={()=>{
                      const control=service?.next_control_fix;
                      const move=service?.next_service_move;
                      onOpenAction({
                        key:`player:${item.player_id}`,
                        eyebrow:'PLAYER',
                        title:name,
                        instruction:control?.instruction||move?.instruction,
                        label:control?.instruction?'Fix this':'Prepare next move',
                        action:control?.instruction?'player_control_fix_prepare':'player_service_move_prepare',
                        payload:{player_id:item.player_id},
                        facts:[
                          {label:'Player status',value:human(service.state||'Recorded')},
                          {label:'Next move',value:move?.instruction||identity.next_action||'Not recorded'},
                          {label:'Contract timing',value:identity.contract_expiry?relativeDate(identity.contract_expiry):'No expiry recorded'},
                          {label:'Market activity',value:human(service?.market_coverage?.state||'Not recorded')},
                        ],
                        successCondition:'The recorded player action is completed and the next step is current.',
                      });
                    }}><ArrowRight size={14}/>{service?.next_control_fix?.instruction?'Fix this':'Prepare next move'}</button>
                  ):null}
                </div>
              </article>
            );
          })}
          {!filteredPlayers.length?<Empty icon={Users} title="No players recorded yet" copy="Add the first represented player and their current position will appear here."/>:null}
        </section>
      ):(
        <div className={styles.recruitmentLayout}>
          <section className={styles.stageFilters}>
            <button type="button" className={stageFilter==='all'?styles.stageFilterActive:styles.stageFilter} onClick={()=>setStageFilter('all')}>All <span>{targets.length}</span></button>
            {PIPELINE.map(([key,label])=>(
              <button type="button" key={key} className={stageFilter===key?styles.stageFilterActive:styles.stageFilter} onClick={()=>setStageFilter(key)}>
                {label}<span>{stageCounts[key]||0}</span>
              </button>
            ))}
          </section>
          <section className={styles.recruitmentList}>
            {filteredTargets.map((item:any)=>(
              <button type="button" className={styles.recruitmentRow} key={item.id} onClick={()=>setTargetId(String(item.id))}>
                <div className={styles.recruitmentMark}>{initials(item.full_name||'')||'P'}</div>
                <div className={styles.recruitmentCopy}><div className={styles.recruitmentTitle}><strong>{item.full_name}</strong>{item.follow_up_overdue?<span className={styles.overduePill}>Follow-up overdue</span>:null}</div>
                  <span>{[item.primary_position,item.current_club,item.current_country].filter(Boolean).join(' · ')||'Player details not fully recorded'}</span>
                  <small>{item.last_interaction?.summary||(item.next_action_at?`Next follow-up ${relativeDate(item.next_action_at)}`:'No next follow-up recorded')}</small></div>
                <div className={styles.recruitmentStage}><span>{PIPELINE.find(([key])=>key===item.ui_stage)?.[1]||human(item.ui_stage)}</span><ChevronRight size={15}/></div>
              </button>
            ))}
            {!filteredTargets.length?<Empty icon={Target} title="No recruitment targets here" copy="Add a target or change the stage filter to see the current recruitment pipeline."/>:null}
          </section>
        </div>
      )}

      {playerId?<PlayerDrawer playerId={playerId} invoke={invoke} onClose={()=>setPlayerId(null)} onOpenAction={onOpenAction}/>:null}

      {targetId?(
        <div className={styles.backdrop} onClick={(e)=>{if(e.target===e.currentTarget)setTargetId(null);}}>
          <aside className={styles.drawer} role="dialog" aria-modal="true">
            <div className={styles.drawerTop}><button type="button" className={styles.closeButton} onClick={()=>setTargetId(null)}><X size={18}/></button></div>
            {targetBusy?<div className={styles.drawerState}><LoaderCircle size={20} className={styles.spin}/><div><strong>Opening recruitment target</strong><span>Loading the recorded relationship.</span></div></div>:null}
            {targetError?<div className={styles.drawerState}><CircleAlert size={19}/><div><strong>Recruitment target unavailable</strong><span>{targetError}</span></div></div>:null}
            {!targetBusy&&targetDetail?(
              <div className={styles.drawerBody}>
                <header className={styles.recruitHero}><div className={styles.recruitmentMark}>{initials(targetDetail.target?.full_name||'')||'P'}</div>
                  <div><p>RECRUITMENT</p><h2>{targetDetail.target?.full_name}</h2><span>{[targetDetail.target?.primary_position,targetDetail.target?.current_club,targetDetail.target?.current_country].filter(Boolean).join(' · ')||'Player details not fully recorded'}</span></div></header>
                <section className={styles.detailSection}><p>CURRENT STAGE</p><h3>{PIPELINE.find(([key])=>key===targetDetail.target?.ui_stage)?.[1]||human(targetDetail.target?.ui_stage)}</h3>
                  <span className={styles.sectionCopy}>{targetDetail.target?.next_action_at?`Next follow-up ${relativeDate(targetDetail.target.next_action_at)}`:'No next follow-up recorded'}</span>
                  <div className={styles.actionRow}>
                    {nextMajorStage(targetDetail.target?.raw_stage)?(
                      <button type="button" className={styles.primaryButton} onClick={()=>void changeStage()}>
                        <ArrowRight size={14}/> Move to {nextMajorStage(targetDetail.target?.raw_stage)?.[1]}
                      </button>
                    ):null}
                    {targetDetail.target?.raw_stage==='signed'?(
                      <button type="button" className={styles.primaryButton} onClick={()=>void promote()}><Users size={14}/> Add to Our Players</button>
                    ):null}
                  </div>
                </section>
                <section className={styles.detailSection}><p>CONTACT</p><h3>Log what happened</h3>
                  <div className={styles.interactionForm}>
                    <select value={interactionChannel} onChange={(e)=>setInteractionChannel(e.target.value)}>
                      <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="other">Other</option>
                    </select>
                    <textarea rows={3} value={interaction} onChange={(e)=>setInteraction(e.target.value)} placeholder="Short factual note"/>
                    <button type="button" className={styles.primaryButton} disabled={!interaction.trim()} onClick={()=>void logInteraction()}><CheckCircle2 size={14}/> Save interaction</button>
                  </div>
                </section>
                <section className={styles.detailSection}><p>HISTORY</p><h3>Recruitment interactions</h3>
                  <div className={styles.rows}>
                    {(targetDetail.interactions||[]).map((item:any)=>(
                      <article className={styles.row} key={item.id}><div><strong>{human(item.channel)} · {human(item.direction)}</strong><span>{item.summary}</span><small>{relativeDate(item.occurred_at)}</small></div></article>
                    ))}
                    {!(targetDetail.interactions||[]).length?<Empty icon={UserRound} title="No recruitment interaction recorded" copy="Log the first real conversation here. Contact timestamps are never invented."/>:null}
                  </div>
                </section>
              </div>
            ):null}
          </aside>
        </div>
      ):null}

      {createOpen?(
        <div className={styles.modalBackdrop} onClick={(e)=>{if(e.target===e.currentTarget)setCreateOpen(false);}}>
          <section className={styles.createModal} role="dialog" aria-modal="true">
            <div className={styles.modalHead}><div><p>RECRUITMENT</p><h3>Add target</h3><span>Start with the facts you know. The record can improve later.</span></div>
              <button type="button" className={styles.closeButton} onClick={()=>setCreateOpen(false)}><X size={17}/></button></div>
            {createError?<div className={styles.inlineError}><CircleAlert size={16}/><span>{createError}</span></div>:null}
            <div className={styles.formGrid}>
              <label className={styles.formWide}><span>Player name</span><input value={createForm.full_name} onChange={(e)=>setCreateForm({...createForm,full_name:e.target.value})}/></label>
              <label><span>Current club</span><input value={createForm.current_club} onChange={(e)=>setCreateForm({...createForm,current_club:e.target.value})}/></label>
              <label><span>Position</span><input value={createForm.primary_position} onChange={(e)=>setCreateForm({...createForm,primary_position:e.target.value})}/></label>
              <label><span>Country</span><input value={createForm.current_country} onChange={(e)=>setCreateForm({...createForm,current_country:e.target.value})}/></label>
              <label><span>Contract expiry</span><input type="date" value={createForm.contract_expiry} onChange={(e)=>setCreateForm({...createForm,contract_expiry:e.target.value})}/></label>
              <label className={styles.formWide}><span>Transfermarkt</span><input value={createForm.transfermarkt_url} onChange={(e)=>setCreateForm({...createForm,transfermarkt_url:e.target.value})}/></label>
            </div>
            <div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={()=>setCreateOpen(false)}>Cancel</button>
              <button type="button" className={styles.primaryButton} disabled={createBusy||!createForm.full_name.trim()} onClick={()=>void createTarget()}>
                {createBusy?<LoaderCircle size={14} className={styles.spin}/>:<Plus size={14}/>} Add target
              </button></div>
          </section>
        </div>
      ):null}
    </div>
  );
}
