'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  MessageCircleMore,
  Pencil,
  Phone,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';

function cleanBriefText(value: unknown) {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/<attached:[^>]+>/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\[[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4},?[^\]]*\]\s*[^:]+:\s*/g, '')
    .replace(/\s*[•·]\s*\d+\s+pages?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulImportedMessage(value: string) {
  if (!value) return false;
  if (value.length < 12) return false;
  return !/^(thanks?|thank you|cheers|ok(?:ay)?|perfect|great|haha|ah+h+|yes|no)[!?. 🙏🏼😊👍]*$/i.test(value.trim());
}

function cleanClaimValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item)}`)
      .join(' · ');
  }
  return String(value ?? '');
}

function channelLabel(value: unknown) {
  const text = String(value || 'other').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const EMPTY_PROFILE = {
  full_name: '',
  preferred_name: '',
  country: '',
  city: '',
  club_name: '',
  club_country: '',
  role_title: '',
};

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
  const [savingConversation, setSavingConversation] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);

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

  useEffect(() => {
    if (!data?.person || editingProfile) return;
    setProfileForm({
      full_name: data.person.full_name || '',
      preferred_name: data.person.preferred_name || '',
      country: data.person.country || '',
      city: data.person.city || '',
      club_name: currentEmployment?.organisation_name || '',
      club_country: currentEmployment?.organisation_country || '',
      role_title: currentEmployment?.role_title || '',
    });
  }, [data, currentEmployment, editingProfile]);

  const logInteraction = async (event: FormEvent) => {
    event.preventDefault();
    if (!summary.trim() || savingConversation) return;

    setSavingConversation(true);
    setError('');
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
    } finally {
      setSavingConversation(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileForm.full_name.trim() || savingProfile) return;

    setSavingProfile(true);
    setError('');
    try {
      await djmRpc('djm_network_update_contact_profile', {
        p_person_id: id,
        p_full_name: profileForm.full_name.trim(),
        p_preferred_name: profileForm.preferred_name.trim() || null,
        p_country: profileForm.country.trim() || null,
        p_city: profileForm.city.trim() || null,
        p_club_name: profileForm.club_name.trim() || null,
        p_club_country: profileForm.club_country.trim() || null,
        p_role_title: profileForm.role_title.trim() || null,
      });
      setEditingProfile(false);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSavingProfile(false);
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
  const recentTimeline = prep?.recent_timeline || [];

  const cleanTimeline = recentTimeline
    .map((item: any) => ({ ...item, clean_text: cleanBriefText(item.body) }))
    .filter((item: any) => item.item_type === 'logged' ? Boolean(item.clean_text) : isUsefulImportedMessage(item.clean_text));

  const briefingTimeline = cleanTimeline.slice(0, 6);
  const lastTouchItem = recentTimeline[0] || null;
  const lastTouch = lastTouchItem?.occurred_at || lastInteraction?.occurred_at;
  const lastChannel = lastTouchItem?.channel || lastInteraction?.channel || '—';
  const whatsapp = (data?.contacts || []).find((c: any) => c.channel === 'whatsapp')?.value;
  const cleanWhatsapp = String(whatsapp || '').replace(/\D/g, '');

  return (
    <DjmOsShell eyebrow="Club contact relationship" title={person?.full_name || 'Club contact'}>
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
          <button
            className="djm-os-secondary-button"
            type="button"
            onClick={() => setEditingProfile((value) => !value)}
          >
            {editingProfile ? <X size={15} /> : <Pencil size={15} />}
            {editingProfile ? 'Cancel edit' : 'Edit profile'}
          </button>
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
          {editingProfile ? (
            <section className="djm-os-panel" style={{ marginBottom: 16 }}>
              <div className="djm-os-panel-head">
                <div>
                  <h2>Edit contact profile</h2>
                  <p>Name, current club and role stay editable even when DJM inferred them automatically.</p>
                </div>
                <Pencil size={19} />
              </div>
              <form className="djm-os-form djm-os-form-grid" onSubmit={saveProfile}>
                <label>
                  Full name
                  <input
                    required
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  />
                </label>
                <label>
                  Preferred name
                  <input
                    value={profileForm.preferred_name}
                    onChange={(e) => setProfileForm({ ...profileForm, preferred_name: e.target.value })}
                    placeholder="Chris"
                  />
                </label>
                <label>
                  Current club
                  <input
                    value={profileForm.club_name}
                    onChange={(e) => setProfileForm({ ...profileForm, club_name: e.target.value })}
                    placeholder="Wellington Phoenix"
                  />
                </label>
                <label>
                  Role
                  <input
                    value={profileForm.role_title}
                    onChange={(e) => setProfileForm({ ...profileForm, role_title: e.target.value })}
                    placeholder="Head Coach"
                  />
                </label>
                <label>
                  Person country
                  <input
                    value={profileForm.country}
                    onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                  />
                </label>
                <label>
                  City
                  <input
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  />
                </label>
                <label>
                  Club country
                  <input
                    value={profileForm.club_country}
                    onChange={(e) => setProfileForm({ ...profileForm, club_country: e.target.value })}
                    placeholder="New Zealand"
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'end' }}>
                  <button className="djm-os-primary-button" type="submit" disabled={savingProfile || !profileForm.full_name.trim()}>
                    <Save size={15} />
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

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
                      ? 'rgba(6,31,58,.22)'
                      : 'rgba(244,196,48,.55)',
              }}
            >
              <div className="djm-os-panel-head">
                <div>
                  <p className="djm-os-eyebrow">Contact now?</p>
                  <h2 style={{ textTransform: 'capitalize' }}>
                    {readiness.state === 'green'
                      ? 'Ready · good reason to contact'
                      : readiness.state === 'red'
                        ? 'Hold · do not chase now'
                        : 'Relationship-first · be deliberate'}
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
                  <p>One relationship memory across WhatsApp, calls, meetings and manual notes.</p>
                </div>
                <Sparkles size={20} />
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 9,
                  }}
                >
                  {[
                    ['Last touch', lastTouch ? compactDateTime(lastTouch) : 'No history'],
                    ['Channel', channelLabel(lastChannel)],
                    ['DJM owner', lastInteraction?.team_member || best?.team_member_name || 'DJM'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        padding: '12px 13px',
                        border: '1px solid #e5ebf0',
                        borderRadius: 12,
                        background: '#f8fafb',
                      }}
                    >
                      <small
                        style={{
                          display: 'block',
                          marginBottom: 5,
                          color: '#7c8b99',
                          fontSize: 9,
                          fontWeight: 850,
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </small>
                      <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>{value}</strong>
                    </div>
                  ))}
                </div>

                {briefingTimeline.length ? (
                  <div
                    style={{
                      padding: 14,
                      border: '1px solid #e1e8ed',
                      borderRadius: 14,
                      background: 'white',
                    }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>Recent context</strong>
                      <span style={{ display: 'block', marginTop: 2, color: '#7b8b99', fontSize: 10 }}>
                        Imported messages and manually logged conversations are shown together by time.
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {briefingTimeline.map((item: any) => {
                        const isLogged = item.item_type === 'logged';
                        const inbound = item.direction === 'inbound';
                        const actor = isLogged
                          ? `${channelLabel(item.channel)} note · ${item.team_member_name || item.actor_label || 'DJM'}`
                          : item.direction === 'outbound'
                            ? 'DJM'
                            : person?.preferred_name || person?.full_name || 'Contact';
                        return (
                          <div
                            key={`${item.item_type}-${item.id}`}
                            style={{
                              padding: '10px 11px',
                              borderRadius: 11,
                              background: isLogged ? '#eef4f8' : inbound ? 'rgba(244,196,48,.10)' : '#f7f9fb',
                              borderLeft: isLogged
                                ? '3px solid var(--djm-navy)'
                                : inbound
                                  ? '3px solid var(--djm-yellow)'
                                  : '3px solid #cbd6df',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <strong style={{ color: 'var(--djm-navy)', fontSize: 10 }}>{actor}</strong>
                              <small style={{ color: '#8a99a7', fontSize: 9 }}>
                                {compactDateTime(item.occurred_at)}
                              </small>
                            </div>
                            <p style={{ margin: '5px 0 0', color: '#31465b', fontSize: 12, lineHeight: 1.5 }}>
                              {item.clean_text.length > 360 ? `${item.clean_text.slice(0, 357)}…` : item.clean_text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {(openTasks.length || openNeeds.length || recentClaims.length || upcomingMeetings.length) ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {openTasks.length ? (
                      <BriefCard title="Open promises" attention>
                        {openTasks.slice(0, 3).map((task: any) => (
                          <BriefLine key={task.id} text={task.title} meta={task.due_at ? compactDateTime(task.due_at) : 'No deadline'} />
                        ))}
                      </BriefCard>
                    ) : null}

                    {openNeeds.length ? (
                      <BriefCard title="Club needs">
                        {openNeeds.slice(0, 3).map((need: any) => (
                          <BriefLine
                            key={need.id}
                            text={need.position || need.title}
                            meta={[need.organisation_name, need.status].filter(Boolean).join(' · ')}
                          />
                        ))}
                      </BriefCard>
                    ) : null}

                    {recentClaims.length ? (
                      <BriefCard title="Useful intelligence">
                        {recentClaims.slice(0, 3).map((claim: any, index: number) => (
                          <BriefLine
                            key={`${claim.claim_key}-${index}`}
                            text={(claim.claim_key || claim.claim_type || 'Intelligence').replaceAll('_', ' ')}
                            meta={cleanClaimValue(claim.value_json).slice(0, 180)}
                          />
                        ))}
                      </BriefCard>
                    ) : null}

                    {upcomingMeetings.length ? (
                      <BriefCard title="Upcoming">
                        {upcomingMeetings.slice(0, 3).map((meeting: any) => (
                          <BriefLine key={meeting.id} text={meeting.title} meta={compactDateTime(meeting.starts_at)} />
                        ))}
                      </BriefCard>
                    ) : null}
                  </div>
                ) : null}

                {!lastTouch && !openNeeds.length && !openTasks.length && !recentClaims.length && !upcomingMeetings.length ? (
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
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    <MessageCircleMore size={15} />
                    Message {person?.preferred_name || person?.full_name?.split(' ')[0] || 'contact'} on WhatsApp
                  </a>
                ) : null}
              </div>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Log conversation</h2>
                  <p>Add a call, meeting or message to the same relationship timeline.</p>
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
                <button className="djm-os-primary-button" type="submit" disabled={!summary.trim() || savingConversation}>
                  <CalendarClock size={15} />
                  {savingConversation ? 'Saving…' : 'Save conversation'}
                </button>
                <small style={{ color: '#7b8b99', fontSize: 10 }}>
                  Saved notes immediately appear in Recent context and feed DJM follow-up / club-need intelligence.
                </small>
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
                <h2>Full conversation timeline</h2>
                <p>WhatsApp imports and manual conversations together, newest first.</p>
              </div>
            </div>
            {cleanTimeline.length ? (
              <div className="djm-os-list">
                {cleanTimeline.map((item: any) => (
                  <article className="djm-os-feed-row" key={`${item.item_type}-${item.id}`}>
                    <span className="djm-os-feed-dot" />
                    <div>
                      <strong>
                        {item.item_type === 'logged'
                          ? `${channelLabel(item.channel)} note · ${item.team_member_name || item.actor_label || 'DJM'}`
                          : item.direction === 'outbound'
                            ? 'WhatsApp · DJM'
                            : `WhatsApp · ${person?.preferred_name || person?.full_name || 'Contact'}`}
                      </strong>
                      <p>{item.clean_text.length > 520 ? `${item.clean_text.slice(0, 517)}…` : item.clean_text}</p>
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

function BriefCard({
  title,
  attention = false,
  children,
}: {
  title: string;
  attention?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 13,
        borderRadius: 12,
        border: attention ? '1px solid rgba(244,196,48,.62)' : '1px solid #e4eaef',
        background: attention ? 'rgba(244,196,48,.07)' : '#fbfcfd',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 8, color: 'var(--djm-navy)', fontSize: 11 }}>
        {title}
      </strong>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  );
}

function BriefLine({ text, meta }: { text: string; meta?: string; key?: string }) {
  return (
    <div>
      <p style={{ margin: 0, color: '#2d4358', fontSize: 11, fontWeight: 750, lineHeight: 1.4 }}>{text}</p>
      {meta ? (
        <small style={{ display: 'block', marginTop: 2, color: '#8392a0', fontSize: 9, lineHeight: 1.4 }}>
          {meta}
        </small>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="djm-os-metric">
      <strong style={{ fontSize: typeof value === 'string' && value.length > 15 ? 17 : undefined }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
