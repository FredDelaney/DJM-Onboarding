'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';

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
  ['paused', 'Paused'],
  ['declined', 'Declined'],
  ['lost', 'Lost'],
] as const;

const EMPTY_MANUAL = {
  full_name: '',
  current_club: '',
  current_country: '',
  primary_position: '',
  whatsapp: '',
  instagram_url: '',
  email: '',
  notes: '',
  recruitment_priority: '3',
};

export default function RecruitmentPage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState(false);
  const [tmUrl, setTmUrl] = useState('');
  const [priority, setPriority] = useState('3');
  const [note, setNote] = useState('');
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [targetData, dashData] = await Promise.all([
        djmRpc<any[]>('djm_recruitment_targets', { p_search: null, p_stage: null, p_limit: 300 }),
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
      const searchOk = !q || [p.full_name, p.current_club, p.current_country, p.primary_position, p.nationality, p.agent_name]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
      return stageOk && searchOk;
    });
  }, [targets, search, stageFilter]);

  const addFromTransfermarkt = async (event: FormEvent) => {
    event.preventDefault();
    if (!tmUrl.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result: any = await djmRpc('djm_recruitment_quick_add', {
        p_transfermarkt_url: tmUrl.trim(),
        p_priority: Number(priority || 3),
        p_notes: note.trim() || null,
      });

      let enrichMessage = 'Saved and queued for Transfermarkt enrichment.';
      try {
        const enriched: any = await djmInvoke('djm-transfermarkt-enrich', {
          prospect_id: result.prospect_id,
          url: tmUrl.trim(),
        });
        enrichMessage = enriched?.blocked
          ? 'Saved. Transfermarkt blocked the instant read, so DJM kept it queued for verification.'
          : 'Saved and enriched from Transfermarkt.';
      } catch {
        // The database trigger already queued the URL. Saving the target is the important action.
      }

      setMessage(`${result.created ? 'Player added.' : 'Existing player found.'} ${enrichMessage}`);
      setTmUrl('');
      setNote('');
      setPriority('3');
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const addManual = async (event: FormEvent) => {
    event.preventDefault();
    if (!manualForm.full_name.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await djmRpc('djm_recruitment_upsert_target', {
        p_full_name: manualForm.full_name.trim(),
        p_date_of_birth: null,
        p_nationality: null,
        p_current_club: manualForm.current_club.trim() || null,
        p_current_country: manualForm.current_country.trim() || null,
        p_primary_position: manualForm.primary_position.trim() || null,
        p_secondary_positions: [],
        p_preferred_foot: null,
        p_contract_expiry: null,
        p_transfermarkt_url: null,
        p_instagram_url: manualForm.instagram_url.trim() || null,
        p_whatsapp: manualForm.whatsapp.trim() || null,
        p_email: manualForm.email.trim() || null,
        p_agent_status: null,
        p_agent_name: null,
        p_availability_status: 'unknown',
        p_recruitment_priority: Number(manualForm.recruitment_priority || 3),
        p_recruitment_source: 'manual_fallback',
        p_notes: manualForm.notes.trim() || null,
      });
      setManualForm(EMPTY_MANUAL);
      setShowAdd(false);
      setManual(false);
      setMessage('Player added manually. Add a Transfermarkt link later and DJM will enrich the profile.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const summary = dashboard?.summary || {};

  return (
    <DjmOsShell eyebrow="Unsigned players DJM is trying to win" title="Recruitment">
      {error ? (
        <div className="djm-os-error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>
      ) : null}
      {message ? <div className="djm-os-capture-status" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="djm-os-metrics">
        <Metric label="Active" value={Number(summary.active || 0)} />
        <Metric label="Hot" value={Number(summary.hot || 0)} />
        <Metric label="Overdue" value={Number(summary.overdue || 0)} attention={Number(summary.overdue || 0) > 0} />
        <Metric label="High priority untouched" value={Number(summary.untouched_high_priority || 0)} />
      </section>

      <div className="djm-os-toolbar">
        <div style={{ flex: 1 }}>
          <strong>Transfermarkt first</strong>
          <span className="djm-os-toolbar-note">Normally paste one link. DJM fills the profile and avoids duplicate targets.</span>
        </div>
        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />Refresh</button>
          <button className="djm-os-primary-button" onClick={() => setShowAdd((x) => !x)}><Plus size={16} />Add player</button>
        </div>
      </div>

      {showAdd ? (
        <section className="djm-os-panel" style={{ marginBottom: 16 }}>
          <div className="djm-os-panel-head">
            <div><h2>{manual ? 'Manual fallback' : 'Add from Transfermarkt'}</h2><p>{manual ? 'Use this only when there is no useful profile link yet.' : 'Paste the player profile. DJM does the rest.'}</p></div>
            <UserPlus size={20} />
          </div>

          {!manual ? (
            <form className="djm-os-form" onSubmit={addFromTransfermarkt}>
              <label>Transfermarkt player URL<input value={tmUrl} onChange={(e) => setTmUrl(e.target.value)} placeholder="https://www.transfermarkt.com/.../profil/spieler/..." /></label>
              <div className="djm-os-form-grid">
                <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)}>{[5,4,3,2,1].map((x) => <option key={x} value={x}>{x}{x === 5 ? ' · highest' : ''}</option>)}</select></label>
                <label>Optional note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are we interested?" /></label>
              </div>
              <div className="djm-os-button-row">
                <button className="djm-os-primary-button" type="submit" disabled={busy || !tmUrl.trim()}>{busy ? 'Adding…' : 'Add & autofill'}</button>
                <button className="djm-os-secondary-button" type="button" onClick={() => setManual(true)}>No Transfermarkt link</button>
              </div>
            </form>
          ) : (
            <form className="djm-os-form" onSubmit={addManual}>
              <div className="djm-os-form-grid">
                <label>Player name<input required value={manualForm.full_name} onChange={(e) => setManualForm({ ...manualForm, full_name: e.target.value })} /></label>
                <label>Current club<input value={manualForm.current_club} onChange={(e) => setManualForm({ ...manualForm, current_club: e.target.value })} /></label>
                <label>Position<input value={manualForm.primary_position} onChange={(e) => setManualForm({ ...manualForm, primary_position: e.target.value })} /></label>
                <label>Country<input value={manualForm.current_country} onChange={(e) => setManualForm({ ...manualForm, current_country: e.target.value })} /></label>
                <label>WhatsApp<input value={manualForm.whatsapp} onChange={(e) => setManualForm({ ...manualForm, whatsapp: e.target.value })} /></label>
                <label>Instagram<input value={manualForm.instagram_url} onChange={(e) => setManualForm({ ...manualForm, instagram_url: e.target.value })} /></label>
                <label>Email<input value={manualForm.email} onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })} /></label>
                <label>Priority<select value={manualForm.recruitment_priority} onChange={(e) => setManualForm({ ...manualForm, recruitment_priority: e.target.value })}>{[5,4,3,2,1].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
              </div>
              <label>Notes<textarea rows={3} value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} /></label>
              <div className="djm-os-button-row">
                <button className="djm-os-primary-button" type="submit" disabled={busy || !manualForm.full_name.trim()}>Save player</button>
                <button className="djm-os-secondary-button" type="button" onClick={() => setManual(false)}>Use Transfermarkt instead</button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <div className="djm-os-toolbar">
        <label className="djm-os-search djm-os-search-wide" style={{ flex: 1 }}><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recruitment" /></label>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ minHeight: 40 }}><option value="">All stages</option>{STAGES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>

      {filtered.length ? (
        <section className="djm-os-panel">
          <div className="djm-os-list">
            {filtered.map((target) => (
              <Link href={`/recruitment/${target.id}`} className="djm-os-list-row" style={{ textDecoration: 'none', color: 'inherit' }} key={target.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{target.full_name}</strong>
                  <p>{[target.primary_position, target.current_club, target.current_country].filter(Boolean).join(' · ') || 'Profile being built'}</p>
                  <small>
                    {stageLabel(target.recruitment_stage)} · priority {target.recruitment_priority || 3}
                    {target.next_action_at ? ` · next ${compactDateTime(target.next_action_at)}` : ' · no next action'}
                  </small>
                </div>
                <div className="djm-os-score"><b>{target.recruitment_priority || 3}</b><small>priority</small></div>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="djm-os-empty"><CheckCircle2 size={25} /><p>No recruitment targets match this view.</p></div>
      )}
    </DjmOsShell>
  );
}

function stageLabel(value?: string) {
  return STAGES.find(([key]) => key === value)?.[1] || String(value || 'Identified').replaceAll('_', ' ');
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className="djm-os-metric" style={attention ? { borderColor: 'rgba(244,196,48,.7)', background: 'rgba(244,196,48,.08)' } : undefined}><strong>{value}</strong><span>{label}</span></div>;
}
