'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { djmRpc, friendlyError } from '@/lib/djm-os';

type View = 'needs' | 'matches' | 'pipeline';

const ACTIVE_NEED = new Set(['active', 'open', 'confirmed']);

export default function OpportunitiesPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('needs');
  const [needs, setNeeds] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [candidates, setCandidates] = useState<any>({ signed_players: [], recruitment_targets: [] });
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [clubId, setClubId] = useState('');
  const [requestText, setRequestText] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData, opportunityData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs_v2', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 300 }),
        djmRpc<any[]>('djm_opportunities', { p_status: 'active' }),
      ]);
      setNeeds(needData || []);
      setClubs((clubData || []).filter((club: any) => club.organisation_type === 'club'));
      setOpportunities(opportunityData || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeNeeds = useMemo(() => needs.filter((need) => ACTIVE_NEED.has(String(need.need_status || need.status))), [needs]);
  const filteredNeeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeNeeds.filter((need) => !q || [need.organisation_name, need.position, need.title, need.profile_notes, need.raw_request].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [activeNeeds, search]);
  const filteredPipeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((opportunity) => !q || [opportunity.player_name, opportunity.organisation_name, opportunity.title, opportunity.stage].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [opportunities, search]);

  const openNeed = async (need: any) => {
    setSelectedNeed(need);
    setView('matches');
    setError('');
    try {
      const result: any = await djmRpc('djm_market_candidates_v2', { p_need_id: need.id });
      setCandidates(result || { signed_players: [], recruitment_targets: [] });
    } catch (matchError) {
      setError(friendlyError(matchError));
    }
  };

  const createNeed = async (event: FormEvent) => {
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
      setClubId('');
      setRequestText('');
      setShowAdd(false);
      setMessage('Club need captured from the original wording. DJM preserved the source text and refreshed matching.');
      await load();
      if (result?.need_id) {
        const refreshed = await djmRpc<any[]>('djm_market_needs_v2', { p_status: null });
        const created = (refreshed || []).find((need: any) => need.id === result.need_id);
        if (created) await openNeed(created);
      }
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setBusy(false);
    }
  };

  const createOpportunity = async (candidate: any, candidateType: 'signed' | 'prospect') => {
    if (!selectedNeed) return;
    setError('');
    try {
      const name = candidate.player_name || candidate.full_name || 'Player';
      const result: any = await djmRpc('djm_opportunity_upsert', {
        p_id: null,
        p_title: `${name} to ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id,
        p_source_person_id: selectedNeed.source_person_id || null,
        p_player_id: candidateType === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateType === 'prospect' ? candidate.prospect_id || candidate.id : null,
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
      setMessage(`${name} moved into the opportunity pipeline.`);
      await load();
      const id = result?.opportunity_id || result?.deal_room_id;
      if (id) router.push(`/opportunities/${id}`);
    } catch (opportunityError) {
      setError(friendlyError(opportunityError));
    }
  };

  const signedMatches = Array.isArray(candidates?.signed_players) ? candidates.signed_players : [];
  const prospectMatches = Array.isArray(candidates?.recruitment_targets) ? candidates.recruitment_targets : [];

  return (
    <DjmOsShell eyebrow="Demand to player to deal" title="Opportunities">
      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}
      {message ? <div className="ux-alert ux-alert-success">{message}</div> : null}

      <div className="ux-page-toolbar">
        <div className="ux-segmented" role="tablist" aria-label="Opportunity views">
          <button type="button" className={view === 'needs' ? 'is-active' : ''} onClick={() => setView('needs')}>Needs <span>{activeNeeds.length}</span></button>
          <button type="button" className={view === 'matches' ? 'is-active' : ''} onClick={() => setView('matches')}>Matches <span>{selectedNeed ? signedMatches.length + prospectMatches.length : 0}</span></button>
          <button type="button" className={view === 'pipeline' ? 'is-active' : ''} onClick={() => setView('pipeline')}>Pipeline <span>{opportunities.length}</span></button>
        </div>
        <div className="ux-toolbar-actions">
          <label className="ux-search-control"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search opportunities" /></label>
          <button type="button" className="ux-secondary-action" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />Refresh</button>
          <button type="button" className="ux-primary-action" onClick={() => setShowAdd((value) => !value)}><Plus size={15} />Add need</button>
        </div>
      </div>

      {showAdd ? (
        <section className="ux-surface ux-inline-create">
          <div className="ux-surface-head"><div><p className="ux-eyebrow">CAPTURE ONCE</p><h2>What did the club actually ask for?</h2><p>Paste the wording you received. Structured fields can be refined later.</p></div></div>
          <form className="ux-simple-form" onSubmit={createNeed}>
            <label>Club<select required value={clubId} onChange={(event) => setClubId(event.target.value)}><option value="">Choose club</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}{club.country ? ` · ${club.country}` : ''}</option>)}</select></label>
            <label>Club requirement<textarea required rows={4} value={requestText} onChange={(event) => setRequestText(event.target.value)} placeholder="Fast U21 RW, free or loan, salary max €200k..." /></label>
            <button className="ux-primary-action" type="submit">Create need and match</button>
          </form>
        </section>
      ) : null}

      {busy ? <div className="ux-loading-row"><RefreshCw size={18} className="spin" />Connecting live demand...</div> : null}

      {!busy && view === 'needs' ? (
        <section className="ux-need-grid">
          {filteredNeeds.map((need) => (
            <button type="button" className="ux-need-card" onClick={() => void openNeed(need)} key={need.id}>
              <div><span className={`ux-trust-chip ${need.need_type === 'predicted' ? 'is-predicted' : ''}`}>{need.need_type === 'predicted' ? 'Predicted' : 'Confirmed'}</span><strong>{need.organisation_name}</strong><h3>{need.position || need.title || 'Player requirement'}</h3></div>
              <p>{need.raw_request || need.profile_notes || 'Open club requirement'}</p>
              <div className="ux-need-footer"><span>{Number(need.match_count || 0)} current match{Number(need.match_count || 0) === 1 ? '' : 'es'}</span><ArrowRight size={16} /></div>
            </button>
          ))}
          {!filteredNeeds.length ? <EmptyState text="No live club needs match this view." /> : null}
        </section>
      ) : null}

      {!busy && view === 'matches' ? (
        <section className="ux-surface">
          <div className="ux-surface-head">
            <div><p className="ux-eyebrow">EXPLAINABLE MATCHING</p><h2>{selectedNeed ? `${selectedNeed.organisation_name} · ${selectedNeed.position || selectedNeed.title}` : 'Choose a club need'}</h2><p>{selectedNeed ? 'Player Score is not Club Fit. This view explains the requirement match separately.' : 'Open a need from the Needs tab to see candidates.'}</p></div>
            {selectedNeed ? <button type="button" className="ux-secondary-action" onClick={() => setView('needs')}>Change need</button> : null}
          </div>

          {selectedNeed ? (
            <div className="ux-match-sections">
              <MatchGroup title="Signed players" rows={signedMatches} type="signed" onCreate={createOpportunity} />
              <MatchGroup title="Prospects" rows={prospectMatches} type="prospect" onCreate={createOpportunity} />
            </div>
          ) : <EmptyState text="Select a live need first." />}
        </section>
      ) : null}

      {!busy && view === 'pipeline' ? (
        <section className="ux-pipeline-list">
          {filteredPipeline.map((opportunity) => (
            <Link href={`/opportunities/${opportunity.id}`} className="ux-pipeline-row" key={opportunity.id}>
              <div className="ux-stage-dot" />
              <div className="ux-player-main"><strong>{opportunity.player_name || opportunity.title}</strong><p>{opportunity.organisation_name} · {String(opportunity.stage || 'identified').replaceAll('_', ' ')}</p><small>{opportunity.primary_blocker ? `Blocker: ${opportunity.primary_blocker}` : opportunity.next_action_text || 'Open deal room'}</small></div>
              <div className="ux-player-meta"><strong>{opportunity.probability == null ? '-' : `${opportunity.probability}%`}</strong><span>pipeline signal</span></div>
              <ArrowRight size={17} />
            </Link>
          ))}
          {!filteredPipeline.length ? <EmptyState text="No live opportunities match this search." /> : null}
        </section>
      ) : null}
    </DjmOsShell>
  );
}

function MatchGroup({ title, rows, type, onCreate }: { title: string; rows: any[]; type: 'signed' | 'prospect'; onCreate: (row: any, type: 'signed' | 'prospect') => Promise<void> }) {
  return (
    <section className="ux-match-group">
      <div className="ux-match-title"><h3>{title}</h3><span>{rows.length}</span></div>
      {rows.map((row, index) => {
        const name = row.player_name || row.full_name || 'Player';
        const score = Number(row.overall_score ?? row.match_score ?? 0);
        return (
          <article className="ux-match-row" key={row.match_id || row.player_id || row.prospect_id || row.id || index}>
            <div className="ux-fit-badge"><strong>{score || '-'}</strong><span>fit</span></div>
            <div className="ux-player-main"><strong>{name}</strong><p>{[row.player_position || row.primary_position, row.current_club, row.current_league || row.current_country].filter(Boolean).join(' · ')}</p><small>{explainReasoning(row.reasoning)}</small></div>
            {type === 'signed' && row.player_id ? <Link className="ux-secondary-action" href={`/admin/players/${row.player_id}/compare`}>Compare</Link> : null}
            <button type="button" className="ux-primary-action" onClick={() => void onCreate(row, type)}>Create opportunity</button>
          </article>
        );
      })}
      {!rows.length ? <p className="ux-muted-copy">No evidence-backed matches in this group.</p> : null}
    </section>
  );
}

function explainReasoning(value: any) {
  if (!value) return 'Open the player to review fit evidence.';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.slice(0, 3).map(String).join(' · ');
  const items = Object.entries(value).filter(([, entry]) => entry != null).slice(0, 3).map(([key, entry]) => `${key.replaceAll('_', ' ')}: ${String(entry)}`);
  return items.join(' · ') || 'Match evidence available.';
}

function EmptyState({ text }: { text: string }) {
  return <div className="ux-evidence-empty"><CheckCircle2 size={25} /><div><strong>Nothing to show.</strong><p>{text}</p></div></div>;
}
