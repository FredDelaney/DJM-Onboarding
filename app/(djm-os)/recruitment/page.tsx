'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';

const STAGES = [
  ['identified', 'Identified'],
  ['researching', 'Researching'],
  ['ready_to_contact', 'Ready to contact'],
  ['contacted', 'Contacted'],
  ['replied', 'Replied'],
  ['call_booked', 'Call booked'],
  ['interested', 'Interested'],
  ['terms_discussed', 'Terms discussed'],
  ['agreement_sent', 'Agreement sent'],
  ['negotiating', 'Negotiating'],
  ['signed', 'Signed'],
  ['paused', 'Paused'],
  ['declined', 'Declined'],
  ['lost', 'Lost'],
] as const;

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
  instagram_url: '',
  whatsapp: '',
  email: '',
  agent_status: '',
  agent_name: '',
  availability_status: 'unknown',
  recruitment_priority: '3',
  market_value: '',
  market_value_currency: 'EUR',
  notes: '',
};

export default function RecruitmentPage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [targetData, dashData] = await Promise.all([
        djmRpc<any[]>('djm_recruitment_targets', {
          p_search: null,
          p_stage: null,
          p_limit: 300,
        }),
        djmRpc('djm_recruitment_dashboard'),
      ]);
      setTargets(targetData || []);
      setDashboard(dashData || null);
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
    return targets.filter((p) => {
      const stageOk = !stageFilter || p.recruitment_stage === stageFilter;
      const searchOk =
        !q ||
        [
          p.full_name,
          p.current_club,
          p.current_country,
          p.primary_position,
          p.nationality,
          p.agent_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      return stageOk && searchOk;
    });
  }, [targets, search, stageFilter]);

  const createTarget = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim()) return;

    setBusy(true);
    setError('');
    try {
      const created: any = await djmRpc('djm_recruitment_upsert_target', {
        p_full_name: form.full_name.trim(),
        p_date_of_birth: form.date_of_birth || null,
        p_nationality: form.nationality || null,
        p_current_club: form.current_club || null,
        p_current_country: form.current_country || null,
        p_primary_position: form.primary_position || null,
        p_secondary_positions: form.secondary_positions
          ? form.secondary_positions.split(',').map((x: string) => x.trim()).filter(Boolean)
          : [],
        p_preferred_foot: form.preferred_foot || null,
        p_contract_expiry: form.contract_expiry || null,
        p_transfermarkt_url: form.transfermarkt_url || null,
        p_instagram_url: form.instagram_url || null,
        p_whatsapp: form.whatsapp || null,
        p_email: form.email || null,
        p_agent_status: form.agent_status || null,
        p_agent_name: form.agent_name || null,
        p_availability_status: form.availability_status || 'unknown',
        p_recruitment_priority: Number(form.recruitment_priority || 3),
        p_recruitment_source: 'manual',
        p_notes: form.notes || null,
      });

      if (created?.prospect_id && (form.market_value !== '' || form.transfermarkt_url || form.whatsapp)) {
        await djmRpc('djm_recruitment_update_profile', {
          p_prospect_id: created.prospect_id,
          p_transfermarkt_url: form.transfermarkt_url || null,
          p_market_value: form.market_value === '' ? null : Number(form.market_value),
          p_market_value_currency: form.market_value_currency || null,
          p_whatsapp: form.whatsapp || null,
          p_instagram_url: form.instagram_url || null,
          p_email: form.email || null,
          p_agent_status: form.agent_status || null,
          p_agent_name: form.agent_name || null,
          p_contract_expiry: form.contract_expiry || null,
          p_current_club: form.current_club || null,
          p_current_country: form.current_country || null,
          p_primary_position: form.primary_position || null,
          p_date_of_birth: form.date_of_birth || null,
          p_nationality: form.nationality || null,
          p_preferred_foot: form.preferred_foot || null,
        });
      }

      setForm(EMPTY);
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const summary = dashboard?.summary || {};

  return (
    <DjmOsShell
      eyebrow="Unsigned players DJM is trying to sign"
      title="DJM Recruitment"
    >
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <section className="djm-os-metrics">
        <Metric label="Active targets" value={Number(summary.active || 0)} />
        <Metric label="Hot targets" value={Number(summary.hot || 0)} />
        <Metric label="Overdue" value={Number(summary.overdue || 0)} />
        <Metric label="High priority untouched" value={Number(summary.untouched_high_priority || 0)} />
      </section>

      <div className="djm-os-toolbar">
        <div className="djm-os-button-row" style={{ flex: 1 }}>
          <label className="djm-os-search djm-os-search-wide">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unsigned players"
            />
          </label>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{
              minHeight: 40,
              border: '1px solid var(--djm-line)',
              borderRadius: 10,
              background: 'white',
              padding: '0 10px',
            }}
          >
            <option value="">All stages</option>
            {STAGES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
          </button>
          <button className="djm-os-primary-button" onClick={() => setShowCreate((current) => !current)}>
            <UserPlus size={16} />
            Add recruitment target
          </button>
        </div>
      </div>

      {showCreate ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head">
            <div>
              <h2>Add unsigned player</h2>
              <p>For someone DJM may want to represent. Signed players stay in DJM Player.</p>
            </div>
            <button className="djm-os-mini-button is-muted" onClick={() => setShowCreate(false)}>Close</button>
          </div>

          <form className="djm-os-form djm-os-form-grid" onSubmit={createTarget}>
            <label>Full name<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
            <label>Date of birth<input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
            <label>Nationality<input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></label>
            <label>Current club<input value={form.current_club} onChange={(e) => setForm({ ...form, current_club: e.target.value })} /></label>
            <label>Country<input value={form.current_country} onChange={(e) => setForm({ ...form, current_country: e.target.value })} /></label>
            <label>Position<input value={form.primary_position} onChange={(e) => setForm({ ...form, primary_position: e.target.value })} /></label>
            <label>Secondary positions<input value={form.secondary_positions} onChange={(e) => setForm({ ...form, secondary_positions: e.target.value })} placeholder="RW, LW, AM" /></label>
            <label>Preferred foot<select value={form.preferred_foot} onChange={(e) => setForm({ ...form, preferred_foot: e.target.value })}><option value="">Unknown</option><option>Left</option><option>Right</option><option>Both</option></select></label>
            <label>Contract expiry<input type="date" value={form.contract_expiry} onChange={(e) => setForm({ ...form, contract_expiry: e.target.value })} /></label>
            <label>Transfermarkt value<input type="number" min="0" value={form.market_value} onChange={(e) => setForm({ ...form, market_value: e.target.value })} placeholder="750000" /></label>
            <label>Value currency<select value={form.market_value_currency} onChange={(e) => setForm({ ...form, market_value_currency: e.target.value })}><option>EUR</option><option>GBP</option><option>USD</option><option>AUD</option><option>NZD</option><option>SEK</option></select></label>
            <label>Priority<select value={form.recruitment_priority} onChange={(e) => setForm({ ...form, recruitment_priority: e.target.value })}><option value="1">1 - Low</option><option value="2">2</option><option value="3">3 - Normal</option><option value="4">4 - High</option><option value="5">5 - Priority target</option></select></label>
            <label>Transfermarkt<input value={form.transfermarkt_url} onChange={(e) => setForm({ ...form, transfermarkt_url: e.target.value })} /></label>
            <label>Instagram<input value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} /></label>
            <label>WhatsApp<input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Representation status<input value={form.agent_status} onChange={(e) => setForm({ ...form, agent_status: e.target.value })} placeholder="Unknown / represented / free" /></label>
            <label>Current agent<input value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} /></label>
            <label>Approachability<select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })}><option value="unknown">Unknown</option><option value="monitor">Monitor</option><option value="approachable">Approachable</option><option value="available">Available</option><option value="represented">Represented</option><option value="not_interested">Not interested</option><option value="do_not_contact">Do not contact</option></select></label>
            <label className="djm-os-span-2">Recruitment notes<textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Why DJM wants him, route in, situation, relationship, concerns…" /></label>
            <div className="djm-os-span-2">
              <button className="djm-os-primary-button" type="submit" disabled={busy}>
                <Plus size={15} /> Add recruitment target
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Priority targets</h2>
              <p>Who DJM should be thinking about now.</p>
            </div>
          </div>
          {(dashboard?.priority_targets || []).length ? (
            <div className="djm-os-list">
              {dashboard.priority_targets.slice(0, 10).map((target: any) => (
                <Link
                  key={target.id}
                  href={`/recruitment/${target.id}`}
                  className="djm-os-list-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div>
                    <strong>{target.full_name}</strong>
                    <p>{[target.primary_position, target.current_club].filter(Boolean).join(' · ')}</p>
                    <small>{String(target.recruitment_stage).replaceAll('_', ' ')}{target.next_action_at ? ` · next ${compactDateTime(target.next_action_at)}` : ''}</small>
                  </div>
                  <div className="djm-os-score"><b>{target.priority_score || 0}</b><small>priority</small></div>
                </Link>
              ))}
            </div>
          ) : <Empty text="No priority targets yet." />}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Unsigned player pipeline</h2>
              <p>Everyone DJM is considering or actively trying to sign.</p>
            </div>
          </div>
          {filtered.length ? (
            <div className="djm-os-list">
              {filtered.map((target) => (
                <Link
                  href={`/recruitment/${target.id}`}
                  className="djm-os-list-row"
                  key={target.id}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{target.full_name}</strong>
                    <p>
                      {[target.primary_position, target.current_club, target.current_country]
                        .filter(Boolean)
                        .join(' · ') || 'Profile being built'}
                    </p>
                    <small>
                      Priority {target.recruitment_priority || 3}/5 · {String(target.recruitment_stage || 'identified').replaceAll('_', ' ')}
                      {target.next_action_at ? ` · next ${compactDateTime(target.next_action_at)}` : ''}
                    </small>
                  </div>
                </Link>
              ))}
            </div>
          ) : <Empty text="No unsigned players match this view." />}
        </section>
      </div>
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="djm-os-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="djm-os-empty"><UsersRound size={25} /><p>{text}</p></div>;
}
