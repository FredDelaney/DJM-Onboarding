'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Target,
  UsersRound,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDate, djmRpc, friendlyError } from '@/lib/djm-os';
import { dealCredibility, matchAssessment } from '@/lib/intelligence';
import { extractMarketCommercialTerms } from '@/lib/market-demand';

const EMPTY_ADVANCED = {
  title: '', position: '', preferred_foot: '', min_age: '', max_age: '', transfer_type: '',
  transfer_budget: '', salary_budget: '', currency: 'EUR', salary_period: 'year', profile_notes: '', registration_notes: '',
};

export default function MarketPage() {
  const router = useRouter();
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
      const commercial = extractMarketCommercialTerms(requestText);
      const transferType = commercial.transferType || parsed.transfer_type || null;
      const currency = commercial.currency || parsed.currency || null;
      const minAge = commercial.minAge ?? parsed.min_age ?? null;
      const maxAge = commercial.maxAge ?? parsed.max_age ?? null;
      const hasCommercialDetail = commercial.transferBudget != null || commercial.salaryBudget != null || commercial.transferType != null || commercial.minAge != null || commercial.maxAge != null || commercial.registrationNotes != null;
      let commercialWarning = '';

      if (result?.need_id && hasCommercialDetail) {
        try {
          await djmRpc('djm_market_update_need', {
            p_need_id: result.need_id,
            p_title: `${parsed.position} requirement`,
            p_position: parsed.position,
            p_preferred_foot: parsed.preferred_foot || null,
            p_min_age: minAge,
            p_max_age: maxAge,
            p_transfer_type: transferType,
            p_transfer_budget: commercial.transferBudget,
            p_salary_budget: commercial.salaryBudget,
            p_currency: currency,
            p_salary_period: commercial.salaryPeriod,
            p_profile_notes: requestText.trim(),
            p_registration_notes: commercial.registrationNotes,
            p_expires_at: null,
          });
        } catch {
          commercialWarning = ' The request was saved, but the commercial fields need a manual review.';
        }
      }

      setMessage(`Club need created: ${[parsed.position, parsed.preferred_foot && `${parsed.preferred_foot} foot`, maxAge && `max age ${maxAge}`, transferType, commercial.transferBudget != null && 'fee captured', commercial.salaryBudget != null && 'salary captured', commercial.registrationNotes && 'registration note captured'].filter(Boolean).join(' · ')}. Matching ran automatically.${commercialWarning}`);
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

  const copySearchBrief = async () => {
    if (!selectedNeed) return;
    try {
      await navigator.clipboard.writeText(buildSearchBrief(selectedNeed));
      setMessage('Full recruitment brief copied. Ready to paste into a scouting platform, message or search workflow.');
    } catch {
      setError('Could not copy the recruitment brief. Your browser may have blocked clipboard access.');
    }
  };

  const openDealRoom = async (candidate: any) => {
    if (!selectedNeed) return;
    try {
      const playerName = candidate.player_name || candidate.full_name || 'Player';
      const result: any = await djmRpc('djm_deal_room_upsert', {
        p_id: null, p_title: `${playerName} → ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id, p_source_person_id: null,
        p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
        p_club_need_id: selectedNeed.id, p_stage: 'qualifying', p_expected_commission: null, p_currency: selectedNeed.currency || 'EUR',
        // Retained only because the live RPC still requires its legacy field. The
        // product deliberately does not represent this compatibility value as a forecast.
        p_probability: 25, p_primary_blocker: null, p_next_decision: 'Confirm genuine club interest and commercial fit', p_next_action_at: null, p_source: 'market_evidence_review',
      });
      await load();
      if (result?.deal_room_id) router.push(`/market/deals/${result.deal_room_id}`);
    } catch (e) { setError(friendlyError(e)); }
  };

  const currentCandidates = candidateTab === 'signed' ? candidates.signed_players || [] : candidates.recruitment_targets || [];

  return (
    <DjmOsShell eyebrow="Real demand · hard constraints · evidence gaps" title="Market">
      {error ? <div className="djm-os-error"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div> : null}
      {message ? <div className="djm-os-capture-status" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="djm-os-metrics">
        <Metric label="Live needs" value={activeNeeds.length} />
        <Metric label="Needs without signed match" value={activeNeeds.filter((n) => Number(n.match_count || 0) === 0).length} attention={activeNeeds.some((n) => Number(n.match_count || 0) === 0)} />
        <Metric label="Needs with evidence" value={activeNeeds.filter((n) => Number(n.match_count || 0) > 0).length} />
        <Metric label="Deal Rooms" value={deals.length} />
      </section>

      <div className="djm-os-toolbar">
        <div style={{ flex: 1 }}><strong>Type the request like you received it</strong><span className="djm-os-toolbar-note">The original brief is preserved. DJM extracts core filters and runs matching; every commercial and registration detail stays editable.</span></div>
        <div className="djm-os-button-row"><button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/>Refresh</button><button className="djm-os-primary-button" onClick={() => setShowAdd((x) => !x)}><Plus size={16}/>Add club need</button></div>
      </div>

      {showAdd ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head"><div><h2>{advanced ? 'Advanced manual need' : 'New club request'}</h2><p>{advanced ? 'Only fill what matters. Everything remains editable later.' : 'Choose the club and paste/type the requirement.'}</p></div><Target size={20}/></div>
          {!advanced ? (
            <form className="djm-os-form" onSubmit={quickCreate}>
              <label>Club<select value={clubId} onChange={(e) => setClubId(e.target.value)}><option value="">Choose club</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.country ? ` · ${c.country}` : ''}</option>)}</select></label>
              <label>What does the club need?<textarea rows={5} value={requestText} onChange={(e) => setRequestText(e.target.value)} placeholder="e.g. Left-footed RW, age 19–23, permanent. Up to €1.5m transfer fee and €12k/week. Fast, direct, strong 1v1 output. EU passport preferred."/></label>
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
          <div className="djm-os-list">{deals.slice(0,6).map((d) => <Link key={d.id} href={`/market/deals/${d.id}`} className="djm-os-list-row" style={{ textDecoration:'none', color:'inherit' }}><div style={{flex:1}}><strong>{d.title}</strong><p>{[d.organisation_name,d.stage].filter(Boolean).join(' · ')}</p><small>{d.primary_blocker ? `Blocker · ${d.primary_blocker}` : 'No primary blocker recorded'}</small></div><span className="djm-evidence-state is-review">{dealCredibility(d)}</span><ArrowRight size={16}/></Link>)}</div>
        </section>
      ) : null}

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head"><div><h2>Live club demand</h2><p>Full request facts for matching and manual player search.</p></div></div>
          {activeNeeds.length ? <div className="djm-os-list djm-market-needs-list">{activeNeeds.map((need) => { const count = Number(need.match_count || 0); const gaps = needSearchGaps(need); return <button key={need.id} type="button" className={`djm-market-need-row${selectedNeed?.id===need.id ? ' is-selected' : ''}`} onClick={() => void openNeed(need)}>
            <div className="djm-market-need-head">
              <div><strong>{need.organisation_name}</strong><span>{need.title || `${need.need_position} requirement`}</span></div>
              <span className={`djm-evidence-state ${count ? 'is-review' : 'is-missing'}`}>{count ? `${count} candidate${count === 1 ? '' : 's'}` : 'No evidence'}</span>
            </div>
            <div className="djm-market-need-facts" aria-label="Request constraints">
              <span><b>Position</b>{displayValue(need.need_position)}</span>
              <span><b>Age</b>{ageRange(need)}</span>
              <span><b>Deal</b>{transferRoute(need)}</span>
              <span><b>Transfer fee</b>{transferBudget(need)}</span>
              <span><b>Salary</b>{salaryBudget(need)}</span>
              <span><b>Foot</b>{humanise(need.preferred_foot) || 'Any / unknown'}</span>
            </div>
            <p className="djm-market-request-preview">{need.profile_notes || 'Original request text not recorded.'}</p>
            <div className="djm-market-need-foot"><small>{gaps.length ? `${gaps.length} search filter${gaps.length === 1 ? '' : 's'} still missing` : 'Search brief structurally complete'}</small><span>Open full brief <ArrowRight size={14}/></span></div>
          </button>; })}</div> : <div className="djm-os-empty"><CheckCircle2 size={25}/><p>No live club needs.</p></div>}
        </section>

        <section className="djm-os-panel">
          {!selectedNeed ? <div className="djm-os-empty"><Target size={25}/><p>Select a club need to see matched players.</p></div> : (
            <>
              <div className="djm-os-panel-head"><div><div className="djm-command-meta"><span className="djm-evidence-state is-review">{humanise(selectedNeed.need_status)}</span><span>{selectedNeed.expires_at ? `Live until ${compactDate(selectedNeed.expires_at)}` : 'No expiry recorded'}</span></div><h2>{selectedNeed.organisation_name} · {selectedNeed.need_position}</h2><p>{selectedNeed.title || 'Club recruitment requirement'}</p></div><div className="djm-os-button-row"><button className="djm-os-icon-button" onClick={() => setEditing((x) => !x)} aria-label="Edit full request"><Pencil size={16}/></button><button className="djm-os-icon-button" onClick={() => setSelectedNeed(null)} aria-label="Close panel"><X size={16}/></button></div></div>
              {editing && editForm ? <form className="djm-os-form" onSubmit={saveNeed} style={{ borderBottom:'1px solid var(--djm-line)' }}><NeedFields form={editForm} setForm={setEditForm}/><button className="djm-os-primary-button" disabled={busy}>Save changes & rematch</button></form> : null}
              {!editing ? <NeedSearchBrief need={selectedNeed} onCopy={() => void copySearchBrief()}/> : null}
              <div className="djm-os-button-row" style={{ padding:'12px 14px', borderBottom:'1px solid var(--djm-line)' }}><button className={candidateTab==='signed' ? 'djm-os-primary-button':'djm-os-secondary-button'} onClick={() => setCandidateTab('signed')}><UsersRound size={15}/>Signed players ({candidates.signed_players?.length || 0})</button><button className={candidateTab==='recruitment' ? 'djm-os-primary-button':'djm-os-secondary-button'} onClick={() => setCandidateTab('recruitment')}>Recruitment ({candidates.recruitment_targets?.length || 0})</button></div>
              {currentCandidates.length ? <div className="djm-os-list">{currentCandidates.slice(0,12).map((c:any) => { const name=c.player_name||c.full_name; const assessment=matchAssessment(c); const evidence=[...assessment.strengths,...assessment.concerns,...assessment.missing][0]; return <article className="djm-candidate-row" key={c.player_id||c.prospect_id}><div style={{flex:1}}><div className="djm-command-meta"><span className={`djm-evidence-state ${assessment.hardBlockers.length ? 'is-missing' : 'is-review'}`}>{assessment.strength}</span><span>{candidateTab==='signed' ? 'Signed player' : 'Recruitment target'}</span></div><strong>{name}</strong><p>{[c.player_position||c.primary_position,c.current_club,c.preferred_foot].filter(Boolean).join(' · ')}</p><small>{assessment.hardBlockers[0] ? `Hard blocker · ${assessment.hardBlockers[0]}` : evidence || 'Review source data before progressing'}</small></div><button type="button" className="djm-os-secondary-button" onClick={() => void openDealRoom(c)}>Open qualification room</button></article>})}</div> : <div className="djm-os-empty"><Target size={25}/><p>No candidates in this player pool yet.</p></div>}
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
    <label>Original request / player profile<textarea rows={4} value={form.profile_notes} onChange={(e)=>setForm({...form,profile_notes:e.target.value})} placeholder="Keep the club's wording, role detail, playing style, level and any context that matters."/></label>
    <label>Registration / passport notes<textarea rows={2} value={form.registration_notes} onChange={(e)=>setForm({...form,registration_notes:e.target.value})}/></label>
  </>;
}

function NeedSearchBrief({ need, onCopy }: { need:any; onCopy:()=>void }) {
  const gaps = needSearchGaps(need);
  return <section className="djm-market-brief">
    <header className="djm-market-brief-head">
      <div><span><Search size={14}/>Manual player search brief</span><h3>Everything received from the club, in one place</h3></div>
      <button type="button" className="djm-os-secondary-button" onClick={onCopy}><Copy size={15}/>Copy full brief</button>
    </header>
    <div className="djm-market-brief-grid">
      <BriefFact label="Position / role" value={displayValue(need.need_position)} icon={<Target size={16}/>}/>
      <BriefFact label="Age range" value={ageRange(need)} icon={<CalendarClock size={16}/>} missing={need.min_age == null && need.max_age == null}/>
      <BriefFact label="Transfer route" value={transferRoute(need)} icon={<ArrowRight size={16}/>} missing={!need.transfer_type}/>
      <BriefFact label="Transfer fee budget" value={transferBudget(need)} icon={<Banknote size={16}/>} missing={transferBudgetMissing(need)}/>
      <BriefFact label="Salary budget" value={salaryBudget(need)} icon={<Banknote size={16}/>} missing={need.salary_budget == null}/>
      <BriefFact label="Preferred foot" value={humanise(need.preferred_foot) || 'Any / unknown'} icon={<Target size={16}/>} missing={!need.preferred_foot}/>
    </div>
    <div className="djm-market-brief-texts">
      <article><span>Original request / player profile</span><p>{need.profile_notes || 'No original request text or player-profile detail has been recorded.'}</p></article>
      <article><span>Registration, passport or league constraints</span><p>{need.registration_notes || 'No registration or passport constraints have been recorded.'}</p></article>
    </div>
    <div className={`djm-market-gaps ${gaps.length ? 'has-gaps' : 'is-complete'}`}>
      <div><strong>{gaps.length ? 'Manual search gaps' : 'Search brief complete'}</strong><span>{gaps.length ? 'Clarify these before narrowing the market too aggressively.' : 'All core filters are recorded. Verify them with the source before progressing.'}</span></div>
      <div>{gaps.length ? gaps.map((gap) => <span key={gap}>{gap}</span>) : <span>Core filters recorded</span>}</div>
    </div>
  </section>;
}

function BriefFact({ label, value, icon, missing=false }: { label:string; value:string; icon:React.ReactNode; missing?:boolean }) {
  return <div className={`djm-market-brief-fact${missing ? ' is-missing' : ''}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function toEditForm(need:any) { return {
  title:need.title||'', position:need.need_position||'', preferred_foot:need.preferred_foot||'', min_age:need.min_age??'', max_age:need.max_age??'', transfer_type:need.transfer_type||'', transfer_budget:need.transfer_budget??'', salary_budget:need.salary_budget??'', currency:need.currency||'EUR', salary_period:need.salary_period||'year', profile_notes:need.profile_notes||'', registration_notes:need.registration_notes||'',
}; }
function numOrNull(value:any) { return value === '' || value == null ? null : Number(value); }
function displayValue(value:any) { return value == null || String(value).trim() === '' ? 'Not provided' : String(value); }
function humanise(value:any) { return value == null || String(value).trim() === '' ? '' : String(value).replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function ageRange(need:any) {
  if (need.min_age != null && need.max_age != null) return `${need.min_age}–${need.max_age}`;
  if (need.min_age != null) return `${need.min_age}+`;
  if (need.max_age != null) return `Up to ${need.max_age}`;
  return 'Not provided';
}
function money(value:any, currency?:string | null) {
  if (value == null || value === '') return 'Not provided';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (!currency) return `${amount.toLocaleString('en-GB')} · currency not set`;
  try { return new Intl.NumberFormat('en-GB', { style:'currency', currency, maximumFractionDigits:0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en-GB')}`; }
}
function transferRoute(need:any) {
  if (need.transfer_type === 'transfer') return 'Permanent transfer';
  return humanise(need.transfer_type) || 'Not provided';
}
function transferBudgetMissing(need:any) {
  return need.transfer_budget == null && !['free','free_or_loan'].includes(need.transfer_type);
}
function transferBudget(need:any) {
  if (need.transfer_budget != null) return money(need.transfer_budget, need.currency);
  if (need.transfer_type === 'free') return 'No transfer fee';
  if (need.transfer_type === 'free_or_loan') return 'Free / loan terms';
  return 'Not provided';
}
function salaryBudget(need:any) {
  if (need.salary_budget == null) return 'Not provided';
  return `${money(need.salary_budget, need.currency)} / ${humanise(need.salary_period || 'year').toLowerCase()}`;
}
function needSearchGaps(need:any) {
  const gaps:string[] = [];
  if (need.min_age == null && need.max_age == null) gaps.push('Age range');
  if (!need.transfer_type) gaps.push('Transfer route');
  if (transferBudgetMissing(need)) gaps.push('Transfer fee budget');
  if (need.salary_budget == null) gaps.push('Salary budget');
  if ((need.transfer_budget != null || need.salary_budget != null) && !need.currency) gaps.push('Budget currency');
  if (!need.profile_notes) gaps.push('Player profile / original text');
  if (!need.registration_notes) gaps.push('Registration / passport');
  return gaps;
}
function buildSearchBrief(need:any) {
  const gaps = needSearchGaps(need);
  return [
    'DJM CLUB RECRUITMENT BRIEF',
    `Club: ${displayValue(need.organisation_name)}`,
    `Request: ${displayValue(need.title)}`,
    `Position / role: ${displayValue(need.need_position)}`,
    `Age: ${ageRange(need)}`,
    `Preferred foot: ${humanise(need.preferred_foot) || 'Any / unknown'}`,
    `Transfer route: ${transferRoute(need)}`,
    `Transfer fee budget: ${transferBudget(need)}`,
    `Salary budget: ${salaryBudget(need)}`,
    `Status: ${humanise(need.need_status) || 'Not provided'}`,
    `Live until: ${need.expires_at ? compactDate(need.expires_at) : 'Not provided'}`,
    '',
    'ORIGINAL REQUEST / PLAYER PROFILE',
    need.profile_notes || 'Not provided',
    '',
    'REGISTRATION / PASSPORT / LEAGUE CONSTRAINTS',
    need.registration_notes || 'Not provided',
    '',
    `MISSING SEARCH FILTERS: ${gaps.length ? gaps.join(', ') : 'None'}`,
  ].join('\n');
}
function Metric({label,value,attention=false}:{label:string;value:string|number;attention?:boolean}) { return <div className="djm-os-metric" style={attention ? {borderColor:'rgba(244,196,48,.7)',background:'rgba(244,196,48,.08)'}:undefined}><strong>{value}</strong><span>{label}</span></div>; }
