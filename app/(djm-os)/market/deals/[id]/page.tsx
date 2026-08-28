'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import ResearchLinkRail from '@/components/ResearchLinkRail';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { buildResearchLinks } from '@/lib/research-links';

const STAGES = [
  'potential',
  'pitched',
  'talking',
  'trial',
  'negotiation',
  'offer',
  'paused',
] as const;

const EMPTY_PITCH = {
  message: '',
  expires_at: '',
  profile: true,
  stats: true,
  career: true,
  videos: true,
  documents: false,
};

type PitchForm = typeof EMPTY_PITCH;

export default function OpportunityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [needs, setNeeds] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [identityKind, setIdentityKind] = useState<'player' | 'recruitment'>('player');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPitchCreator, setShowPitchCreator] = useState(false);
  const [pitchForm, setPitchForm] = useState<PitchForm>(() => ({
    ...EMPTY_PITCH,
    expires_at: localInputFromDate(new Date(Date.now() + 30 * 86400000)),
  }));
  const [editingPitchId, setEditingPitchId] = useState<string | null>(null);
  const [pitchEdits, setPitchEdits] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [result, team, clubData, contactData, needData, playerData, prospectData] = await Promise.all([
        djmRpc<any>('djm_opportunity', { p_opportunity_id: id }),
        djmRpc<any[]>('djm_team_members_list'),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 250 }),
        djmRpc<any[]>('djm_network_club_contacts', { p_search: null, p_limit: 500 }),
        djmRpc<any[]>('djm_market_needs_v2', { p_status: null }),
        djmRpc<any[]>('djm_signed_player_directory', { p_search: null, p_limit: 500 }),
        djmRpc<any[]>('djm_recruitment_targets', { p_search: null, p_stage: null, p_limit: 500 }),
      ]);

      setData(result || null);
      setTeamMembers(team || []);
      setClubs((clubData || []).filter((club: any) => club.organisation_type === 'club'));
      setContacts(contactData || []);
      setNeeds(needData || []);
      setPlayers(playerData || []);
      setProspects(prospectData || []);

      const deal = result?.deal;
      if (deal) {
        setIdentityKind(deal.player_id ? 'player' : 'recruitment');
        setForm(toForm(deal));
        setPitchEdits(() => {
          const next: Record<string, any> = {};
          for (const pitch of result?.pitches || []) {
            next[pitch.id] = toPitchEdit(pitch);
          }
          return next;
        });
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const deal = data?.deal;
  const pitches = data?.pitches || [];

  const selectedClub = useMemo(
    () => clubs.find((club) => club.id === form?.organisation_id),
    [clubs, form?.organisation_id],
  );

  const availableContacts = useMemo(() => {
    if (!selectedClub?.name) return contacts;
    return contacts.filter((contact) => contact.current_organisation === selectedClub.name);
  }, [contacts, selectedClub]);

  const availableNeeds = useMemo(
    () => needs.filter((need) => need.organisation_id === form?.organisation_id),
    [needs, form?.organisation_id],
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!deal || !form) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const selectedPlayerId = identityKind === 'player' ? form.player_id || null : null;
      const selectedProspectId = identityKind === 'recruitment' ? form.prospect_id || null : null;

      if (!form.organisation_id) throw new Error('Choose a club.');
      if (!selectedPlayerId && !selectedProspectId) throw new Error('Choose a player or recruitment target.');

      await djmRpc('djm_opportunity_update_identity', {
        p_opportunity_id: id,
        p_organisation_id: form.organisation_id,
        p_source_person_id: form.source_person_id || null,
        p_player_id: selectedPlayerId,
        p_prospect_id: selectedProspectId,
        p_club_need_id: form.club_need_id || null,
      });

      await djmRpc('djm_opportunity_upsert', {
        p_id: id,
        p_title: form.title.trim() || 'DJM opportunity',
        p_organisation_id: form.organisation_id,
        p_source_person_id: form.source_person_id || null,
        p_player_id: selectedPlayerId,
        p_prospect_id: selectedProspectId,
        p_club_need_id: form.club_need_id || null,
        p_stage: form.stage,
        p_expected_commission: numberOrNull(form.expected_commission),
        p_currency: form.currency || 'EUR',
        p_primary_blocker: form.primary_blocker.trim() || null,
        p_next_decision: form.next_decision.trim() || null,
        p_next_action_text: form.next_action_text.trim() || null,
        p_next_action_at: isoOrNull(form.next_action_at),
        p_transfer_fee: numberOrNull(form.transfer_fee),
        p_player_salary: numberOrNull(form.player_salary),
        p_salary_period: form.salary_period || null,
        p_financial_notes: form.financial_notes.trim() || null,
        p_manual_probability: form.manual_probability === '' ? null : Number(form.manual_probability),
        p_source: 'opportunity_ui',
      });

      await djmRpc('djm_opportunity_assign_owner', {
        p_opportunity_id: id,
        p_owner_user_id: form.owner_user_id || null,
      });

      setMessage('Opportunity saved and probability recalculated.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const closeOpportunity = async (outcome: 'done' | 'closed') => {
    const label = outcome === 'done' ? 'won' : 'lost';
    const reason = window.prompt(`Why was this opportunity ${label}?`, '') || '';
    try {
      await djmRpc('djm_opportunity_close', {
        p_opportunity_id: id,
        p_outcome: outcome,
        p_reason: reason || null,
      });
      setMessage(`Opportunity marked ${label}.`);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const deleteOpportunity = async () => {
    if (!deal) return;
    const ok = window.confirm(
      `Permanently delete ${deal.title || 'this opportunity'}? Use Won, Lost or Paused if DJM should retain the commercial history.`,
    );
    if (!ok) return;
    try {
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'deal_room',
        p_entity_id: id,
        p_confirm: true,
      });
      router.push('/market');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const createPitch = async (event: FormEvent) => {
    event.preventDefault();
    if (!deal?.player_id) {
      setError('A club pitch requires a signed DJM player.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result: any = await djmRpc('djm_opportunity_create_pitch', {
        p_opportunity_id: id,
        p_message: pitchForm.message.trim() || null,
        p_expires_at: isoOrNull(pitchForm.expires_at),
        p_selected_sections: pitchSections(pitchForm),
      });
      setShowPitchCreator(false);
      setPitchForm({
        ...EMPTY_PITCH,
        expires_at: localInputFromDate(new Date(Date.now() + 30 * 86400000)),
      });
      setMessage('Pitch created. Review the share before marking it sent.');
      await load();
      if (result?.token) {
        await copyText(`${window.location.origin}/s/${result.token}`);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const savePitch = async (pitch: any) => {
    const edit = pitchEdits[pitch.id];
    if (!edit) return;
    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_opportunity_update_pitch', {
        p_share_id: pitch.id,
        p_label: edit.label.trim() || deal?.title || 'DJM pitch',
        p_message: edit.pitch_message.trim() || null,
        p_expires_at: isoOrNull(edit.expires_at),
        p_selected_sections: pitchSections(edit),
        p_active: Boolean(edit.active),
      });
      setEditingPitchId(null);
      setMessage('Pitch updated.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const revokePitch = async (pitch: any) => {
    const edit = pitchEdits[pitch.id] || toPitchEdit(pitch);
    setPitchEdits((current) => ({ ...current, [pitch.id]: { ...edit, active: false } }));
    setBusy(true);
    setError('');
    try {
      await djmRpc('djm_opportunity_update_pitch', {
        p_share_id: pitch.id,
        p_label: edit.label || pitch.label || deal?.title || 'DJM pitch',
        p_message: edit.pitch_message || null,
        p_expires_at: isoOrNull(edit.expires_at),
        p_selected_sections: pitchSections(edit),
        p_active: false,
      });
      setMessage('Pitch revoked.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const markPitchSent = async (pitch: any) => {
    try {
      await djmRpc('djm_opportunity_mark_pitch_sent', { p_share_id: pitch.id });
      setMessage('Pitch marked sent.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const copyPitchLink = async (pitch: any) => {
    try {
      await copyText(`${window.location.origin}/s/${pitch.token}`);
      setMessage('Pitch link copied.');
    } catch {
      setError('Could not copy the pitch link.');
    }
  };

  if (!deal || !form) {
    return (
      <DjmOsShell eyebrow="Opportunity" title="Opportunity">
        <div className="djm-os-empty">
          <CircleDollarSign size={25} />
          <p>{busy ? 'Loading opportunity...' : error || 'Opportunity not found.'}</p>
        </div>
      </DjmOsShell>
    );
  }

  const probabilityBasis = deal.probability_basis || {};
  const effectiveProbability = numberOrNull(deal.probability);
  const modelProbability = numberOrNull(deal.model_probability);
  const manualProbability = numberOrNull(deal.manual_probability);

  return (
    <DjmOsShell eyebrow="Player to club opportunity" title={deal.title || 'Opportunity'}>
      <div className="djm-os-toolbar">
        <Link href="/market" className="djm-os-secondary-button" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={15} />
          Market
        </Link>
        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            Refresh
          </button>
          <button className="djm-os-secondary-button" onClick={() => void deleteOpportunity()}>
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}
      {message ? <div className="djm-os-capture-status" style={{ marginBottom: 14 }}>{message}</div> : null}

      <section className="djm-os-metrics">
        <Metric label="Club" value={deal.organisation_name || 'Not set'} />
        <Metric label="Player" value={deal.player_name || 'Not set'} />
        <Metric label="Stage" value={humanise(deal.stage)} />
        <Metric label="Deal probability" value={effectiveProbability == null ? 'Not calculated' : `${effectiveProbability}%`} />
        <Metric label="Pitch" value={humanise(deal.pitch_status || 'not created')} />
        <Metric label="Next action" value={deal.next_action_at ? compactDateTime(deal.next_action_at) : 'Not scheduled'} />
      </section>

      <div className="djm-os-grid djm-os-grid-2" style={{ marginBottom: 16 }}>
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Probability and evidence</h2>
              <p>Model estimate, human override and the factors behind it stay separate.</p>
            </div>
            <CircleDollarSign size={20} />
          </div>
          <div className="djm-os-form">
            <div className="djm-os-metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              <Metric label="Effective" value={effectiveProbability == null ? 'Not set' : `${effectiveProbability}%`} />
              <Metric label="Model" value={modelProbability == null ? 'Not set' : `${modelProbability}%`} />
              <Metric label="Manual" value={manualProbability == null ? 'None' : `${manualProbability}%`} />
            </div>
            <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}>
              <strong>Probability source</strong>
              <p>{deal.probability_source === 'manual' ? 'Manual override' : 'DJM model'}</p>
            </div>
            <ProbabilityFactors basis={probabilityBasis} />
          </div>
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Research and source</h2>
              <p>Use saved profiles first. Edit the source records from their own profiles.</p>
            </div>
          </div>
          <div className="djm-os-form">
            <ResearchLinkRail
              compact
              title="Research club"
              links={buildResearchLinks({
                kind: 'club',
                name: deal.organisation_name,
                country: deal.organisation_country,
                websiteUrl: deal.website_url,
                transfermarktUrl: deal.organisation_transfermarkt_url,
                linkedinUrl: deal.organisation_linkedin_url,
                instagramUrl: deal.organisation_instagram_url,
              })}
            />
            {deal.source_person_name ? (
              <ResearchLinkRail
                compact
                title={`Research ${deal.source_person_name}`}
                links={buildResearchLinks({
                  kind: 'contact',
                  name: deal.source_person_name,
                  clubName: deal.organisation_name,
                  country: deal.organisation_country,
                  whatsapp: deal.source_person_whatsapp,
                  email: deal.source_person_email,
                  linkedinUrl: deal.source_person_linkedin_url,
                  instagramUrl: deal.source_person_instagram_url,
                })}
              />
            ) : null}
            {deal.player_id ? (
              <ResearchLinkRail
                compact
                title="Research player"
                links={buildResearchLinks({
                  kind: 'player',
                  name: deal.player_name,
                  clubName: deal.player_current_club,
                  country: deal.player_current_country,
                  transfermarktUrl: deal.player_transfermarkt_url,
                  statsUrl: deal.player_stats_url,
                  instagramUrl: deal.player_instagram_url,
                })}
              />
            ) : null}
          </div>
        </section>
      </div>

      <section className="djm-os-panel" style={{ marginBottom: 16 }}>
        <div className="djm-os-panel-head">
          <div>
            <h2>Edit opportunity</h2>
            <p>Identity, commercial terms, ownership, probability override and next actions.</p>
          </div>
          <Pencil size={20} />
        </div>
        <form className="djm-os-form" onSubmit={save}>
          <div className="djm-os-form-grid">
            <label>
              Opportunity title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Stage
              <select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>
                {STAGES.map((stage) => <option key={stage} value={stage}>{humanise(stage)}</option>)}
              </select>
            </label>
            <label>
              Club
              <select
                value={form.organisation_id}
                onChange={(event) => setForm({ ...form, organisation_id: event.target.value, source_person_id: '', club_need_id: '' })}
              >
                <option value="">Choose club</option>
                {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}{club.country ? `, ${club.country}` : ''}</option>)}
              </select>
            </label>
            <label>
              Source contact
              <select value={form.source_person_id} onChange={(event) => setForm({ ...form, source_person_id: event.target.value })}>
                <option value="">No source contact</option>
                {availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.role_title ? `, ${contact.role_title}` : ''}</option>)}
              </select>
            </label>
            <label>
              DJM owner
              <select value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}>
                <option value="">Unassigned</option>
                {teamMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}
              </select>
            </label>
            <label>
              Club Request
              <select value={form.club_need_id} onChange={(event) => setForm({ ...form, club_need_id: event.target.value })}>
                <option value="">No Club Request linked</option>
                {availableNeeds.map((need) => <option key={need.id} value={need.id}>{need.title || need.need_position}{need.need_type === 'predicted' ? `, predicted ${need.prediction_probability ?? '?'}%` : ''}</option>)}
              </select>
            </label>
          </div>

          <div className="djm-os-button-row" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--djm-navy)' }}>Player type</span>
            <button type="button" className={identityKind === 'player' ? 'djm-os-primary-button' : 'djm-os-secondary-button'} onClick={() => setIdentityKind('player')}>Signed DJM player</button>
            <button type="button" className={identityKind === 'recruitment' ? 'djm-os-primary-button' : 'djm-os-secondary-button'} onClick={() => setIdentityKind('recruitment')}>Recruitment target</button>
          </div>

          {identityKind === 'player' ? (
            <label>
              Signed player
              <select value={form.player_id} onChange={(event) => setForm({ ...form, player_id: event.target.value, prospect_id: '' })}>
                <option value="">Choose player</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.player_name}{player.current_club ? `, ${player.current_club}` : ''}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Recruitment target
              <select value={form.prospect_id} onChange={(event) => setForm({ ...form, prospect_id: event.target.value, player_id: '' })}>
                <option value="">Choose recruitment target</option>
                {prospects.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.full_name}{prospect.current_club ? `, ${prospect.current_club}` : ''}</option>)}
              </select>
            </label>
          )}

          <div className="djm-os-form-grid">
            <label>
              Transfer fee
              <input type="number" min="0" value={form.transfer_fee} onChange={(event) => setForm({ ...form, transfer_fee: event.target.value })} />
            </label>
            <label>
              Player salary
              <input type="number" min="0" value={form.player_salary} onChange={(event) => setForm({ ...form, player_salary: event.target.value })} />
            </label>
            <label>
              Salary period
              <select value={form.salary_period} onChange={(event) => setForm({ ...form, salary_period: event.target.value })}>
                <option value="">Not set</option>
                <option value="year">Year</option>
                <option value="month">Month</option>
                <option value="week">Week</option>
              </select>
            </label>
            <label>
              Currency
              <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} />
            </label>
            <label>
              Expected DJM commission
              <input type="number" min="0" value={form.expected_commission} onChange={(event) => setForm({ ...form, expected_commission: event.target.value })} />
            </label>
            <label>
              Manual probability override
              <input type="number" min="0" max="100" value={form.manual_probability} onChange={(event) => setForm({ ...form, manual_probability: event.target.value })} placeholder="Blank uses model" />
            </label>
          </div>

          <label>
            Primary blocker
            <textarea rows={2} value={form.primary_blocker} onChange={(event) => setForm({ ...form, primary_blocker: event.target.value })} placeholder="What is the biggest thing stopping the deal?" />
          </label>
          <label>
            Next decision
            <textarea rows={2} value={form.next_decision} onChange={(event) => setForm({ ...form, next_decision: event.target.value })} placeholder="What concrete decision do we need next?" />
          </label>
          <div className="djm-os-form-grid">
            <label>
              Next action
              <input value={form.next_action_text} onChange={(event) => setForm({ ...form, next_action_text: event.target.value })} placeholder="Call sporting director, send clips, confirm salary..." />
            </label>
            <label>
              Next action date
              <input type="datetime-local" value={form.next_action_at} onChange={(event) => setForm({ ...form, next_action_at: event.target.value })} />
            </label>
          </div>
          <label>
            Financial notes
            <textarea rows={3} value={form.financial_notes} onChange={(event) => setForm({ ...form, financial_notes: event.target.value })} placeholder="Fee structure, salary basis, bonuses, agent commission, sell-on or other commercial context." />
          </label>

          <div className="djm-os-button-row">
            <button className="djm-os-primary-button" type="submit" disabled={busy}>
              <Save size={15} />
              {busy ? 'Saving...' : 'Save opportunity'}
            </button>
            <button className="djm-os-secondary-button" type="button" onClick={() => void closeOpportunity('done')}>
              <Check size={15} />
              Won
            </button>
            <button className="djm-os-secondary-button" type="button" onClick={() => void closeOpportunity('closed')}>
              <X size={15} />
              Lost
            </button>
          </div>
        </form>
      </section>

      <section className="djm-os-panel" style={{ marginBottom: 16 }}>
        <div className="djm-os-panel-head">
          <div>
            <h2>Pitch</h2>
            <p>Keep the pitch. Make the message, content, expiry and status editable.</p>
          </div>
          {deal.player_id ? (
            <button className="djm-os-primary-button" onClick={() => setShowPitchCreator((open) => !open)}>
              {showPitchCreator ? <X size={15} /> : <Plus size={15} />}
              {showPitchCreator ? 'Cancel' : 'Create pitch'}
            </button>
          ) : null}
        </div>

        {!deal.player_id ? (
          <div className="djm-os-empty"><Send size={24} /><p>Club pitch links are available once the Opportunity uses a signed DJM player.</p></div>
        ) : null}

        {showPitchCreator ? (
          <form className="djm-os-form" onSubmit={createPitch} style={{ borderBottom: '1px solid var(--djm-line)' }}>
            <label>
              Club-specific pitch message
              <textarea rows={5} value={pitchForm.message} onChange={(event) => setPitchForm({ ...pitchForm, message: event.target.value })} placeholder="Why this player fits this exact club and requirement." />
            </label>
            <label>
              Link expiry
              <input type="datetime-local" value={pitchForm.expires_at} onChange={(event) => setPitchForm({ ...pitchForm, expires_at: event.target.value })} />
            </label>
            <PitchSections value={pitchForm} onChange={setPitchForm} />
            <button className="djm-os-primary-button" disabled={busy}><Plus size={15} />Create pitch link</button>
          </form>
        ) : null}

        {pitches.length ? (
          <div className="djm-os-list">
            {pitches.map((pitch: any) => {
              const edit = pitchEdits[pitch.id] || toPitchEdit(pitch);
              const editing = editingPitchId === pitch.id;
              return (
                <article className="djm-os-list-row" key={pitch.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="djm-command-meta">
                      <span className={`djm-evidence-state ${pitch.active ? 'is-review' : 'is-missing'}`}>{pitch.active ? humanise(pitch.pitch_status || 'ready') : 'Revoked'}</span>
                      <span>{pitch.view_count || 0} view{Number(pitch.view_count || 0) === 1 ? '' : 's'}</span>
                      {pitch.last_viewed_at ? <span>Last viewed {compactDateTime(pitch.last_viewed_at)}</span> : null}
                    </div>
                    <strong>{pitch.label || deal.title}</strong>
                    <p>{pitch.pitch_message || 'No club-specific message yet.'}</p>
                    <small>{pitch.expires_at ? `Expires ${compactDateTime(pitch.expires_at)}` : 'No expiry'}</small>

                    {editing ? (
                      <div className="djm-os-form" style={{ marginTop: 10, padding: 0 }}>
                        <label>Pitch label<input value={edit.label} onChange={(event) => updatePitchEdit(setPitchEdits, pitch.id, { label: event.target.value })} /></label>
                        <label>Pitch message<textarea rows={4} value={edit.pitch_message} onChange={(event) => updatePitchEdit(setPitchEdits, pitch.id, { pitch_message: event.target.value })} /></label>
                        <label>Expiry<input type="datetime-local" value={edit.expires_at} onChange={(event) => updatePitchEdit(setPitchEdits, pitch.id, { expires_at: event.target.value })} /></label>
                        <PitchSections value={edit} onChange={(value) => setPitchEdits((current) => ({ ...current, [pitch.id]: value }))} />
                        <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <input type="checkbox" checked={Boolean(edit.active)} onChange={(event) => updatePitchEdit(setPitchEdits, pitch.id, { active: event.target.checked })} />
                          Link active
                        </label>
                        <div className="djm-os-button-row">
                          <button type="button" className="djm-os-primary-button" onClick={() => void savePitch(pitch)}><Save size={14} />Save pitch</button>
                          <button type="button" className="djm-os-secondary-button" onClick={() => setEditingPitchId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="djm-os-button-row" style={{ justifyContent: 'flex-end' }}>
                    <a className="djm-os-secondary-button" href={`/s/${pitch.token}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <ExternalLink size={14} />Open
                    </a>
                    <button className="djm-os-secondary-button" onClick={() => void copyPitchLink(pitch)}><Copy size={14} />Copy</button>
                    {pitch.active && pitch.pitch_status !== 'sent' ? <button className="djm-os-secondary-button" onClick={() => void markPitchSent(pitch)}><Send size={14} />Mark sent</button> : null}
                    <button className="djm-os-secondary-button" onClick={() => setEditingPitchId(editing ? null : pitch.id)}><Pencil size={14} />Edit</button>
                    {pitch.active ? <button className="djm-os-secondary-button" onClick={() => void revokePitch(pitch)}><Trash2 size={14} />Revoke</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : deal.player_id ? (
          <div className="djm-os-empty"><Send size={24} /><p>No pitch created for this Opportunity yet.</p></div>
        ) : null}
      </section>

      <section className="djm-os-panel">
        <div className="djm-os-panel-head">
          <div><h2>Open actions</h2><p>Tasks linked to the Club Request.</p></div>
        </div>
        {(data?.tasks || []).length ? (
          <div className="djm-os-list">
            {data.tasks.map((task: any) => (
              <article className="djm-os-list-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <p>{humanise(task.status)}</p>
                  <small>{task.due_at ? compactDateTime(task.due_at) : 'No deadline'}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="djm-os-empty"><CircleDollarSign size={24} /><p>No linked actions yet.</p></div>
        )}
      </section>
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="djm-os-metric"><strong style={{ fontSize: typeof value === 'string' && value.length > 22 ? 15 : undefined }}>{value}</strong><span>{label}</span></div>;
}

function ProbabilityFactors({ basis }: { basis: Record<string, any> }) {
  const factors = [
    ['Club Match', basis.player_club_fit ?? basis.football_fit ?? basis.club_match ?? basis.fit],
    ['DJM access', basis.djm_access ?? basis.access],
    ['Demand confidence', basis.demand_confidence ?? basis.demand],
    ['Player willingness', basis.player_willingness ?? basis.willingness],
    ['Timing', basis.timing],
  ].filter((item) => item[1] != null);

  if (!factors.length) {
    return <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}><strong>Model evidence</strong><p>No factor breakdown is available yet.</p></div>;
  }

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {factors.map(([label, value]) => (
        <div key={String(label)} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 42px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#617487' }}>{label}</span>
          <div style={{ height: 7, borderRadius: 99, background: '#e7edf2', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, Number(value)))}%`, background: 'var(--djm-navy)' }} />
          </div>
          <strong style={{ fontSize: 11, color: 'var(--djm-navy)' }}>{Math.round(Number(value))}%</strong>
        </div>
      ))}
      {basis.model ? <small style={{ color: '#617487' }}>Model: {String(basis.model)}</small> : null}
    </div>
  );
}

function PitchSections({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const options = [
    ['profile', 'Profile'],
    ['stats', 'Stats and graphs'],
    ['career', 'Career'],
    ['videos', 'Videos'],
    ['documents', 'Approved documents'],
  ];
  return (
    <div>
      <strong style={{ display: 'block', fontSize: 12, color: 'var(--djm-navy)', marginBottom: 6 }}>Pitch content</strong>
      <div className="djm-os-button-row">
        {options.map(([key, label]) => (
          <label key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={Boolean(value[key])} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function toForm(deal: any) {
  return {
    title: deal.title || '',
    stage: STAGES.includes(deal.stage) ? deal.stage : deal.status === 'paused' ? 'paused' : 'potential',
    organisation_id: deal.organisation_id || '',
    source_person_id: deal.source_person_id || '',
    owner_user_id: deal.owner_user_id || '',
    player_id: deal.player_id || '',
    prospect_id: deal.prospect_id || '',
    club_need_id: deal.club_need_id || '',
    expected_commission: deal.expected_commission ?? '',
    currency: deal.currency || 'EUR',
    transfer_fee: deal.transfer_fee ?? '',
    player_salary: deal.player_salary ?? '',
    salary_period: deal.salary_period || '',
    financial_notes: deal.financial_notes || '',
    manual_probability: deal.manual_probability ?? '',
    primary_blocker: deal.primary_blocker || '',
    next_decision: deal.next_decision || '',
    next_action_text: deal.next_action_text || '',
    next_action_at: deal.next_action_at ? localInputFromDate(new Date(deal.next_action_at)) : '',
  };
}

function toPitchEdit(pitch: any) {
  const sections = pitch.selected_sections || {};
  return {
    label: pitch.label || '',
    pitch_message: pitch.pitch_message || '',
    expires_at: pitch.expires_at ? localInputFromDate(new Date(pitch.expires_at)) : '',
    active: pitch.active !== false,
    profile: sections.profile !== false,
    stats: sections.stats !== false,
    career: sections.career !== false,
    videos: sections.videos !== false,
    documents: Boolean(sections.documents),
  };
}

function updatePitchEdit(setter: any, id: string, patch: Record<string, any>) {
  setter((current: Record<string, any>) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }));
}

function pitchSections(value: any) {
  return {
    profile: Boolean(value.profile),
    stats: Boolean(value.stats),
    career: Boolean(value.career),
    videos: Boolean(value.videos),
    documents: Boolean(value.documents),
  };
}

function humanise(value: any) {
  const text = String(value || '').trim();
  return text ? text.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not set';
}

function numberOrNull(value: any) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localInputFromDate(date: Date) {
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
