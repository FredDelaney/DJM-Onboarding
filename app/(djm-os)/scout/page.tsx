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
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserSearch,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { djmRpc, friendlyError } from '@/lib/djm-os';

const EMPTY = {
  full_name: '',
  date_of_birth: '',
  nationality: '',
  current_club: '',
  current_country: '',
  primary_position: '',
  secondary_positions: '',
  preferred_foot: '',
  contract_expiry: '',
  transfermarkt_url: '',
  wyscout_url: '',
  video_url: '',
  instagram_url: '',
  agent_status: '',
  agent_name: '',
  availability_status: 'unknown',
  notes: '',
};

export default function ScoutPage() {
  const [prospects, setProspects] = useState<any[]>([]);
  const [needs, setNeeds] = useState<any[]>([]);
  const [needMatches, setNeedMatches] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [prospectData, needData] = await Promise.all([
        djmRpc<any[]>('djm_scout_prospects', {
          p_search: null,
          p_status: null,
          p_limit: 200,
        }),
        djmRpc<any[]>('djm_market_needs', { p_status: null }),
      ]);
      setProspects(prospectData || []);
      setNeeds(needData || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prospects;
    return prospects.filter((p) =>
      [
        p.full_name,
        p.current_club,
        p.current_country,
        p.primary_position,
        p.nationality,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [prospects, search]);

  const createProspect = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.full_name) return;

    setBusy(true);
    try {
      await djmRpc('djm_scout_upsert_prospect', {
        p_full_name: form.full_name,
        p_date_of_birth: form.date_of_birth || null,
        p_nationality: form.nationality || null,
        p_current_club: form.current_club || null,
        p_current_country: form.current_country || null,
        p_primary_position: form.primary_position || null,
        p_secondary_positions: form.secondary_positions
          ? form.secondary_positions
              .split(',')
              .map((x: string) => x.trim())
              .filter(Boolean)
          : [],
        p_preferred_foot: form.preferred_foot || null,
        p_contract_expiry: form.contract_expiry || null,
        p_transfermarkt_url: form.transfermarkt_url || null,
        p_wyscout_url: form.wyscout_url || null,
        p_video_url: form.video_url || null,
        p_instagram_url: form.instagram_url || null,
        p_agent_status: form.agent_status || null,
        p_agent_name: form.agent_name || null,
        p_availability_status: form.availability_status || 'unknown',
        p_source: 'manual_djm_os',
        p_notes: form.notes || null,
      });
      setForm(EMPTY);
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const matchNeed = async (needId: string) => {
    setSelectedNeed(needId);
    if (!needId) {
      setNeedMatches([]);
      return;
    }

    try {
      const data = await djmRpc<any[]>('djm_scout_need_matches', {
        p_need_id: needId,
      });
      setNeedMatches(data || []);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <DjmOsShell
      eyebrow="Potential talent before representation"
      title="DJM Scout"
    >
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="djm-os-toolbar">
        <label className="djm-os-search djm-os-search-wide">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prospects"
          />
        </label>
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
            Add prospect
          </button>
        </div>
      </div>

      <section className="djm-os-metrics">
        <Metric label="Tracked prospects" value={prospects.length} />
        <Metric
          label="Available / interesting"
          value={
            prospects.filter((p) =>
              ['available', 'open', 'interesting'].includes(
                String(p.availability_status || '').toLowerCase(),
              ),
            ).length
          }
        />
        <Metric
          label="With reports"
          value={prospects.filter((p) => Number(p.reports_count || 0) > 0).length}
        />
      </section>

      {showCreate ? (
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Add scouting prospect</h2>
              <p>A light record now can become a full DJM Player later.</p>
            </div>
          </div>

          <form className="djm-os-form djm-os-form-grid" onSubmit={createProspect}>
            <label>
              Full name
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) =>
                  setForm({ ...form, date_of_birth: e.target.value })
                }
              />
            </label>
            <label>
              Nationality
              <input
                value={form.nationality}
                onChange={(e) =>
                  setForm({ ...form, nationality: e.target.value })
                }
              />
            </label>
            <label>
              Current club
              <input
                value={form.current_club}
                onChange={(e) =>
                  setForm({ ...form, current_club: e.target.value })
                }
              />
            </label>
            <label>
              Country
              <input
                value={form.current_country}
                onChange={(e) =>
                  setForm({ ...form, current_country: e.target.value })
                }
              />
            </label>
            <label>
              Primary position
              <input
                value={form.primary_position}
                onChange={(e) =>
                  setForm({ ...form, primary_position: e.target.value })
                }
              />
            </label>
            <label>
              Secondary positions
              <input
                value={form.secondary_positions}
                onChange={(e) =>
                  setForm({ ...form, secondary_positions: e.target.value })
                }
                placeholder="RW, LW, AM"
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
                <option value="">Unknown</option>
                <option>Left</option>
                <option>Right</option>
                <option>Both</option>
              </select>
            </label>
            <label>
              Transfermarkt
              <input
                value={form.transfermarkt_url}
                onChange={(e) =>
                  setForm({ ...form, transfermarkt_url: e.target.value })
                }
              />
            </label>
            <label>
              Wyscout
              <input
                value={form.wyscout_url}
                onChange={(e) =>
                  setForm({ ...form, wyscout_url: e.target.value })
                }
              />
            </label>
            <label>
              Agent status
              <input
                value={form.agent_status}
                onChange={(e) =>
                  setForm({ ...form, agent_status: e.target.value })
                }
                placeholder="Unknown, represented, free…"
              />
            </label>
            <label>
              Availability
              <select
                value={form.availability_status}
                onChange={(e) =>
                  setForm({ ...form, availability_status: e.target.value })
                }
              >
                <option value="unknown">Unknown</option>
                <option value="interesting">Interesting</option>
                <option value="open">Open</option>
                <option value="available">Available</option>
                <option value="not_available">Not available</option>
              </select>
            </label>
            <label className="djm-os-span-2">
              Notes
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <div className="djm-os-span-2">
              <button className="djm-os-primary-button" type="submit">
                <Sparkles size={16} />
                Add prospect
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Prospect universe</h2>
              <p>Players DJM knows about but does not necessarily represent.</p>
            </div>
          </div>

          {filtered.length ? (
            <div className="djm-os-list">
              {filtered.map((prospect) => (
                <article className="djm-os-list-row" key={prospect.id}>
                  <div>
                    <strong>{prospect.full_name}</strong>
                    <p>
                      {[
                        prospect.primary_position,
                        prospect.current_club,
                        prospect.current_country,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Profile being built'}
                    </p>
                    <small>
                      {prospect.availability_status || 'unknown'} ·{' '}
                      {prospect.agent_status || 'agent unknown'} ·{' '}
                      {prospect.reports_count || 0} reports
                    </small>
                  </div>
                  {prospect.average_football_score != null ? (
                    <div className="djm-os-score">
                      <b>{Math.round(Number(prospect.average_football_score))}</b>
                      <small>football</small>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <UserSearch size={25} />
              <p>No prospects match the search.</p>
            </div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Scout against live demand</h2>
              <p>Find prospects that could satisfy current Club Needs.</p>
            </div>
          </div>

          <label className="djm-os-form djm-os-single-field">
            Club need
            <select
              value={selectedNeed}
              onChange={(e) => void matchNeed(e.target.value)}
            >
              <option value="">Choose need</option>
              {needs.map((need) => (
                <option key={need.id} value={need.id}>
                  {need.organisation_name} · {need.need_position}
                </option>
              ))}
            </select>
          </label>

          {selectedNeed ? (
            needMatches.length ? (
              <div className="djm-os-list">
                {needMatches.map((prospect) => (
                  <article className="djm-os-match-card" key={prospect.prospect_id}>
                    <div className="djm-os-match-score">
                      {prospect.match_score || 0}
                      <small>/100</small>
                    </div>
                    <div className="djm-os-match-main">
                      <strong>{prospect.full_name}</strong>
                      <p>
                        {[prospect.primary_position, prospect.current_club]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <small>
                        {prospect.recommendation || prospect.availability_status}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="djm-os-empty">
                <UserSearch size={25} />
                <p>No prospect matches found for this need.</p>
              </div>
            )
          ) : (
            <div className="djm-os-empty">
              <UserSearch size={25} />
              <p>Choose a Club Need to run Scout matching.</p>
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
  value: number | string;
}) {
  return (
    <div className="djm-os-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
