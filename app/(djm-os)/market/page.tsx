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
import ResearchLinkRail from '@/components/ResearchLinkRail';
import { compactDate, djmRpc, friendlyError } from '@/lib/djm-os';
import { dealCredibility, matchAssessment } from '@/lib/intelligence';
import { extractMarketCommercialTerms } from '@/lib/market-demand';
import { buildResearchLinks } from '@/lib/research-links';

const EMPTY_FORM = {
  organisation_id: '',
  source_person_id: '',
  owner_user_id: '',
  title: '',
  position: '',
  secondary_position: '',
  preferred_foot: '',
  min_age: '',
  max_age: '',
  min_height_cm: '',
  transfer_type: '',
  transfer_budget: '',
  salary_budget: '',
  currency: 'EUR',
  salary_period: 'year',
  salary_tax_basis: '',
  nationality_preferences: '',
  passport_requirements: '',
  foreign_player_notes: '',
  playing_style: '',
  profile_notes: '',
  registration_notes: '',
  raw_request: '',
  source_context: '',
  received_at: '',
  priority: '3',
  need_type: 'confirmed',
  prediction_probability: '',
  prediction_basis_note: '',
  expires_at: '',
};

export default function MarketPage() {
  const router = useRouter();
  const [needs, setNeeds] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [candidates, setCandidates] = useState<any>({ signed_players: [], recruitment_targets: [] });
  const [candidateTab, setCandidateTab] = useState<'signed' | 'recruitment'>('signed');
  const [showAdd, setShowAdd] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [clubId, setClubId] = useState('');
  const [requestText, setRequestText] = useState('');
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData, contactData, teamData, dealData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs_v2', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 250 }),
        djmRpc<any[]>('djm_network_club_contacts', { p_search: null, p_limit: 500 }),
        djmRpc<any[]>('djm_team_members_list'),
        djmRpc<any[]>('djm_opportunities', { p_status: 'active' }),
      ]);
      setNeeds(needData || []);
      setClubs((clubData || []).filter((item: any) => item.organisation_type === 'club'));
      setContacts(contactData || []);
      setTeamMembers(teamData || []);
      setDeals(dealData || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeNeeds = useMemo(
    () => needs.filter((need) => ['active', 'open', 'confirmed'].includes(need.need_status)),
    [needs],
  );

  const selectedClub = useMemo(
    () => clubs.find((club) => club.id === (form.organisation_id || clubId)),
    [clubs, form.organisation_id, clubId],
  );

  const sourceContacts = useMemo(() => {
    if (!selectedClub?.name) return contacts;
    return contacts.filter((contact) => contact.current_organisation === selectedClub.name);
  }, [contacts, selectedClub]);

  const openNeed = async (need: any) => {
    setSelectedNeed(need);
    setEditing(false);
    setEditForm(toEditForm(need));
    setError('');
    try {
      const data: any = await djmRpc('djm_market_candidates_v2', { p_need_id: need.id });
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
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result: any = await djmRpc('djm_market_create_need_from_text', {
        p_organisation_id: clubId,
        p_text: requestText.trim(),
        p_source_person_id: null,
      });
      const parsed = result?.parsed || {};
      const commercial = extractMarketCommercialTerms(requestText);
      const needId = result?.need_id;

      if (needId) {
        await djmRpc('djm_market_update_need_v2', {
          p_need_id: needId,
          p_organisation_id: clubId,
          p_title: `${parsed.position || 'Player'} requirement`,
          p_position: parsed.position || 'Player',
          p_source_person_id: null,
          p_secondary_position: null,
          p_preferred_foot: parsed.preferred_foot || null,
          p_min_age: commercial.minAge ?? parsed.min_age ?? null,
          p_max_age: commercial.maxAge ?? parsed.max_age ?? null,
          p_min_height_cm: null,
          p_transfer_type: commercial.transferType || parsed.transfer_type || null,
          p_transfer_budget: commercial.transferBudget,
          p_salary_budget: commercial.salaryBudget,
          p_currency: commercial.currency || parsed.currency || null,
          p_salary_period: commercial.salaryPeriod || null,
          p_salary_tax_basis: null,
          p_nationality_preferences: [],
          p_passport_requirements: null,
          p_foreign_player_notes: null,
          p_playing_style: null,
          p_profile_notes: requestText.trim(),
          p_registration_notes: commercial.registrationNotes,
          p_raw_request: requestText.trim(),
          p_source_context: 'Quick Club Request capture',
          p_received_at: new Date().toISOString(),
          p_priority: 3,
          p_need_type: 'confirmed',
          p_prediction_probability: null,
          p_prediction_basis: {},
          p_expires_at: null,
        });
      }

      setMessage('Club request created, original wording preserved, commercial terms extracted where supported, and matching refreshed.');
      setClubId('');
      setRequestText('');
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const advancedCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.organisation_id || !form.position.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created: any = await djmRpc('djm_market_create_need_v2', toRpcForm(form));
      if (created?.need_id && form.owner_user_id) {
        await djmRpc('djm_market_assign_need_owner', { p_need_id: created.need_id, p_owner_user_id: form.owner_user_id });
      }
      setForm(EMPTY_FORM);
      setClubId('');
      setShowAdd(false);
      setAdvanced(false);
      setMessage('Club request saved with its full editable brief and matching refreshed.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedNeed || !editForm?.position?.trim()) return;
    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_market_update_need_v2', {
        p_need_id: selectedNeed.id,
        ...toRpcForm(editForm),
      });
      await djmRpc('djm_market_assign_need_owner', { p_need_id: selectedNeed.id, p_owner_user_id: editForm.owner_user_id || null });
      setEditing(false);
      const refreshedNeeds = await djmRpc<any[]>('djm_market_needs_v2', { p_status: null });
      setNeeds(refreshedNeeds || []);
      const refreshed = (refreshedNeeds || []).find((need) => need.id === selectedNeed.id);
      if (refreshed) await openNeed(refreshed);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const setNeedStatus = async (status: string) => {
    if (!selectedNeed) return;
    try {
      await djmRpc('djm_market_set_need_status', { p_need_id: selectedNeed.id, p_status: status });
      setSelectedNeed(null);
      setCandidates({ signed_players: [], recruitment_targets: [] });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const deleteNeed = async () => {
    if (!selectedNeed) return;
    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
      });
      const confirmed = window.confirm(
        `Permanently delete this club need? This removes ${impact?.matches || 0} matches and ${impact?.deals || 0} linked Deal Rooms. Use Close if the request was real but is no longer live.`,
      );
      if (!confirmed) return;
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
        p_confirm: true,
      });
      setSelectedNeed(null);
      setCandidates({ signed_players: [], recruitment_targets: [] });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const copySearchBrief = async () => {
    if (!selectedNeed) return;
    try {
      await navigator.clipboard.writeText(buildSearchBrief(selectedNeed));
      setMessage('Full recruitment brief copied.');
    } catch {
      setError('Could not copy the recruitment brief.');
    }
  };

  const openOpportunity = async (candidate: any) => {
    if (!selectedNeed) return;
    try {
      const playerName = candidate.player_name || candidate.full_name || 'Player';
      const result: any = await djmRpc('djm_opportunity_upsert', {
        p_id: null,
        p_title: `${playerName} to ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id,
        p_source_person_id: selectedNeed.source_person_id || null,
        p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
        p_club_need_id: selectedNeed.id,
        p_stage: 'qualifying',
        p_expected_commission: null,
        p_currency: selectedNeed.currency || 'EUR',
        p_primary_blocker: null,
        p_next_decision: 'Confirm genuine club interest and commercial fit',
        p_next_action_text: 'Qualify with the club decision-maker',
        p_next_action_at: null,
        p_transfer_fee: selectedNeed.transfer_budget || null,
        p_player_salary: selectedNeed.salary_budget || null,
        p_salary_period: selectedNeed.salary_period || null,
        p_financial_notes: null,
        p_manual_probability: null,
        p_source: 'market_match',
      });
      await load();
      if (result?.opportunity_id || result?.deal_room_id) {
        router.push(`/market/deals/${result.opportunity_id || result.deal_room_id}`);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const currentCandidates = candidateTab === 'signed'
    ? candidates.signed_players || []
    : candidates.recruitment_targets || [];

  return (
    <DjmOsShell eyebrow="Real demand · hard constraints · evidence gaps" title="Market">
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}
      {message ? <div className="djm-os-capture-status" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="djm-os-metrics">
        <Metric label="Live needs" value={activeNeeds.length} />
        <Metric label="Predicted needs" value={activeNeeds.filter((need) => need.need_type === 'predicted').length} />
        <Metric label="Without candidates" value={activeNeeds.filter((need) => Number(need.match_count || 0) === 0).length} attention={activeNeeds.some((need) => Number(need.match_count || 0) === 0)} />
        <Metric label="Opportunities" value={deals.length} />
      </section>

      <div className="djm-os-toolbar">
        <div style={{ flex: 1 }}>
          <strong>Capture the request as you received it</strong>
          <span className="djm-os-toolbar-note">The original wording stays intact. Every structured constraint remains editable.</span>
        </div>
        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />Refresh
          </button>
          <button className="djm-os-primary-button" onClick={() => setShowAdd((value) => !value)}>
            <Plus size={16} />Add club need
          </button>
        </div>
      </div>

      {showAdd ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head">
            <div><h2>{advanced ? 'Full Club Request' : 'New Club Request'}</h2><p>{advanced ? 'Record the full requirement, source, commercial limits and prediction evidence.' : 'Paste the requirement first. You can refine every field afterwards.'}</p></div>
            <Target size={20} />
          </div>
          {!advanced ? (
            <form className="djm-os-form" onSubmit={quickCreate}>
              <label>Club<select value={clubId} onChange={(event) => setClubId(event.target.value)}><option value="">Choose club</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}{club.country ? ` · ${club.country}` : ''}</option>)}</select></label>
              <label>What does the club need?<textarea rows={5} value={requestText} onChange={(event) => setRequestText(event.target.value)} placeholder="Left-footed RW, age 19-23, permanent. Up to €1.5m fee and €12k/week. Fast, direct and strong 1v1. EU passport preferred." /></label>
              <div className="djm-os-button-row">
                <button className="djm-os-primary-button" disabled={busy || !clubId || !requestText.trim()}>{busy ? 'Creating...' : 'Create and match'}</button>
                <button className="djm-os-secondary-button" type="button" onClick={() => { setAdvanced(true); setForm({ ...EMPTY_FORM, organisation_id: clubId, raw_request: requestText, profile_notes: requestText }); }}>Full editor</button>
              </div>
            </form>
          ) : (
            <form className="djm-os-form" onSubmit={advancedCreate}>
              <NeedFields form={form} setForm={setForm} clubs={clubs} contacts={sourceContacts} teamMembers={teamMembers} />
              <div className="djm-os-button-row">
                <button className="djm-os-primary-button" disabled={busy || !form.organisation_id || !form.position.trim()}>Save and match</button>
                <button className="djm-os-secondary-button" type="button" onClick={() => setAdvanced(false)}>Simple capture</button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {deals.length ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head"><div><h2>Closest to revenue</h2><p>Live player and club situations with the effective probability shown where supported.</p></div><BriefcaseBusiness size={20} /></div>
          <div className="djm-os-list">
            {deals.slice(0, 8).map((deal) => (
              <Link key={deal.id} href={`/market/deals/${deal.id}`} className="djm-os-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ flex: 1 }}><strong>{deal.title}</strong><p>{[deal.organisation_name, humanise(deal.stage)].filter(Boolean).join(' · ')}</p><small>{deal.primary_blocker ? `Blocker · ${deal.primary_blocker}` : deal.next_action_text || 'No primary blocker recorded'}</small></div>
                <span className="djm-evidence-state is-review">{dealCredibility(deal)}</span><ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head"><div><h2>Live club demand</h2><p>Confirmed and predicted requirements, with prediction likelihood kept separate.</p></div></div>
          {activeNeeds.length ? (
            <div className="djm-os-list djm-market-needs-list">
              {activeNeeds.map((need) => {
                const count = Number(need.match_count || 0);
                const predicted = need.need_type === 'predicted';
                return (
                  <button key={need.id} type="button" className={`djm-market-need-row${selectedNeed?.id === need.id ? ' is-selected' : ''}`} onClick={() => void openNeed(need)}>
                    <div className="djm-market-need-head">
                      <div><strong>{need.organisation_name}</strong><span>{need.title || `${need.need_position} requirement`}</span></div>
                      <span className={`djm-evidence-state ${predicted ? 'is-review' : count ? 'is-review' : 'is-missing'}`}>{predicted ? `Predicted · ${need.prediction_probability ?? '?'}%` : count ? `${count} candidate${count === 1 ? '' : 's'}` : 'Confirmed · no match'}</span>
                    </div>
                    <div className="djm-market-need-facts" aria-label="Request constraints">
                      <span><b>Position</b>{displayValue(need.need_position)}</span>
                      <span><b>Age</b>{ageRange(need)}</span>
                      <span><b>Height</b>{need.min_height_cm ? `${need.min_height_cm}cm+` : 'Any / unknown'}</span>
                      <span><b>Deal</b>{transferRoute(need)}</span>
                      <span><b>Fee</b>{transferBudget(need)}</span>
                      <span><b>Salary</b>{salaryBudget(need)}</span>
                    </div>
                    <p className="djm-market-request-preview">{need.raw_request || need.profile_notes || 'Original request text not recorded.'}</p>
                    <div className="djm-market-need-foot"><small>{need.source_person_name ? `Source · ${need.source_person_name}` : predicted ? 'Prediction needs source evidence' : 'Source contact not recorded'}</small><span>Open full brief <ArrowRight size={14} /></span></div>
                  </button>
                );
              })}
            </div>
          ) : <div className="djm-os-empty"><CheckCircle2 size={25} /><p>No live club needs.</p></div>}
        </section>

        <section className="djm-os-panel">
          {!selectedNeed ? <div className="djm-os-empty"><Target size={25} /><p>Select a Club Need to see the full editable brief and matched players.</p></div> : (
            <>
              <div className="djm-os-panel-head">
                <div>
                  <div className="djm-command-meta">
                    <span className="djm-evidence-state is-review">{selectedNeed.need_type === 'predicted' ? `Predicted · ${selectedNeed.prediction_probability ?? '?'}%` : 'Confirmed need'}</span>
                    <span>Priority {selectedNeed.priority || 3}/5</span>
                  </div>
                  <h2>{selectedNeed.organisation_name} · {selectedNeed.need_position}</h2>
                  <p>{selectedNeed.source_person_name ? `Source: ${selectedNeed.source_person_name}` : 'Source contact not recorded'}</p>
                </div>
                <div className="djm-os-button-row"><button className="djm-os-icon-button" onClick={() => setEditing((value) => !value)} aria-label="Edit full request"><Pencil size={16} /></button><button className="djm-os-icon-button" onClick={() => setSelectedNeed(null)} aria-label="Close panel"><X size={16} /></button></div>
              </div>

              {editing && editForm ? (
                <form className="djm-os-form" onSubmit={saveNeed} style={{ borderBottom: '1px solid var(--djm-line)' }}>
                  <NeedFields form={editForm} setForm={setEditForm} clubs={clubs} contacts={contacts.filter((contact) => contact.current_organisation === clubs.find((club) => club.id === editForm.organisation_id)?.name)} teamMembers={teamMembers} />
                  <button className="djm-os-primary-button" disabled={busy}>Save changes and rematch</button>
                </form>
              ) : (
                <NeedSearchBrief need={selectedNeed} onCopy={() => void copySearchBrief()} />
              )}

              {!editing ? <div style={{ padding: '0 14px' }}><ResearchLinkRail compact links={buildResearchLinks({ kind: 'club', name: selectedNeed.organisation_name, country: selectedNeed.organisation_country, websiteUrl: selectedNeed.website_url })} title="Research club" /></div> : null}

              <div className="djm-os-button-row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--djm-line)' }}>
                <button className={candidateTab === 'signed' ? 'djm-os-primary-button' : 'djm-os-secondary-button'} onClick={() => setCandidateTab('signed')}><UsersRound size={15} />Signed ({candidates.signed_players?.length || 0})</button>
                <button className={candidateTab === 'recruitment' ? 'djm-os-primary-button' : 'djm-os-secondary-button'} onClick={() => setCandidateTab('recruitment')}>Recruitment ({candidates.recruitment_targets?.length || 0})</button>
              </div>

              {currentCandidates.length ? (
                <div className="djm-os-list">
                  {currentCandidates.slice(0, 20).map((candidate: any) => {
                    const name = candidate.player_name || candidate.full_name;
                    const assessment = matchAssessment(candidate);
                    const evidence = assessment.hardBlockers[0] || assessment.strengths[0] || assessment.concerns[0] || assessment.missing[0];
                    const researchLinks = buildResearchLinks({
                      kind: candidateTab === 'signed' ? 'player' : 'recruitment',
                      name,
                      clubName: candidate.current_club,
                      country: candidate.current_country || candidate.nationality,
                      whatsapp: candidate.whatsapp,
                      phone: candidate.phone,
                      email: candidate.email,
                      transfermarktUrl: candidate.transfermarkt_url,
                      wyscoutUrl: candidate.wyscout_url,
                      statsUrl: candidate.stats_url,
                      instagramUrl: candidate.instagram_url,
                    });
                    return (
                      <article className="djm-candidate-row" key={candidate.player_id || candidate.prospect_id}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="djm-command-meta"><span className={`djm-evidence-state ${assessment.hardBlockers.length ? 'is-missing' : 'is-review'}`}>{assessment.strength}</span><span>{candidateTab === 'signed' ? 'Signed player' : 'Recruitment target'}</span></div>
                          <strong>{name}</strong>
                          <p>{[candidate.player_position || candidate.primary_position, candidate.current_club, candidate.preferred_foot].filter(Boolean).join(' · ')}</p>
                          <small>{assessment.hardBlockers[0] ? `Hard blocker · ${assessment.hardBlockers[0]}` : evidence || 'Review source data before progressing'}</small>
                          <ResearchLinkRail compact links={researchLinks} />
                        </div>
                        <button type="button" className="djm-os-secondary-button" onClick={() => void openOpportunity(candidate)}>Open Opportunity</button>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="djm-os-empty"><Target size={25} /><p>No candidates in this player pool yet.</p></div>}

              <div className="djm-os-button-row" style={{ padding: 14 }}><button className="djm-os-secondary-button" onClick={() => void setNeedStatus('closed')}>Close need</button><button className="djm-os-secondary-button" onClick={() => void deleteNeed()}>Delete</button></div>
            </>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function NeedFields({ form, setForm, clubs, contacts, teamMembers }: { form: any; setForm: (value: any) => void; clubs: any[]; contacts: any[]; teamMembers: any[] }) {
  const predicted = form.need_type === 'predicted';
  return <>
    <div className="djm-os-form-grid">
      <label>Club<select required value={form.organisation_id} onChange={(event) => setForm({ ...form, organisation_id: event.target.value, source_person_id: '' })}><option value="">Choose club</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
      <label>Owner<select value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}><option value="">Current user / unassigned</option>{teamMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}{member.role_title ? ` · ${member.role_title}` : ''}</option>)}</select></label>
      <label>Source contact<select value={form.source_person_id} onChange={(event) => setForm({ ...form, source_person_id: event.target.value })}><option value="">Not recorded</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.role_title ? ` · ${contact.role_title}` : ''}</option>)}</select></label>
      <label>Primary position<input required value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="RW, LCB, 6, striker" /></label>
      <label>Secondary position<input value={form.secondary_position} onChange={(event) => setForm({ ...form, secondary_position: event.target.value })} /></label>
      <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Preferred foot<select value={form.preferred_foot} onChange={(event) => setForm({ ...form, preferred_foot: event.target.value })}><option value="">Any / unknown</option><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Min age<input type="number" value={form.min_age} onChange={(event) => setForm({ ...form, min_age: event.target.value })} /></label>
      <label>Max age<input type="number" value={form.max_age} onChange={(event) => setForm({ ...form, max_age: event.target.value })} /></label>
      <label>Minimum height (cm)<input type="number" min="140" max="230" value={form.min_height_cm} onChange={(event) => setForm({ ...form, min_height_cm: event.target.value })} /></label>
      <label>Transfer type<select value={form.transfer_type} onChange={(event) => setForm({ ...form, transfer_type: event.target.value })}><option value="">Any</option><option value="free">Free</option><option value="loan">Loan</option><option value="free_or_loan">Free or loan</option><option value="transfer">Transfer</option></select></label>
      <label>Transfer budget<input type="number" value={form.transfer_budget} onChange={(event) => setForm({ ...form, transfer_budget: event.target.value })} /></label>
      <label>Salary budget<input type="number" value={form.salary_budget} onChange={(event) => setForm({ ...form, salary_budget: event.target.value })} /></label>
      <label>Currency<input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
      <label>Salary period<select value={form.salary_period} onChange={(event) => setForm({ ...form, salary_period: event.target.value })}><option value="year">Year</option><option value="month">Month</option><option value="week">Week</option></select></label>
      <label>Salary tax basis<select value={form.salary_tax_basis} onChange={(event) => setForm({ ...form, salary_tax_basis: event.target.value })}><option value="">Unknown</option><option value="gross">Gross</option><option value="net">Net</option></select></label>
      <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Need type<select value={form.need_type} onChange={(event) => setForm({ ...form, need_type: event.target.value, prediction_probability: event.target.value === 'confirmed' ? '' : form.prediction_probability })}><option value="confirmed">Confirmed</option><option value="predicted">Predicted</option></select></label>
      {predicted ? <label>Predicted likelihood %<input required type="number" min="0" max="100" value={form.prediction_probability} onChange={(event) => setForm({ ...form, prediction_probability: event.target.value })} /></label> : null}
      <label>Received at<input type="datetime-local" value={form.received_at} onChange={(event) => setForm({ ...form, received_at: event.target.value })} /></label>
      <label>Expiry<input type="datetime-local" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} /></label>
    </div>
    <label>Nationality preferences<input value={form.nationality_preferences} onChange={(event) => setForm({ ...form, nationality_preferences: event.target.value })} placeholder="NZ, Australia, UK" /></label>
    <label>Passport requirements<textarea rows={2} value={form.passport_requirements} onChange={(event) => setForm({ ...form, passport_requirements: event.target.value })} /></label>
    <label>Foreign-player / registration context<textarea rows={2} value={form.foreign_player_notes} onChange={(event) => setForm({ ...form, foreign_player_notes: event.target.value })} /></label>
    <label>Playing style<textarea rows={2} value={form.playing_style} onChange={(event) => setForm({ ...form, playing_style: event.target.value })} /></label>
    <label>Profile requirements<textarea rows={3} value={form.profile_notes} onChange={(event) => setForm({ ...form, profile_notes: event.target.value })} /></label>
    <label>Registration notes<textarea rows={2} value={form.registration_notes} onChange={(event) => setForm({ ...form, registration_notes: event.target.value })} /></label>
    <label>Original Club Request<textarea rows={4} value={form.raw_request} onChange={(event) => setForm({ ...form, raw_request: event.target.value })} placeholder="Preserve the club's exact requirement and context here." /></label>
    <label>Source context<textarea rows={2} value={form.source_context} onChange={(event) => setForm({ ...form, source_context: event.target.value })} placeholder="Call, WhatsApp, meeting, message, public signal..." /></label>
    {predicted ? <label>Prediction evidence<textarea rows={3} value={form.prediction_basis_note} onChange={(event) => setForm({ ...form, prediction_basis_note: event.target.value })} placeholder="Why do we believe this need exists? Keep evidence and uncertainty explicit." /></label> : null}
  </>;
}

function NeedSearchBrief({ need, onCopy }: { need: any; onCopy: () => void }) {
  const predicted = need.need_type === 'predicted';
  return <section className="djm-market-brief">
    <header className="djm-market-brief-head"><div><span><Search size={14} />Recruitment brief</span><h3>Everything received or inferred, with provenance preserved</h3></div><button type="button" className="djm-os-secondary-button" onClick={onCopy}><Copy size={15} />Copy full brief</button></header>
    <div className="djm-market-brief-grid">
      <BriefFact label="Position / role" value={[displayValue(need.need_position), need.secondary_position].filter(Boolean).join(' / ')} icon={<Target size={16} />} />
      <BriefFact label="Age range" value={ageRange(need)} icon={<CalendarClock size={16} />} />
      <BriefFact label="Transfer route" value={transferRoute(need)} icon={<ArrowRight size={16} />} />
      <BriefFact label="Transfer fee" value={transferBudget(need)} icon={<Banknote size={16} />} />
      <BriefFact label="Salary" value={salaryBudget(need)} icon={<Banknote size={16} />} />
      <BriefFact label="Preferred foot" value={humanise(need.preferred_foot) || 'Any / unknown'} icon={<Target size={16} />} />
    </div>
    <div className="djm-market-brief-texts">
      <article><span>Original Club Request</span><p>{need.raw_request || need.profile_notes || 'Not recorded.'}</p></article>
      <article><span>Playing style / profile</span><p>{[need.playing_style, need.profile_notes].filter(Boolean).join('\n') || 'Not recorded.'}</p></article>
      <article><span>Registration / passport</span><p>{[need.passport_requirements, need.foreign_player_notes, need.registration_notes].filter(Boolean).join('\n') || 'Not recorded.'}</p></article>
      {predicted ? <article><span>Prediction basis · {need.prediction_probability ?? '?'}%</span><p>{predictionBasisText(need.prediction_basis)}</p></article> : null}
    </div>
  </section>;
}

function BriefFact({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="djm-market-brief-fact"><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`djm-os-metric${attention ? ' is-attention' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function toEditForm(need: any) {
  return {
    organisation_id: need.organisation_id || '',
    source_person_id: need.source_person_id || '',
    owner_user_id: need.owner_user_id || '',
    title: need.title || '',
    position: need.need_position || need.position || '',
    secondary_position: need.secondary_position || '',
    preferred_foot: need.preferred_foot || '',
    min_age: need.min_age ?? '',
    max_age: need.max_age ?? '',
    min_height_cm: need.min_height_cm ?? '',
    transfer_type: need.transfer_type || '',
    transfer_budget: need.transfer_budget ?? '',
    salary_budget: need.salary_budget ?? '',
    currency: need.currency || 'EUR',
    salary_period: need.salary_period || 'year',
    salary_tax_basis: need.salary_tax_basis || '',
    nationality_preferences: Array.isArray(need.nationality_preferences) ? need.nationality_preferences.join(', ') : '',
    passport_requirements: need.passport_requirements || '',
    foreign_player_notes: need.foreign_player_notes || '',
    playing_style: need.playing_style || '',
    profile_notes: need.profile_notes || '',
    registration_notes: need.registration_notes || '',
    raw_request: need.raw_request || '',
    source_context: need.source_context || '',
    received_at: toLocalDateTime(need.received_at),
    priority: String(need.priority || 3),
    need_type: need.need_type || 'confirmed',
    prediction_probability: need.need_type === 'predicted' ? String(need.prediction_probability ?? '') : '',
    prediction_basis_note: predictionBasisText(need.prediction_basis),
    expires_at: toLocalDateTime(need.expires_at),
  };
}

function toRpcForm(value: any) {
  const predicted = value.need_type === 'predicted';
  return {
    p_organisation_id: value.organisation_id,
    p_title: value.title.trim() || `${value.position.trim()} requirement`,
    p_position: value.position.trim(),
    p_source_person_id: value.source_person_id || null,
    p_secondary_position: value.secondary_position.trim() || null,
    p_preferred_foot: value.preferred_foot || null,
    p_min_age: numOrNull(value.min_age),
    p_max_age: numOrNull(value.max_age),
    p_min_height_cm: numOrNull(value.min_height_cm),
    p_transfer_type: value.transfer_type || null,
    p_transfer_budget: numOrNull(value.transfer_budget),
    p_salary_budget: numOrNull(value.salary_budget),
    p_currency: value.currency || null,
    p_salary_period: value.salary_period || null,
    p_salary_tax_basis: value.salary_tax_basis || null,
    p_nationality_preferences: commaList(value.nationality_preferences),
    p_passport_requirements: value.passport_requirements.trim() || null,
    p_foreign_player_notes: value.foreign_player_notes.trim() || null,
    p_playing_style: value.playing_style.trim() || null,
    p_profile_notes: value.profile_notes.trim() || null,
    p_registration_notes: value.registration_notes.trim() || null,
    p_raw_request: value.raw_request.trim() || null,
    p_source_context: value.source_context.trim() || null,
    p_received_at: value.received_at ? new Date(value.received_at).toISOString() : new Date().toISOString(),
    p_priority: Number(value.priority || 3),
    p_need_type: value.need_type || 'confirmed',
    p_prediction_probability: predicted ? numOrNull(value.prediction_probability) : null,
    p_prediction_basis: predicted && value.prediction_basis_note.trim()
      ? { evidence_note: value.prediction_basis_note.trim(), entered_manually: true }
      : {},
    p_expires_at: value.expires_at ? new Date(value.expires_at).toISOString() : null,
  };
}

function numOrNull(value: any) { return value === '' || value == null ? null : Number(value); }
function commaList(value: string) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function displayValue(value: any) { return value == null || String(value).trim() === '' ? 'Not provided' : String(value); }
function humanise(value: any) { return value == null || String(value).trim() === '' ? '' : String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function toLocalDateTime(value: any) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function ageRange(need: any) { if (need.min_age != null && need.max_age != null) return `${need.min_age}-${need.max_age}`; if (need.min_age != null) return `${need.min_age}+`; if (need.max_age != null) return `Up to ${need.max_age}`; return 'Not provided'; }
function money(value: any, currency?: string | null) { if (value == null || value === '') return 'Not provided'; const amount = Number(value); if (!Number.isFinite(amount)) return String(value); if (!currency) return amount.toLocaleString('en-GB'); try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); } catch { return `${currency} ${amount.toLocaleString('en-GB')}`; } }
function transferRoute(need: any) { return need.transfer_type === 'transfer' ? 'Permanent transfer' : humanise(need.transfer_type) || 'Not provided'; }
function transferBudget(need: any) { if (need.transfer_budget != null) return money(need.transfer_budget, need.currency); if (need.transfer_type === 'free') return 'No transfer fee'; if (need.transfer_type === 'free_or_loan') return 'Free / loan terms'; return 'Not provided'; }
function salaryBudget(need: any) { if (need.salary_budget == null) return 'Not provided'; return `${money(need.salary_budget, need.currency)}${need.salary_period ? ` / ${need.salary_period}` : ''}${need.salary_tax_basis ? ` · ${humanise(need.salary_tax_basis)}` : ''}`; }
function predictionBasisText(value: any) { if (!value) return 'No prediction evidence recorded.'; if (typeof value === 'string') return value; if (value.evidence_note) return String(value.evidence_note); try { const entries = Object.entries(value).filter(([, item]) => item != null && item !== ''); return entries.length ? entries.map(([key, item]) => `${humanise(key)}: ${String(item)}`).join('\n') : 'No prediction evidence recorded.'; } catch { return 'No prediction evidence recorded.'; } }
function buildSearchBrief(need: any) { return [
  `${need.organisation_name || 'Club'} · ${need.title || `${need.need_position || 'Player'} requirement`}`,
  `Type: ${need.need_type === 'predicted' ? `Predicted (${need.prediction_probability ?? '?'}%)` : 'Confirmed'}`,
  `Position: ${displayValue(need.need_position)}${need.secondary_position ? ` / ${need.secondary_position}` : ''}`,
  `Age: ${ageRange(need)}`,
  `Minimum height: ${need.min_height_cm ? `${need.min_height_cm} cm` : 'Not provided'}`,
  `Preferred foot: ${humanise(need.preferred_foot) || 'Any / unknown'}`,
  `Transfer route: ${transferRoute(need)}`,
  `Transfer fee: ${transferBudget(need)}`,
  `Salary: ${salaryBudget(need)}`,
  `Nationality preferences: ${(need.nationality_preferences || []).join(', ') || 'Not provided'}`,
  `Passport: ${need.passport_requirements || 'Not provided'}`,
  `Foreign-player context: ${need.foreign_player_notes || 'Not provided'}`,
  `Playing style: ${need.playing_style || 'Not provided'}`,
  `Profile: ${need.profile_notes || 'Not provided'}`,
  `Registration: ${need.registration_notes || 'Not provided'}`,
  `Original Club Request: ${need.raw_request || 'Not recorded'}`,
  `Source: ${need.source_person_name || 'Not recorded'}${need.source_context ? ` · ${need.source_context}` : ''}`,
  need.need_type === 'predicted' ? `Prediction basis: ${predictionBasisText(need.prediction_basis)}` : null,
].filter(Boolean).join('\n'); }
