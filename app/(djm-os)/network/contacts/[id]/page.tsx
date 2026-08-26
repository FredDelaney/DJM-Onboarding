'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  MessageCircleMore,
  Phone,
  Sparkles,
  UserRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';

export default function ContactWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [prep, setPrep] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [summary, setSummary] = useState('');
  const [followup, setFollowup] = useState('');

  const load = async () => {
    setError('');
    try {
      const [person, prepare, routeData, readinessData] = await Promise.all([
        djmRpc('djm_network_person', { p_person_id: id }),
        djmRpc('djm_prepare_me', { p_person_id: id }),
        djmRpc<any[]>('djm_best_route_to_person', { p_person_id: id }),
        djmRpc('djm_contact_readiness', { p_person_id: id }),
      ]);
      setData(person);
      setPrep(prepare);
      setRoutes(routeData || []);
      setReadiness(readinessData || null);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const currentEmployment = useMemo(
    () => (data?.employment || []).find((x: any) => x.is_current) || data?.employment?.[0],
    [data],
  );

  const logInteraction = async (event: FormEvent) => {
    event.preventDefault();
    if (!summary.trim()) return;

    try {
      await djmRpc('djm_network_log_contact_interaction', {
        p_person_id: id,
        p_channel: channel,
        p_summary: summary.trim(),
        p_organisation_id: currentEmployment?.organisation_id || null,
        p_occurred_at: new Date().toISOString(),
        p_create_followup_at: followup ? new Date(followup).toISOString() : null,
        p_followup_title: null,
      });
      setSummary('');
      setFollowup('');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const deleteContact = async () => {
    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'club_contact',
        p_entity_id: id,
      });
      const ok = window.confirm(
        `Permanently delete ${person?.full_name || 'this contact'}? This removes ${impact?.relationships || 0} DJM relationship records and ${impact?.employments || 0} employment records. Historical interactions that can safely survive will be detached. This cannot be undone.`,
      );
      if (!ok) return;
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'club_contact',
        p_entity_id: id,
        p_confirm: true,
      });
      router.push('/network');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const person = data?.person;
  const best = routes?.[0];
  const lastInteraction = prep?.last_interaction;
  const openNeeds = prep?.open_needs || [];
  const openTasks = prep?.open_tasks || [];
  const recentClaims = prep?.recent_claims || [];
  const upcomingMeetings = prep?.upcoming_meetings || [];
  const whatsapp = (data?.contacts || []).find((c: any) => c.channel === 'whatsapp')?.value;
  const cleanWhatsapp = String(whatsapp || '').replace(/\D/g, '');

  return (
    <DjmOsShell
      eyebrow="Club contact relationship"
      title={person?.full_name || 'Club contact'}
    >
      <div className="djm-os-toolbar">
        <Link href="/network" className="djm-os-secondary-button" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Network
        </Link>
        <div className="djm-os-button-row">
        {currentEmployment?.organisation_id ? (
          <Link
            href={`/network/clubs/${currentEmployment.organisation_id}`}
            className="djm-os-secondary-button"
            style={{ textDecoration: 'none' }}
          >
            {currentEmployment.organisation_name}
          </Link>
        ) : null}
          <button className="djm-os-secondary-button" type="button" onClick={() => void deleteContact()}>
            Delete contact
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

      {!data ? (
        <div className="djm-os-empty"><UserRound size={25} /><p>Loading relationship…</p></div>
      ) : (
        <>
          <section className="djm-os-metrics">
            <Metric label="Current club" value={currentEmployment?.organisation_name || '—'} />
            <Metric label="Role" value={currentEmployment?.role_title || '—'} />
            <Metric label="Best DJM route" value={best?.team_member_name || '—'} />
            <Metric label="Relationship" value={data.relationships?.[0]?.strength_score ?? 0} />
          </section>

          {readiness ? (
            <section
              className="djm-os-panel"
              style={{
                marginBottom: 16,
                borderColor:
                  readiness.state === 'green'
                    ? 'rgba(32,124,91,.35)'
                    : readiness.state === 'red'
                      ? 'rgba(169,56,56,.28)'
                      : 'rgba(244,196,48,.55)',
              }}
            >
              <div className="djm-os-panel-head">
                <div>
                  <p className="djm-os-eyebrow">Contact now?</p>
                  <h2 style={{ textTransform: 'capitalize' }}>
                    {readiness.state === 'green'
                      ? 'Green · good reason to contact'
                      : readiness.state === 'red'
                        ? 'Red · do not chase now'
                        : 'Amber · be deliberate'}
                  </h2>
                  <p>{readiness.reason}</p>
                </div>
                <div className="djm-os-score">
                  <b>{readiness.relationship_strength || 0}</b>
                  <small>relationship</small>
                </div>
              </div>
            </section>
          ) : null}

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Prepare me</h2>
                  <p>The few things worth remembering before you message or call.</p>
                </div>
                <Sparkles size={20} />
              </div>
              <div className="djm-os-form">
                {lastInteraction ? (
                  <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}>
                    <strong>Last conversation</strong>
                    <p>{lastInteraction.summary}</p>
                    <small>{lastInteraction.channel} · {lastInteraction.team_member || 'DJM'} · {compactDateTime(lastInteraction.occurred_at)}</small>
                  </div>
                ) : null}

                {openNeeds.length ? (
                  <div>
                    <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>Open club needs</strong>
                    {openNeeds.slice(0, 4).map((need: any) => (
                      <p key={need.id} style={{ margin: '8px 0 0', fontSize: 12 }}>
                        {need.organisation_name} · {need.position || need.title} · {need.status}
                      </p>
                    ))}
                  </div>
                ) : null}

                {openTasks.length ? (
                  <div>
                    <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>Open promises</strong>
                    {openTasks.slice(0, 4).map((task: any) => (
                      <p key={task.id} style={{ margin: '8px 0 0', fontSize: 12 }}>
                        {task.title}{task.due_at ? ` · ${compactDateTime(task.due_at)}` : ''}
                      </p>
                    ))}
                  </div>
                ) : null}

                {recentClaims.length ? (
                  <div>
                    <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>Recent intelligence</strong>
                    {recentClaims.slice(0, 4).map((claim: any, index: number) => (
                      <p key={`${claim.claim_key}-${index}`} style={{ margin: '8px 0 0', fontSize: 12 }}>
                        {claim.claim_key || claim.claim_type}: {typeof claim.value_json === 'string' ? claim.value_json : JSON.stringify(claim.value_json)}
                      </p>
                    ))}
                  </div>
                ) : null}

                {upcomingMeetings.length ? (
                  <div>
                    <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>Upcoming</strong>
                    {upcomingMeetings.slice(0, 3).map((meeting: any) => (
                      <p key={meeting.id} style={{ margin: '8px 0 0', fontSize: 12 }}>
                        {meeting.title} · {compactDateTime(meeting.starts_at)}
                      </p>
                    ))}
                  </div>
                ) : null}

                {!lastInteraction && !openNeeds.length && !openTasks.length && !recentClaims.length && !upcomingMeetings.length ? (
                  <p style={{ margin: 0, color: '#66788a', fontSize: 12 }}>
                    There is not enough history yet. The next conversation will start building DJM memory.
                  </p>
                ) : null}

                {cleanWhatsapp ? (
                  <a
                    href={`https://wa.me/${cleanWhatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="djm-os-primary-button"
                    style={{ textDecoration: 'none' }}
                  >
                    <MessageCircleMore size={15} />
                    Open WhatsApp
                  </a>
                ) : null}
              </div>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Log conversation</h2>
                  <p>Manual fallback for WhatsApp, phone or meetings.</p>
                </div>
                <MessageCircleMore size={20} />
              </div>

              <form className="djm-os-form" onSubmit={logInteraction}>
                <label>
                  Channel
                  <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Phone</option>
                    <option value="meeting">Meeting</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="email">Email</option>
                    <option value="instagram">Instagram</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  What happened?
                  <textarea
                    rows={6}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="What did they say, what did DJM promise, what matters next?"
                  />
                </label>
                <label>
                  Follow up
                  <input type="datetime-local" value={followup} onChange={(e) => setFollowup(e.target.value)} />
                </label>
                <button className="djm-os-primary-button" type="submit" disabled={!summary.trim()}>
                  <CalendarClock size={15} />
                  Save conversation
                </button>
              </form>
            </section>
          </div>

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Contact methods</h2>
                  <p>Shared across DJM.</p>
                </div>
              </div>
              <div className="djm-os-list">
                {(data.contacts || []).map((contact: any) => (
                  <article className="djm-os-list-row" key={contact.id}>
                    <div>
                      <strong>{contact.channel}</strong>
                      <p>{contact.value}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>DJM relationship ownership</h2>
                  <p>Who knows this person and how strongly?</p>
                </div>
              </div>
              <div className="djm-os-list">
                {(data.relationships || []).map((r: any) => (
                  <article className="djm-os-list-row" key={r.team_member_id}>
                    <div>
                      <strong>{r.display_name}</strong>
                      <p>{r.relationship_notes || 'No notes yet'}</p>
                      <small>Last meaningful {compactDateTime(r.last_meaningful_at)}</small>
                    </div>
                    <div className="djm-os-score">
                      <b>{r.strength_score || 0}</b>
                      <small>strength</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="djm-os-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>Relationship timeline</h2>
                <p>Every important interaction retained.</p>
              </div>
            </div>
            {(data.interactions || []).length ? (
              <div className="djm-os-list">
                {data.interactions.map((item: any) => (
                  <article className="djm-os-feed-row" key={item.id}>
                    <span className="djm-os-feed-dot" />
                    <div>
                      <strong>{item.channel} · {item.team_member_name || 'DJM'}</strong>
                      <p>{item.summary}</p>
                      <small>{compactDateTime(item.occurred_at)}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="djm-os-empty"><Phone size={25} /><p>No conversations recorded yet.</p></div>
            )}
          </section>
        </>
      )}
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="djm-os-metric"><strong style={{ fontSize: typeof value === 'string' && value.length > 15 ? 17 : undefined }}>{value}</strong><span>{label}</span></div>;
}
