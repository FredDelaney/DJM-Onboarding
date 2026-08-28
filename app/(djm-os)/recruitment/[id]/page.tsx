'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  MessageCircleMore,
  UserPlus,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import ResearchLinkRail from '@/components/ResearchLinkRail';
import { compactDateTime, djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import { buildResearchLinks } from '@/lib/research-links';

const STAGES = [
  'identified',
  'researching',
  'ready_to_contact',
  'contacted',
  'replied',
  'call_booked',
  'interested',
  'terms_discussed',
  'agreement_sent',
  'negotiating',
  'signed',
  'paused',
  'declined',
  'lost',
];

export default function RecruitmentTargetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [direction, setDirection] = useState('outbound');
  const [summary, setSummary] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentMessage, setEnrichmentMessage] = useState('');

  const load = async () => {
    setError('');
    try {
      const result: any = await djmRpc('djm_recruitment_target', { p_prospect_id: id });
      setData(result);
      const target = result?.target;
      if (target) {
        setProfile({
          transfermarkt_url: target.transfermarkt_url || '',
          market_value: target.market_value ?? '',
          market_value_currency: target.market_value_currency || 'EUR',
          whatsapp: target.whatsapp || '',
          instagram_url: target.instagram_url || '',
          email: target.email || '',
          agent_status: target.agent_status || '',
          agent_name: target.agent_name || '',
          contract_expiry: target.contract_expiry || '',
          current_club: target.current_club || '',
          current_country: target.current_country || '',
          primary_position: target.primary_position || '',
          date_of_birth: target.date_of_birth || '',
          nationality: target.nationality || '',
          preferred_foot: target.preferred_foot || '',
        });
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const target = data?.target;

  const setStage = async (stage: string) => {
    try {
      await djmRpc('djm_recruitment_set_stage', {
        p_prospect_id: id,
        p_stage: stage,
        p_next_action_at: target?.next_action_at || null,
        p_note: null,
      });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const logInteraction = async (event: FormEvent) => {
    event.preventDefault();
    if (!summary.trim()) return;
    try {
      await djmRpc('djm_recruitment_log_interaction', {
        p_prospect_id: id,
        p_channel: channel,
        p_summary: summary.trim(),
        p_direction: direction,
        p_occurred_at: new Date().toISOString(),
        p_next_action_at: nextAction ? new Date(nextAction).toISOString() : null,
      });
      setSummary('');
      setNextAction('');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const promote = async () => {
    const ok = window.confirm(
      'Confirm this player has signed with DJM and create their Signed Player record?',
    );
    if (!ok) return;
    setPromoting(true);
    try {
      const result: any = await djmRpc('djm_recruitment_promote_to_signed_player', {
        p_prospect_id: id,
      });
      router.push(`/admin/players/${result.player_id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPromoting(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    try {
      await djmRpc('djm_recruitment_update_profile', {
        p_prospect_id: id,
        p_transfermarkt_url: profile.transfermarkt_url || null,
        p_market_value: profile.market_value === '' ? null : Number(profile.market_value),
        p_market_value_currency: profile.market_value_currency || null,
        p_whatsapp: profile.whatsapp || null,
        p_instagram_url: profile.instagram_url || null,
        p_email: profile.email || null,
        p_agent_status: profile.agent_status || null,
        p_agent_name: profile.agent_name || null,
        p_contract_expiry: profile.contract_expiry || null,
        p_current_club: profile.current_club || null,
        p_current_country: profile.current_country || null,
        p_primary_position: profile.primary_position || null,
        p_date_of_birth: profile.date_of_birth || null,
        p_nationality: profile.nationality || null,
        p_preferred_foot: profile.preferred_foot || null,
      });
      if (profile.transfermarkt_url) {
        try {
          const result: any = await djmInvoke('djm-transfermarkt-enrich', {
            prospect_id: id,
            url: profile.transfermarkt_url,
          });
          setEnrichmentMessage(
            result?.blocked
              ? 'Profile saved. Transfermarkt blocked the instant read, so DJM queued verification.'
              : 'Profile saved and Transfermarkt data refreshed.',
          );
        } catch {
          setEnrichmentMessage('Profile saved. Transfermarkt will be checked again through DJM enrichment.');
        }
      }
      setEditingProfile(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const refreshTransfermarkt = async () => {
    if (!target?.transfermarkt_url) return;

    setEnriching(true);
    setError('');
    setEnrichmentMessage('');

    try {
      const result: any = await djmInvoke('djm-transfermarkt-enrich', {
        prospect_id: id,
        url: target.transfermarkt_url,
      });

      setEnrichmentMessage(
        result?.blocked
          ? 'Transfermarkt blocked the instant read, so DJM queued sourced verification instead.'
          : 'Transfermarkt data refreshed. Review anything important before using it in outreach.',
      );
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setEnriching(false);
    }
  };

  const deleteTarget = async () => {
    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'recruitment_target',
        p_entity_id: id,
      });
      const ok = window.confirm(
        `Permanently delete ${target?.full_name}? This removes ${impact?.interactions || 0} recruitment interactions and ${impact?.reports || 0} reports. This cannot be undone.`,
      );
      if (!ok) return;
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'recruitment_target',
        p_entity_id: id,
        p_confirm: true,
      });
      router.push('/recruitment');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const age = target?.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(target.date_of_birth).getTime()) /
          (365.2425 * 24 * 60 * 60 * 1000),
      )
    : null;

  return (
    <DjmOsShell
      eyebrow="Unsigned player recruitment"
      title={target?.full_name || 'Recruitment target'}
    >
      <div className="djm-os-toolbar">
        <div className="djm-os-button-row">
          <Link href="/recruitment" className="djm-os-secondary-button" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={15} /> Recruitment
          </Link>
        </div>
        <div className="djm-os-button-row">
          <button className="djm-os-secondary-button" type="button" onClick={() => setEditingProfile((v) => !v)}>
            Edit profile
          </button>
          <button className="djm-os-secondary-button" type="button" onClick={() => void deleteTarget()}>
            Delete
          </button>
        </div>
        {target?.recruitment_stage === 'signed' && !target?.signed_player_id ? (
          <button className="djm-os-primary-button" onClick={() => void promote()} disabled={promoting}>
            <CheckCircle2 size={15} />
            Create Signed Player
          </button>
        ) : null}
      </div>

      {target ? (
        <ResearchLinkRail
          links={buildResearchLinks({
            kind: 'recruitment',
            name: target.full_name,
            clubName: target.current_club,
            country: target.current_country || target.nationality,
            whatsapp: target.whatsapp,
            phone: target.phone,
            email: target.email,
            transfermarktUrl: target.transfermarkt_url,
            statsUrl: target.stats_url,
            instagramUrl: target.instagram_url,
          })}
          title="Player research & outreach"
        />
      ) : null}

      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      {!target ? (
        <div className="djm-os-empty"><UserPlus size={25} /><p>Loading recruitment target…</p></div>
      ) : (
        <>
          <section className="djm-os-metrics">
            <Metric label="Current club" value={target.current_club || '-'} />
            <Metric label="Position" value={target.primary_position || '-'} />
            <Metric label="Age" value={age ?? '-'} />
            <Metric
              label="Market value"
              value={
                target.market_value != null
                  ? `${target.market_value_currency || 'EUR'} ${Number(target.market_value).toLocaleString('en-GB')}`
                  : '-'
              }
            />
            <Metric label="Priority" value={`${target.recruitment_priority || 3}/5`} />
            <Metric label="Stage" value={String(target.recruitment_stage || 'identified').replaceAll('_', ' ')} />
            <Metric label="Next action" value={target.next_action_at ? compactDateTime(target.next_action_at) : '-'} />
          </section>

          <section className="djm-os-panel" style={{ marginBottom: 16 }}>
            <div className="djm-os-panel-head">
              <div>
                <h2>Transfermarkt profile</h2>
                <p>
                  Paste the profile once. DJM will try to read Transfermarkt immediately and
                  fill age, club, contract, value, position, foot and public representation data.
                  If Transfermarkt blocks the read, the profile is queued for sourced verification.
                </p>
              </div>
              <div className="djm-os-button-row">
                {target.transfermarkt_url ? (
                  <a className="djm-os-secondary-button" href={target.transfermarkt_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    Open Transfermarkt
                  </a>
                ) : null}
                <button
                  className="djm-os-primary-button"
                  type="button"
                  onClick={() => void refreshTransfermarkt()}
                  disabled={!target.transfermarkt_url || enriching}
                >
                  {enriching ? 'Reading Transfermarkt…' : 'Refresh from Transfermarkt'}
                </button>
              </div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
              <Mini label="Status" value={target.transfermarkt_enrichment_status || 'never'} />
              <Mini label="Last checked" value={target.transfermarkt_checked_at ? compactDateTime(target.transfermarkt_checked_at) : 'Never'} />
              <Mini label="Contract expiry" value={target.contract_expiry || '-'} />
              <Mini label="Agent" value={target.agent_name || '-'} />
            </div>
            {enrichmentMessage ? (
              <div style={{ padding: '0 16px 16px' }}>
                <span className="djm-os-source-badge">{enrichmentMessage}</span>
              </div>
            ) : null}
          </section>

          {editingProfile && profile ? (
            <section className="djm-os-panel" style={{ marginBottom: 16 }}>
              <div className="djm-os-panel-head">
                <div>
                  <h2>Edit recruitment profile</h2>
                  <p>Manual values remain available when public enrichment is incomplete.</p>
                </div>
              </div>
              <form className="djm-os-form djm-os-form-grid" onSubmit={saveProfile}>
                <label className="djm-os-span-2">Transfermarkt URL<input value={profile.transfermarkt_url} onChange={(e) => setProfile({ ...profile, transfermarkt_url: e.target.value })} /></label>
                <label>Market value<input type="number" min="0" value={profile.market_value} onChange={(e) => setProfile({ ...profile, market_value: e.target.value })} /></label>
                <label>Currency<select value={profile.market_value_currency} onChange={(e) => setProfile({ ...profile, market_value_currency: e.target.value })}><option>EUR</option><option>GBP</option><option>USD</option><option>AUD</option><option>NZD</option><option>SEK</option></select></label>
                <label>Date of birth<input type="date" value={profile.date_of_birth} onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })} /></label>
                <label>Nationality<input value={profile.nationality} onChange={(e) => setProfile({ ...profile, nationality: e.target.value })} /></label>
                <label>Current club<input value={profile.current_club} onChange={(e) => setProfile({ ...profile, current_club: e.target.value })} /></label>
                <label>Country<input value={profile.current_country} onChange={(e) => setProfile({ ...profile, current_country: e.target.value })} /></label>
                <label>Position<input value={profile.primary_position} onChange={(e) => setProfile({ ...profile, primary_position: e.target.value })} /></label>
                <label>Preferred foot<select value={profile.preferred_foot} onChange={(e) => setProfile({ ...profile, preferred_foot: e.target.value })}><option value="">Unknown</option><option>Left</option><option>Right</option><option>Both</option></select></label>
                <label>Contract expiry<input type="date" value={profile.contract_expiry} onChange={(e) => setProfile({ ...profile, contract_expiry: e.target.value })} /></label>
                <label>Agent status<input value={profile.agent_status} onChange={(e) => setProfile({ ...profile, agent_status: e.target.value })} /></label>
                <label>Agent<input value={profile.agent_name} onChange={(e) => setProfile({ ...profile, agent_name: e.target.value })} /></label>
                <label>WhatsApp<input value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} /></label>
                <label>Instagram<input value={profile.instagram_url} onChange={(e) => setProfile({ ...profile, instagram_url: e.target.value })} /></label>
                <label>Email<input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label>
                <div className="djm-os-span-2 djm-os-button-row">
                  <button className="djm-os-primary-button" type="submit">Save profile</button>
                  <button className="djm-os-secondary-button" type="button" onClick={() => setEditingProfile(false)}>Cancel</button>
                </div>
              </form>
            </section>
          ) : null}

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Recruitment status</h2>
                  <p>Move the player through the representation pipeline.</p>
                </div>
              </div>
              <div className="djm-os-form">
                <label>
                  Stage
                  <select value={target.recruitment_stage || 'identified'} onChange={(e) => void setStage(e.target.value)}>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>{stage.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </label>
                <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}>
                  <strong>Player intelligence</strong>
                  <p>{target.notes || target.recruitment_notes || 'No recruitment notes yet.'}</p>
                  <small>
                    {[
                      target.nationality,
                      target.preferred_foot,
                      ...(Array.isArray(target.secondary_positions) ? target.secondary_positions : []),
                      target.agent_status,
                      target.agent_name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
              </div>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Log outreach</h2>
                  <p>Instagram, WhatsApp, calls and replies all belong here.</p>
                </div>
                <MessageCircleMore size={20} />
              </div>

              <form className="djm-os-form" onSubmit={logInteraction}>
                <label>
                  Channel
                  <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                    <option value="phone">Phone</option>
                    <option value="meeting">Meeting</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Direction
                  <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                    <option value="outbound">DJM contacted player</option>
                    <option value="inbound">Player replied/contacted DJM</option>
                    <option value="mutual">Conversation / call</option>
                  </select>
                </label>
                <label>
                  What happened?
                  <textarea
                    rows={5}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="What was said, interest level, objections, promises and next step."
                  />
                </label>
                <label>
                  Next action
                  <input type="datetime-local" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
                </label>
                <button className="djm-os-primary-button" type="submit" disabled={!summary.trim()}>
                  <CalendarClock size={15} />
                  Save outreach
                </button>
              </form>
            </section>
          </div>

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Conversation history</h2>
                  <p>The full recruitment relationship.</p>
                </div>
              </div>
              {(data.interactions || []).length ? (
                <div className="djm-os-list">
                  {data.interactions.map((item: any) => (
                    <article className="djm-os-feed-row" key={item.id}>
                      <span className="djm-os-feed-dot" />
                      <div>
                        <strong>{item.channel} · {item.direction || 'interaction'}</strong>
                        <p>{item.summary}</p>
                        <small>{item.owner_name || 'DJM'} · {compactDateTime(item.occurred_at)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="djm-os-empty"><MessageCircleMore size={25} /><p>No recruitment conversations yet.</p></div>
              )}
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Open actions</h2>
                  <p>Automatically created from next actions and promises.</p>
                </div>
              </div>
              {(data.tasks || []).length ? (
                <div className="djm-os-list">
                  {data.tasks.map((task: any) => (
                    <article className="djm-os-list-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <p>{task.status}</p>
                        <small>{task.due_at ? compactDateTime(task.due_at) : 'No deadline'}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="djm-os-empty"><CalendarClock size={25} /><p>No open recruitment actions.</p></div>
              )}
            </section>
          </div>
        </>
      )}
    </DjmOsShell>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--djm-line)', borderRadius: 11, background: '#fbfcfd' }}>
      <span style={{ display: 'block', color: 'var(--djm-muted)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ display: 'block', marginTop: 5, color: 'var(--djm-navy)', fontSize: 12, textTransform: 'capitalize' }}>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="djm-os-metric">
      <strong style={{ fontSize: typeof value === 'string' && value.length > 15 ? 16 : undefined, textTransform: 'capitalize' }}>
        {value}
      </strong>
      <span>{label}</span>
    </div>
  );
}
