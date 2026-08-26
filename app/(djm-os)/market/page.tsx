'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Plus,
  RefreshCw,
  Target,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { djmRpc, friendlyError } from '@/lib/djm-os';

const EMPTY_NEED = {
  organisation_id: '',
  title: '',
  position: '',
  preferred_foot: '',
  min_age: '',
  max_age: '',
  transfer_type: '',
  transfer_budget: '',
  salary_budget: '',
  currency: 'EUR',
  salary_period: 'year',
  profile_notes: '',
  registration_notes: '',
};

export default function MarketPage() {
  const [needs, setNeeds] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [candidates, setCandidates] = useState<any>({ signed_players: [], recruitment_targets: [] });
  const [candidateTab, setCandidateTab] = useState<'signed' | 'recruitment'>('signed');
  const [form, setForm] = useState<any>(EMPTY_NEED);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData, dealData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', {
          p_search: null,
          p_limit: 250,
        }),
        djmRpc<any[]>('djm_deal_rooms', { p_status: 'active' }),
      ]);
      setNeeds(needData || []);
      setClubs(clubData || []);
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

  const openNeed = async (need: any) => {
    setSelectedNeed(need);
    setError('');
    try {
      const data: any = await djmRpc('djm_market_candidates', {
        p_need_id: need.id,
      });
      setCandidates(data || { signed_players: [], recruitment_targets: [] });
      const signedCount = Number(data?.signed_players?.length || 0);
      const recruitmentCount = Number(data?.recruitment_targets?.length || 0);
      setCandidateTab(signedCount > 0 || recruitmentCount === 0 ? 'signed' : 'recruitment');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const createNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.organisation_id || !form.position) return;

    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_market_create_need', {
        p_organisation_id: form.organisation_id,
        p_title: form.title || `${form.position} requirement`,
        p_position: form.position,
        p_source_person_id: null,
        p_preferred_foot: form.preferred_foot || null,
        p_min_age: form.min_age ? Number(form.min_age) : null,
        p_max_age: form.max_age ? Number(form.max_age) : null,
        p_transfer_type: form.transfer_type || null,
        p_transfer_budget: form.transfer_budget ? Number(form.transfer_budget) : null,
        p_salary_budget: form.salary_budget ? Number(form.salary_budget) : null,
        p_currency: form.currency || null,
        p_salary_period: form.salary_period || null,
        p_profile_notes: form.profile_notes || null,
        p_registration_notes: form.registration_notes || null,
        p_expires_at: null,
      });
      setForm(EMPTY_NEED);
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const setNeedStatus = async (needId: string, status: string) => {
    try {
      await djmRpc('djm_market_set_need_status', {
        p_need_id: needId,
        p_status: status,
      });
      setSelectedNeed(null);
      setCandidates({ signed_players: [], recruitment_targets: [] });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const setMatchStatus = async (matchId: string, status: string) => {
    try {
      await djmRpc('djm_market_set_match_status', {
        p_match_id: matchId,
        p_status: status,
      });
      if (selectedNeed) await openNeed(selectedNeed);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const openDealRoom = async (candidate: any) => {
    if (!selectedNeed) return;
    try {
      const probabilityResult: any = await djmRpc(
        'djm_market_deal_probability',
        {
          p_need_id: selectedNeed.id,
          p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
          p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
        },
      );
      const probability = Math.max(
        5,
        Math.min(
          90,
          Number(probabilityResult?.probability || 35) -
            (candidateTab === 'recruitment' ? 10 : 0),
        ),
      );
      const result: any = await djmRpc('djm_deal_room_upsert', {
        p_id: null,
        p_title: `${candidate.player_name || candidate.full_name} → ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id,
        p_source_person_id: selectedNeed.source_person_id || null,
        p_player_id: candidateTab === 'signed' ? candidate.player_id : null,
        p_prospect_id: candidateTab === 'recruitment' ? candidate.prospect_id : null,
        p_club_need_id: selectedNeed.id,
        p_stage: 'qualifying',
        p_expected_commission: null,
        p_currency: 'EUR',
        p_probability: Math.max(10, Math.min(90, probability)),
        p_primary_blocker: null,
        p_next_decision: 'Confirm genuine club interest and commercial fit',
        p_next_action_at: null,
        p_source: 'market_match',
      });
      await load();
      if (result?.deal_room_id) {
        window.location.href = `/market/deals/${result.deal_room_id}`;
      }
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
      const ok = window.confirm(
        `Permanently delete this Club Need? This removes ${impact?.matches || 0} player matches and ${impact?.deals || 0} Deal Rooms linked to it. Use Close instead if the requirement was real but is no longer active.`,
      );
      if (!ok) return;
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

  const activeNeeds = useMemo(
    () =>
      needs.filter((need) =>
        ['active', 'open', 'confirmed'].includes(need.need_status),
      ),
    [needs],
  );

  const currentCandidates =
    candidateTab === 'signed'
      ? candidates.signed_players || []
      : candidates.recruitment_targets || [];

  return (
    <DjmOsShell
      eyebrow="Club demand matched to DJM's player universe"
      title="DJM Market"
    >
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <section className="djm-os-metrics">
        <Metric label="Active club needs" value={activeNeeds.length} />
        <Metric
          label="Signed-player matches"
          value={needs.reduce((sum, need) => sum + Number(need.match_count || 0), 0)}
        />
        <Metric
          label="Best signed-player match"
          value={`${Math.round(Math.max(0, ...needs.map((need) => Number(need.top_match_score || 0))))}%`}
        />
        <Metric label="Live Deal Rooms" value={deals.length} />
      </section>

      <div className="djm-os-toolbar">
        <div>
          <strong>Live club demand</strong>
          <span className="djm-os-toolbar-note">
            Capture requirements from WhatsApp first. Manual creation is the fallback.
          </span>
        </div>

        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            Refresh
          </button>
          <button className="djm-os-primary-button" onClick={() => setShowCreate((current) => !current)}>
            <Plus size={16} />
            Add club need
          </button>
        </div>
      </div>

      {deals.length ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head">
            <div>
              <h2>Closest to revenue</h2>
              <p>Only live situations that deserve commercial attention.</p>
            </div>
          </div>
          <div className="djm-os-list">
            {deals.slice(0, 8).map((deal) => (
              <Link
                key={deal.id}
                href={`/market/deals/${deal.id}`}
                className="djm-os-list-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{deal.title}</strong>
                  <p>{[deal.player_name, deal.organisation_name].filter(Boolean).join(' · ')}</p>
                  <small>
                    {deal.stage} · {deal.probability}% probability
                    {deal.primary_blocker ? ` · ${deal.primary_blocker}` : ''}
                  </small>
                </div>
                <div className="djm-os-score">
                  <b>
                    {deal.expected_commission != null
                      ? `${deal.currency} ${Number(deal.expected_commission).toLocaleString('en-GB')}`
                      : '—'}
                  </b>
                  <small>commission</small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {showCreate ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head">
            <div>
              <h2>Add club need</h2>
              <p>Only use this if the requirement was not captured automatically.</p>
            </div>
          </div>

          <form className="djm-os-form djm-os-form-grid" onSubmit={createNeed}>
            <label>
              Club
              <select
                value={form.organisation_id}
                onChange={(e) => setForm({ ...form, organisation_id: e.target.value })}
                required
              >
                <option value="">Select club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </label>
            <label>
              Position
              <input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="LCB, RW, ST, 6, 8, 10…"
                required
              />
            </label>
            <label>
              Requirement title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Fast left-footed winger" />
            </label>
            <label>
              Preferred foot
              <select value={form.preferred_foot} onChange={(e) => setForm({ ...form, preferred_foot: e.target.value })}>
                <option value="">Any</option>
                <option value="Left">Left</option>
                <option value="Right">Right</option>
                <option value="Both">Both</option>
              </select>
            </label>
            <label>
              Minimum age
              <input type="number" min="15" max="45" value={form.min_age} onChange={(e) => setForm({ ...form, min_age: e.target.value })} />
            </label>
            <label>
              Maximum age
              <input type="number" min="15" max="45" value={form.max_age} onChange={(e) => setForm({ ...form, max_age: e.target.value })} />
            </label>
            <label>
              Transfer type
              <select value={form.transfer_type} onChange={(e) => setForm({ ...form, transfer_type: e.target.value })}>
                <option value="">Unknown / flexible</option>
                <option value="permanent">Permanent</option>
                <option value="free">Free transfer</option>
                <option value="loan">Loan</option>
                <option value="free_or_loan">Free or loan</option>
              </select>
            </label>
            <label>
              Transfer budget
              <input type="number" min="0" value={form.transfer_budget} onChange={(e) => setForm({ ...form, transfer_budget: e.target.value })} />
            </label>
            <label>
              Salary budget
              <input type="number" min="0" value={form.salary_budget} onChange={(e) => setForm({ ...form, salary_budget: e.target.value })} />
            </label>
            <label>
              Currency
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option>EUR</option><option>GBP</option><option>USD</option><option>AUD</option><option>NZD</option><option>SEK</option><option>NOK</option>
              </select>
            </label>
            <label className="djm-os-span-2">
              Profile
              <textarea rows={4} value={form.profile_notes} onChange={(e) => setForm({ ...form, profile_notes: e.target.value })} placeholder="Style, level, athletic profile, urgency…" />
            </label>
            <label className="djm-os-span-2">
              Registration / passport
              <textarea rows={3} value={form.registration_notes} onChange={(e) => setForm({ ...form, registration_notes: e.target.value })} placeholder="EU passport, foreign slot, work permit…" />
            </label>
            <div className="djm-os-span-2">
              <button className="djm-os-primary-button" type="submit" disabled={busy}>
                <Target size={16} />
                Create and match
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="djm-os-market-layout">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Club needs</h2>
              <p>Select a requirement to see both player pools.</p>
            </div>
          </div>

          {needs.length ? (
            <div className="djm-os-list">
              {needs.map((need) => (
                <button
                  type="button"
                  className={`djm-os-need-row ${selectedNeed?.id === need.id ? 'is-selected' : ''}`}
                  key={need.id}
                  onClick={() => void openNeed(need)}
                >
                  <div>
                    <span className="djm-os-kicker">{need.organisation_name}</span>
                    <strong>{need.title || need.need_position}</strong>
                    <p>{[need.need_position, need.preferred_foot ? `${need.preferred_foot} foot` : null, need.transfer_type].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="djm-os-need-score">
                    <b>{need.match_count || 0}</b>
                    <small>signed matches</small>
                    <span>best {Math.round(Number(need.top_match_score || 0))}%</span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty"><BriefcaseBusiness size={25} /><p>No club needs yet.</p></div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>{selectedNeed ? `${selectedNeed.organisation_name} candidates` : 'Player candidates'}</h2>
              <p>
                {selectedNeed
                  ? 'Signed Players and unsigned Recruitment targets stay clearly separated.'
                  : 'Select a Club Need.'}
              </p>
            </div>
          </div>

          {selectedNeed ? (
            <>
              <div className="djm-os-tabs" style={{ margin: 14 }}>
                <button className={candidateTab === 'signed' ? 'is-active' : ''} onClick={() => setCandidateTab('signed')}>
                  Signed Players <span className="djm-os-tab-count">{candidates.signed_players?.length || 0}</span>
                </button>
                <button className={candidateTab === 'recruitment' ? 'is-active' : ''} onClick={() => setCandidateTab('recruitment')}>
                  Recruitment <span className="djm-os-tab-count">{candidates.recruitment_targets?.length || 0}</span>
                </button>
              </div>

              {currentCandidates.length ? (
                <div className="djm-os-list">
                  {currentCandidates.map((candidate: any) =>
                    candidateTab === 'signed' ? (
                      <article className="djm-os-match-card" key={candidate.match_id}>
                        <div className="djm-os-match-score">
                          {Math.round(Number(candidate.overall_score || 0))}
                          <small>/100</small>
                        </div>
                        <div className="djm-os-match-main">
                          <strong>{candidate.player_name}</strong>
                          <p>{[candidate.player_position, candidate.current_club].filter(Boolean).join(' · ')}</p>
                          <small>{candidate.match_status}</small>
                        </div>
                        <div className="djm-os-row-actions">
                          <button className="djm-os-mini-button" onClick={() => void openDealRoom(candidate)}>Open Deal Room</button>
                          <button className="djm-os-mini-button is-muted" onClick={() => void setMatchStatus(candidate.match_id, 'shortlisted')}>Shortlist</button>
                          <button className="djm-os-mini-button is-muted" onClick={() => void setMatchStatus(candidate.match_id, 'dismissed')}>Dismiss</button>
                        </div>
                      </article>
                    ) : (
                      <article className="djm-os-match-card" key={candidate.prospect_id}>
                        <div className="djm-os-match-score">
                          {candidate.match_score || 0}
                          <small>/100</small>
                        </div>
                        <div className="djm-os-match-main">
                          <strong>{candidate.full_name}</strong>
                          <p>{[candidate.primary_position, candidate.current_club].filter(Boolean).join(' · ')}</p>
                          <small>{candidate.recommendation || candidate.availability_status} · unsigned recruitment target</small>
                        </div>
                        <button className="djm-os-mini-button" onClick={() => void openDealRoom(candidate)}>
                          Open Deal Room
                        </button>
                      </article>
                    )
                  )}
                </div>
              ) : (
                <div className="djm-os-empty">
                  <UsersRound size={25} />
                  <p>No candidates in this player pool yet.</p>
                </div>
              )}

              <div className="djm-os-danger-zone">
                <button className="djm-os-mini-button is-muted" onClick={() => void setNeedStatus(selectedNeed.id, 'filled')}>
                  <CheckCircle2 size={14} /> Mark filled
                </button>
                <button className="djm-os-mini-button is-muted" onClick={() => void setNeedStatus(selectedNeed.id, 'closed')}>
                  Close need
                </button>
                <button className="djm-os-mini-button is-muted" onClick={() => void deleteNeed()}>
                  Delete bad/duplicate need
                </button>
              </div>
            </>
          ) : (
            <div className="djm-os-empty"><Target size={25} /><p>Choose a requirement from the left.</p></div>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="djm-os-metric"><strong>{value}</strong><span>{label}</span></div>;
}
