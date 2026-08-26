'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Plus,
  RefreshCw,
  Target,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import {
  djmRpc,
  friendlyError,
} from '@/lib/djm-os';

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
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_NEED);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', {
          p_search: null,
          p_limit: 250,
        }),
      ]);
      setNeeds(needData || []);
      setClubs(clubData || []);
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
      const data = await djmRpc<any[]>('djm_market_matches', {
        p_need_id: need.id,
      });
      setMatches(data || []);
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
        p_transfer_budget: form.transfer_budget
          ? Number(form.transfer_budget)
          : null,
        p_salary_budget: form.salary_budget
          ? Number(form.salary_budget)
          : null,
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
      if (selectedNeed?.id === needId) setSelectedNeed(null);
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

  const activeNeeds = useMemo(
    () =>
      needs.filter((need) =>
        ['active', 'open', 'confirmed'].includes(need.need_status),
      ),
    [needs],
  );

  return (
    <DjmOsShell
      eyebrow="Demand × players × access"
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
          label="Player matches"
          value={needs.reduce(
            (sum, need) => sum + Number(need.match_count || 0),
            0,
          )}
        />
        <Metric
          label="Strongest current match"
          value={`${Math.round(
            Math.max(0, ...needs.map((need) => Number(need.top_match_score || 0))),
          )}%`}
        />
      </section>

      <div className="djm-os-toolbar">
        <div>
          <strong>Live market</strong>
          <span className="djm-os-toolbar-note">
            Needs should come from conversations where possible. Manual creation is the fallback.
          </span>
        </div>

        <div className="djm-os-button-row">
          <button
            className="djm-os-secondary-button"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            Refresh
          </button>
          <button
            className="djm-os-primary-button"
            onClick={() => setShowCreate((current) => !current)}
          >
            <Plus size={16} />
            Add need
          </button>
        </div>
      </div>

      {showCreate ? (
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Create a club need</h2>
              <p>Use this only when it was not captured automatically.</p>
            </div>
          </div>

          <form className="djm-os-form djm-os-form-grid" onSubmit={createNeed}>
            <label>
              Club
              <select
                value={form.organisation_id}
                onChange={(e) =>
                  setForm({ ...form, organisation_id: e.target.value })
                }
                required
              >
                <option value="">Select club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
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
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Fast left-footed winger"
              />
            </label>
            <label>
              Preferred foot
              <select
                value={form.preferred_foot}
                onChange={(e) =>
                  setForm({ ...form, preferred_foot: e.target.value })
                }
              >
                <option value="">Any</option>
                <option value="Left">Left</option>
                <option value="Right">Right</option>
                <option value="Both">Both</option>
              </select>
            </label>
            <label>
              Minimum age
              <input
                type="number"
                min="15"
                max="45"
                value={form.min_age}
                onChange={(e) => setForm({ ...form, min_age: e.target.value })}
              />
            </label>
            <label>
              Maximum age
              <input
                type="number"
                min="15"
                max="45"
                value={form.max_age}
                onChange={(e) => setForm({ ...form, max_age: e.target.value })}
              />
            </label>
            <label>
              Transfer type
              <select
                value={form.transfer_type}
                onChange={(e) =>
                  setForm({ ...form, transfer_type: e.target.value })
                }
              >
                <option value="">Unknown / flexible</option>
                <option value="permanent">Permanent</option>
                <option value="free">Free transfer</option>
                <option value="loan">Loan</option>
                <option value="free_or_loan">Free or loan</option>
              </select>
            </label>
            <label>
              Transfer budget
              <input
                type="number"
                min="0"
                value={form.transfer_budget}
                onChange={(e) =>
                  setForm({ ...form, transfer_budget: e.target.value })
                }
                placeholder="500000"
              />
            </label>
            <label>
              Salary budget
              <input
                type="number"
                min="0"
                value={form.salary_budget}
                onChange={(e) =>
                  setForm({ ...form, salary_budget: e.target.value })
                }
                placeholder="300000"
              />
            </label>
            <label>
              Currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option>EUR</option>
                <option>GBP</option>
                <option>USD</option>
                <option>AUD</option>
                <option>NZD</option>
                <option>SEK</option>
                <option>NOK</option>
              </select>
            </label>
            <label className="djm-os-span-2">
              Profile
              <textarea
                rows={4}
                value={form.profile_notes}
                onChange={(e) =>
                  setForm({ ...form, profile_notes: e.target.value })
                }
                placeholder="Style, physical profile, experience, urgency…"
              />
            </label>
            <label className="djm-os-span-2">
              Registration / passport notes
              <textarea
                rows={3}
                value={form.registration_notes}
                onChange={(e) =>
                  setForm({ ...form, registration_notes: e.target.value })
                }
                placeholder="EU passport required, foreign slot, work permit…"
              />
            </label>
            <div className="djm-os-span-2">
              <button
                type="submit"
                className="djm-os-primary-button"
                disabled={busy}
              >
                <Target size={16} />
                Create and match players
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
              <p>Click any requirement to see player matches.</p>
            </div>
          </div>

          {needs.length ? (
            <div className="djm-os-list">
              {needs.map((need) => (
                <button
                  type="button"
                  className={`djm-os-need-row ${
                    selectedNeed?.id === need.id ? 'is-selected' : ''
                  }`}
                  key={need.id}
                  onClick={() => void openNeed(need)}
                >
                  <div>
                    <span className="djm-os-kicker">
                      {need.organisation_name}
                    </span>
                    <strong>{need.title || need.need_position}</strong>
                    <p>
                      {[
                        need.need_position,
                        need.preferred_foot
                          ? `${need.preferred_foot} foot`
                          : null,
                        need.transfer_type,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="djm-os-need-score">
                    <b>{need.match_count || 0}</b>
                    <small>matches</small>
                    <span>
                      best {Math.round(Number(need.top_match_score || 0))}%
                    </span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <BriefcaseBusiness size={25} />
              <p>No club needs yet.</p>
            </div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>
                {selectedNeed
                  ? `${selectedNeed.organisation_name} matches`
                  : 'Player matches'}
              </h2>
              <p>
                {selectedNeed
                  ? 'Transparent first-pass fit from DJM Player data.'
                  : 'Select a Club Need.'}
              </p>
            </div>
          </div>

          {selectedNeed ? (
            <>
              <div className="djm-os-need-summary">
                <div>
                  <span>POSITION</span>
                  <strong>{selectedNeed.need_position}</strong>
                </div>
                <div>
                  <span>STATUS</span>
                  <strong>{selectedNeed.need_status}</strong>
                </div>
                <div>
                  <span>TOP MATCH</span>
                  <strong>
                    {Math.round(Number(selectedNeed.top_match_score || 0))}%
                  </strong>
                </div>
              </div>

              {matches.length ? (
                <div className="djm-os-list">
                  {matches.map((match) => (
                    <article className="djm-os-match-card" key={match.match_id}>
                      <div className="djm-os-match-score">
                        {Math.round(Number(match.overall_score || 0))}
                        <small>/100</small>
                      </div>
                      <div className="djm-os-match-main">
                        <strong>{match.player_name}</strong>
                        <p>
                          {[match.player_position, match.current_club]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <small>
                          {match.preferred_foot
                            ? `${match.preferred_foot} foot · `
                            : ''}
                          {match.match_status}
                        </small>
                      </div>
                      <div className="djm-os-row-actions">
                        <button
                          className="djm-os-mini-button"
                          onClick={() =>
                            void setMatchStatus(match.match_id, 'shortlisted')
                          }
                        >
                          Shortlist
                        </button>
                        <button
                          className="djm-os-mini-button is-muted"
                          onClick={() =>
                            void setMatchStatus(match.match_id, 'dismissed')
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="djm-os-empty">
                  <UsersRound size={25} />
                  <p>No represented-player matches yet.</p>
                </div>
              )}

              <div className="djm-os-danger-zone">
                <button
                  className="djm-os-mini-button is-muted"
                  onClick={() =>
                    void setNeedStatus(selectedNeed.id, 'filled')
                  }
                >
                  <CheckCircle2 size={14} />
                  Mark filled
                </button>
                <button
                  className="djm-os-mini-button is-muted"
                  onClick={() =>
                    void setNeedStatus(selectedNeed.id, 'closed')
                  }
                >
                  Close need
                </button>
              </div>
            </>
          ) : (
            <div className="djm-os-empty">
              <Target size={25} />
              <p>Choose a requirement from the left.</p>
            </div>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="djm-os-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
