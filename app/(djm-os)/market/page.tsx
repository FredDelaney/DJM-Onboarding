'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  UsersRound,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { djmRpc, friendlyError } from '@/lib/djm-os';

const EMPTY_ADVANCED = {
  title: '', position: '', preferred_foot: '', min_age: '', max_age: '', transfer_type: '',
  transfer_budget: '', salary_budget: '', currency: 'EUR', salary_period: 'year', profile_notes: '', registration_notes: '',
};

export default function MarketPage() {
  const [needs, setNeeds] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [candidates, setCandidates] = useState<any>({ signed_players: [], recruitment_targets: [] });
  const [candidateTab, setCandidateTab] = useState<'signed' | 'recruitment'>('signed');
  const [showAdd, setShowAdd] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [clubId, setClubId] = useState('');
  const [requestText, setRequestText] = useState('');
  const [advancedForm, setAdvancedForm] = useState<any>(EMPTY_ADVANCED);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData, dealData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 250 }),
        djmRpc<any[]>('djm_deal_rooms', { p_status: 'active' }),
      ]);
      setNeeds(needData || []);
      setClubs((clubData || []).filter((x: any) => x.organisation_type === 'club'));
      setDeals(dealData || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeNeeds = useMemo(() => needs.filter((n) => ['active','open','confirmed'].includes(n.need_status)), [needs]);

  const openNeed = async (need: any) => {
    setSelectedNeed(need);
    setEditing(false);
    setEditForm(toEditForm(need));
    setError('');
    try {
      const data: any = await djmRpc('djm_market_candidates', { p_need_id: need.id });
      setCandidates(data || { signed_players: [], recruitment_targets: [] });
      const signedCount = Number(data?.signed_players?.length || 0);
      const recruitmentCount = Number(data?.recruitment_targets?.length || 0);
      setCandidateTab(signedCount > 0 || recruitmentCount === 0 ? 'signed' : 'recruitment');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const quickCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!clubId || !requestText.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result: any = await djmRpc('djm_market_create_need_from_text', {
        p_organisation_id: clubId,
        p_text: requestText.trim(),
        p_source_person_id: null,
      });
      const parsed = result?.parsed || {};
      setMessage(`Club need created: ${[parsed.position, parsed.preferred_foot && `${parsed.preferred_foot} foot`, parsed.max_age && `max age ${parsed.max_age}`, parsed.transfer_type].filter(Boolean).join(' · ')}. Matching ran automatically.`);
      setClubId(''); setRequestText(''); setShowAdd(false);
      await load();
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const advancedCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!clubId || !advancedForm.position.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await djmRpc('djm_market_create_need', {
        p_organisation_id: clubId,
        p_title: advancedForm.title.trim() || `${advancedForm.position.trim()} requirement`,
        p_position: advancedForm.position.trim(), p_source_person_id: null,
        p_preferred_foot: advancedForm.preferred_foot || null,
        p_min_age: numOrNull(advancedForm.min_age), p_max_age: numOrNull(advancedForm.max_age),
        p_transfer_type: advancedForm.transfer_type || null,
        p_transfer_budget: numOrNull(advancedForm.transfer_budget), p_salary_budget: numOrNull(advancedForm.salary_budget),
        p_currency: advancedForm.currency || null, p_salary_period: advancedForm.salary_period || null,
        p_profile_notes: advancedForm.profile_notes.trim() || null, p_registration_notes: advancedForm.registration_notes.trim() || null,
        p_expires_at: null,
      });
      setAdvancedForm(EMPTY_ADVANCED); setClubId(''); setShowAdd(false); setAdvanced(false);
      setMessage('Club need added manually. Matching ran automatically.');
      await load();
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const saveNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedNeed || !editForm?.position?.trim()) return;
    setBusy(true); setError('');
    try {
      await djmRpc('djm_market_update_need', {
        p_need_id: selectedNeed.id,
        p_title: editForm.title.trim(), p_position: editForm.position.trim(), p_preferred_foot: editForm.preferred_foot || null,
        p_min_age: numOrNull(editForm.min_age), p_max_age: numOrNull(editForm.max_age), p_transfer_type: editForm.transfer_type || null,
        p_transfer_budget: numOrNull(editForm.transfer_budget), p_salary_budget: numOrNull(editForm.salary_budget),
        p_currency: editForm.currency || null, p_salary_period: editForm.salary_period || null,
        p_profile_notes: editForm.profile_notes.trim() || null, p_registration_notes: editForm.registration_notes.trim() || null,
        p_expires_at: selectedNeed.expires_at || null,
      });
      setEditing(false); await load();
      const refreshed = (await djmRpc<any[]>('djm_market_needs', { p_status: null })).find((n) => n.id === selectedNeed.id);
      if (refreshed) await openNeed(refreshed);
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const setNeedStatus = async (status: string) => {
    if (!selectedNeed) return;
    try {
      await djmRpc('djm_market_set_need_status', { p_need_id: selectedNeed.id, p_status: status });
      setSelectedNeed(null); setCandidates({ signed_players: [], recruitment_targets: [] }); await load();
    } catch (e) { setError(friendlyError(e)); }
  };

  const deleteNeed = async () => {
    if (!selectedNeed) return;
    try {
      const impact: any = await djmRpc('djm_delete_preview', { p_entity_type: 'club_need', p_entity_id: selectedNeed.id });
      if (!window.confirm(`Permanently delete this club need? This removes ${impact?.matches || 0} matches and ${impact?.deals || 0} linked Deal Rooms. Use Close if the request was real but is no longer live.`)) return;
      await djmRpc('djm_delete_entity', { p_entity_type: 'club_need', p_entity_id: selectedNeed.id, p_confirm: true });
      setSelectedNeed(null); setCandidates({ signed_players: [], recruitment_targets: [] }); await load();
    } catch (e) { setError(friendlyError(e)); }
  };

  const openDealRoom = async (candidate: any) => {
    if (!selectedNeed) return;
    try {
      const prob: any = await djmRpc('djm_market_deal_probability', {
        p_need_id: selectedNeed.id,
        p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
      });
      const playerName = candidate.player_name || candidate.full_name || 'Player';
      const probability = Math.max(10, Math.min(90, Number(prob?.probability || 35) - (candidateTab === 'recruitment' ? 10 : 0)));
      const result: any = await djmRpc('djm_deal_room_upsert', {
        p_id: null, p_title: `${playerName} → ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id, p_source_person_id: null,
        p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
        p_club_need_id: selectedNeed.id, p_stage: 'qualifying', p_expected_commission: null, p_currency: selectedNeed.currency || 'EUR',
        p_probability: probability, p_primary_blocker: null, p_next_decision: 'Confirm genuine club interest and commercial fit', p_next_action_at: null, p_source: 'market_match',
      });
      await load();
      if (result?.deal_room_id) window.location.href = `/market/deals/${result.deal_room_id}`;
    } catch (e) { setError(friendlyError(e)); }
  };

  const currentCandidates = candidateTab === 'signed' ? candidates.signed_players || [] : candidates.recruitment_targets || [];

  return (
    <DjmOsShell eyebrow="Club demand matched automatically to DJM players" title="Market">
      {error ? <div className="djm-os-error"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div> : null}
      {message ? <div className="djm-os-capture-status" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="djm-os-metrics">
        <Metric label="Live needs" value={activeNeeds.length} />
        <Metric label="Needs without signed match" value={activeNeeds.filter((n) => Number(n.match_count || 0) === 0).length} attention={activeNeeds.some((n) => Number(n.match_count || 0) === 0)} />
        <Metric label="Best signed fit" value={`${Math.round(Math.max(0, ...activeNeeds.map((n) => Number(n.top_match_score || 0))))}%`} />
        <Metric label="Deal Rooms" value={deals.length} />
      </section>

      <div className="djm-os-toolbar">
        <div style={{ flex: 1 }}><strong>Type the request like you received it</strong><span className="djm-os-toolbar-note">DJM extracts the position/profile and runs matching automatically. Advanced fields stay available as fallback.</span></div>
        <div className="djm-os-button-row"><button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/>Refresh</button><button className="djm-os-primary-button" onClick={() => setShowAdd((x) => !x)}><Plus size={16}/>Add club need</button></div>
      </div>

      {showAdd ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head"><div><h2>{advanced ? 'Advanced manual need' : 'New club request'}</h2><p>{advanced ? 'Only fill what matters. Everything remains editable later.' : 'Choose the club and paste/type the requirement.'}</p></div><Target size={20}/></div>
          {!advanced ? (
            <form className="djm-os-form" onSubmit={quickCreate}>
              <label>Club<select value={clubId} onChange={(e) => setClubId(e.target.value)}><option value="">Choose club</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.country ? ` · ${c.country}` : ''}</option>)}</select></label>
              <label>What does the club need?<textarea rows={5} value={requestText} onChange={(e) => setRequestText(e.target.value)} placeholder="e.g. RW left foot, max age 21, free or loan. Fast, direct, good numbers."/></label>
              <div className="djm-os-button-row"><button className="djm-os-primary-button" disabled={busy || !clubId || !requestText.trim()}>{busy ? 'Creating…' : 'Create & match players'}</button><button className="djm-os-secondary-button" type="button" onClick={() => setAdvanced(true)}>Advanced manual</button></div>
            </form>
          ) : (
            <form className="djm-os-form" onSubmit={advancedCreate}>
              <label>Club<select value={clubId} onChange={(e) => setClubId(e.target.value)}><option value="">Choose club</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <NeedFields form={advancedForm} setForm={setAdvancedForm}/>
              <div className="djm-os-button-row"><button className="djm-os-primary-button" disabled={busy || !clubId || !advancedForm.position.trim()}>Save & match</button><button className="djm-os-secondary-button" type="button" onClick={() => setAdvanced(false)}>Use simple input</button></div>
            </form>
          )}
        </section>
      ) : null}

      {deals.length ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head"><div><h2>Closest to revenue</h2><p>Only live player-club situations.</p></div><BriefcaseBusiness size={20}/></div>
          <div className="djm-os-list">{deals.slice(0,6).map((d) => <Link key={d.id} href={`/market/deals/${d.id}`} className="djm-os-list-row" style={{ textDecoration:'none', color:'inherit' }}><div style={{flex:1}}><strong>{d.title}</strong><p>{[d.organisation_name,d.stage].filter(Boolean).join(' · ')}</p><small>{d.probability}% probability{d.primary_blocker ? ` · ${d.primary_blocker}` : ''}</small></div><ArrowRight size={16}/></Link>)}</div>
        </section>
      ) : null}

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head"><div><h2>Live club demand</h2><p>Select a need to review/edit matches.</p></div></div>
          {activeNeeds.length ? <div className="djm-os-list">{activeNeeds.map((need) => <button key={need.id} className="djm-os-list-row" style={{ width:'100%', textAlign:'left', background:selectedNeed?.id===need.id ? 'rgba(244,196,48,.08)' : undefined }} onClick={() => void openNeed(need)}><div style={{flex:1}}><strong>{need.organisation_name}</strong><p>{[need.need_position,need.preferred_foot,need.transfer_type].filter(Boolean).join(' · ')}</p><small>{Number(need.match_count || 0)} signed-player matches</small></div><div className="djm-os-score"><b>{need.top_match_score == null ? '—' : Math.round(Number(need.top_match_score))}</b><small>best fit</small></div></button>)}</div> : <div className="djm-os-empty"><CheckCircle2 size={25}/><p>No live club needs.</p></div>}
        </section>

        <section className="djm-os-panel">
          {!selectedNeed ? <div className="djm-os-empty"><Target size={25}/><p>Select a club need to see matched players.</p></div> : (
            <>
              <div className="djm-os-panel-head"><div><h2>{selectedNeed.organisation_name} · {selectedNeed.need_position}</h2><p>{selectedNeed.profile_notes || 'No extra profile notes.'}</p></div><div className="djm-os-button-row"><button className="djm-os-icon-button" onClick={() => setEditing((x) => !x)} aria-label="Edit"><Pencil size={16}/></button><button className="djm-os-icon-button" onClick={() => setSelectedNeed(null)} aria-label="Close panel"><X size={16}/></button></div></div>
              {editing && editForm ? <form className="djm-os-form" onSubmit={saveNeed} style={{ borderBottom:'1px solid var(--djm-line)' }}><NeedFields form={editForm} setForm={setEditForm}/><button className="djm-os-primary-button" disabled={busy}>Save changes & rematch</button></form> : null}
              <div className="djm-os-button-row" style={{ padding:'12px 14px', borderBottom:'1px solid var(--djm-line)' }}><button className={candidateTab==='signed' ? 'djm-os-primary-button':'djm-os-secondary-button'} onClick={() => setCandidateTab('signed')}><UsersRound size={15}/>Signed players ({candidates.signed_players?.length || 0})</button><button className={candidateTab==='recruitment' ? 'djm-os-primary-button':'djm-os-secondary-button'} onClick={() => setCandidateTab('recruitment')}>Recruitment ({candidates.recruitment_targets?.length || 0})</button></div>
              {currentCandidates.length ? <div className="djm-os-list">{currentCandidates.slice(0,12).map((c:any) => { const name=c.player_name||c.full_name; const score=c.overall_score??c.match_score; return <article className="djm-os-list-row" key={c.player_id||c.prospect_id}><div style={{flex:1}}><strong>{name}</strong><p>{[c.player_position||c.primary_position,c.current_club,c.preferred_foot].filter(Boolean).join(' · ')}</p><small>{candidateTab==='signed' ? 'Signed player' : 'Unsigned recruitment target'}</small></div><div className="djm-os-score"><b>{score == null ? '—' : Math.round(Number(score))}</b><small>fit</small></div><button className="djm-os-secondary-button" onClick={() => void openDealRoom(c)}>Open deal</button></article>})}</div> : <div className="djm-os-empty"><Target size={25}/><p>No candidates in this player pool yet.</p></div>}
              <div className="djm-os-button-row" style={{ padding:14 }}><button className="djm-os-secondary-button" onClick={() => void setNeedStatus('closed')}>Close need</button><button className="djm-os-secondary-button" onClick={() => void deleteNeed()}>Delete</button></div>
            </>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function NeedFields({ form, setForm }: { form:any; setForm:(value:any)=>void }) {
  return <>
    <div className="djm-os-form-grid">
      <label>Position<input required value={form.position} onChange={(e)=>setForm({...form,position:e.target.value})} placeholder="RW, LCB, 6, striker"/></label>
      <label>Title<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="Optional"/></label>
      <label>Preferred foot<select value={form.preferred_foot} onChange={(e)=>setForm({...form,preferred_foot:e.target.value})}><option value="">Any</option><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Transfer type<select value={form.transfer_type} onChange={(e)=>setForm({...form,transfer_type:e.target.value})}><option value="">Any</option><option value="free">Free</option><option value="loan">Loan</option><option value="free_or_loan">Free or loan</option><option value="transfer">Transfer</option></select></label>
      <label>Min age<input type="number" value={form.min_age} onChange={(e)=>setForm({...form,min_age:e.target.value})}/></label>
      <label>Max age<input type="number" value={form.max_age} onChange={(e)=>setForm({...form,max_age:e.target.value})}/></label>
      <label>Transfer budget<input type="number" value={form.transfer_budget} onChange={(e)=>setForm({...form,transfer_budget:e.target.value})}/></label>
      <label>Salary budget<input type="number" value={form.salary_budget} onChange={(e)=>setForm({...form,salary_budget:e.target.value})}/></label>
      <label>Currency<input value={form.currency} onChange={(e)=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>
      <label>Salary period<select value={form.salary_period} onChange={(e)=>setForm({...form,salary_period:e.target.value})}><option value="year">Year</option><option value="month">Month</option><option value="week">Week</option></select></label>
    </div>
    <label>Player profile notes<textarea rows={3} value={form.profile_notes} onChange={(e)=>setForm({...form,profile_notes:e.target.value})}/></label>
    <label>Registration / passport notes<textarea rows={2} value={form.registration_notes} onChange={(e)=>setForm({...form,registration_notes:e.target.value})}/></label>
  </>;
}

function toEditForm(need:any) { return {
  title:need.title||'', position:need.need_position||'', preferred_foot:need.preferred_foot||'', min_age:need.min_age??'', max_age:need.max_age??'', transfer_type:need.transfer_type||'', transfer_budget:need.transfer_budget??'', salary_budget:need.salary_budget??'', currency:need.currency||'EUR', salary_period:need.salary_period||'year', profile_notes:need.profile_notes||'', registration_notes:need.registration_notes||'',
}; }
function numOrNull(value:any) { return value === '' || value == null ? null : Number(value); }
function Metric({label,value,attention=false}:{label:string;value:string|number;attention?:boolean}) { return <div className="djm-os-metric" style={attention ? {borderColor:'rgba(244,196,48,.7)',background:'rgba(244,196,48,.08)'}:undefined}><strong>{value}</strong><span>{label}</span></div>; }
