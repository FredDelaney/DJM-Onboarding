'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  MessageCircleMore,
  Target,
  UserRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError, initials } from '@/lib/djm-os';

export default function ClubWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setData(await djmRpc('djm_network_club_workspace', { p_organisation_id: id }));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const closeTask = async (taskId: string) => {
    await djmRpc('djm_network_set_task_status', {
      p_task_id: taskId,
      p_status: 'completed',
    });
    await load();
  };

  const deleteClub = async () => {
    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'club',
        p_entity_id: id,
      });
      const ok = window.confirm(
        `Permanently delete ${org?.name || 'this club'}? This will remove ${impact?.contacts || 0} club relationships, ${impact?.needs || 0} club needs and ${impact?.deals || 0} Deal Rooms. Conversation records that can safely survive will be detached rather than destroyed. This cannot be undone.`,
      );
      if (!ok) return;
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'club',
        p_entity_id: id,
        p_confirm: true,
      });
      router.push('/network');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const org = data?.organisation;
  const summary = data?.summary || {};

  return (
    <DjmOsShell
      eyebrow="Club relationship workspace"
      title={org?.name || 'Club'}
    >
      <div className="djm-os-toolbar">
        <Link href="/network" className="djm-os-secondary-button" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Network
        </Link>
        <div className="djm-os-button-row">
          {org?.website_url ? (
            <a className="djm-os-secondary-button" href={org.website_url} target="_blank" rel="noreferrer">
              Club website
            </a>
          ) : null}
          <button className="djm-os-secondary-button" type="button" onClick={() => void deleteClub()}>
            Delete club
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
        <div className="djm-os-empty"><Building2 size={25} /><p>{busy ? 'Loading club…' : 'Club not found.'}</p></div>
      ) : (
        <>
          <section className="djm-os-metrics">
            <Metric label="Club contacts" value={summary.contact_count || 0} />
            <Metric label="Active needs" value={summary.active_need_count || 0} />
            <Metric label="Open tasks" value={summary.open_task_count || 0} />
            <Metric label="Last contact" value={summary.last_interaction_at ? compactDateTime(summary.last_interaction_at) : '—'} />
          </section>

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Best routes in</h2>
                  <p>Who should DJM use to approach this club?</p>
                </div>
              </div>
              {(data.best_routes || []).length ? (
                <div className="djm-os-list">
                  {data.best_routes.map((route: any) => (
                    <article className="djm-os-list-row" key={`${route.person_id}-${route.team_member_id}`}>
                      <div>
                        <strong>{route.person_name}</strong>
                        <p>{[route.role_title, route.team_member_name].filter(Boolean).join(' · ')}</p>
                        <small>Relationship {route.relationship_strength || 0} · access {route.access_score || 0}</small>
                      </div>
                      <div className="djm-os-score">
                        <b>{route.route_score || 0}</b>
                        <small>route</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <Empty text="No relationship routes yet." />}
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Open commitments</h2>
                  <p>Things DJM actually needs to do for this club.</p>
                </div>
              </div>
              {(data.open_tasks || []).length ? (
                <div className="djm-os-list">
                  {data.open_tasks.map((task: any) => (
                    <article className="djm-os-list-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <p>{[task.person_name, task.owner_name].filter(Boolean).join(' · ')}</p>
                        <small>{task.due_at ? `Due ${compactDateTime(task.due_at)}` : 'No deadline'}</small>
                      </div>
                      <button className="djm-os-icon-button is-success" onClick={() => void closeTask(task.id)}>
                        <CheckCircle2 size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : <Empty text="No open commitments." />}
            </section>
          </div>

          <section className="djm-os-panel" style={{ marginBottom: 16 }}>
            <div className="djm-os-panel-head">
              <div>
                <h2>Club contacts</h2>
                <p>Current decision-makers and DJM relationship ownership.</p>
              </div>
            </div>
            {(data.contacts || []).length ? (
              <div className="djm-os-card-grid">
                {data.contacts.map((person: any) => (
                  <Link
                    href={`/network/contacts/${person.id}`}
                    className="djm-os-person-card"
                    key={person.id}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="djm-os-avatar">{initials(person.full_name)}</div>
                    <div className="djm-os-person-main">
                      <strong>{person.full_name}</strong>
                      <span>{person.role_title || 'Club contact'}</span>
                      <small>{person.best_owner ? `Best DJM route: ${person.best_owner}` : 'Relationship not assigned'}</small>
                    </div>
                    <div className="djm-os-score">
                      <b>{person.relationship_strength || 0}</b>
                      <small>relationship</small>
                    </div>
                    <div className="djm-os-card-contact">
                      {person.whatsapp ? <span><MessageCircleMore size={14} /> {person.whatsapp}</span> : null}
                      {person.email ? <span>{person.email}</span> : null}
                      <small>Last contact {compactDateTime(person.last_interaction_at)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <Empty text="No current club contacts yet." />}
          </section>

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Club needs</h2>
                  <p>Current and historical recruitment demand.</p>
                </div>
              </div>
              {(data.needs || []).length ? (
                <div className="djm-os-list">
                  {data.needs.map((need: any) => (
                    <article className="djm-os-list-row" key={need.id}>
                      <div>
                        <strong>{need.title || need.position}</strong>
                        <p>{[need.position, need.preferred_foot, need.transfer_type].filter(Boolean).join(' · ')}</p>
                        <small>{need.status} · {need.match_count || 0} matches</small>
                      </div>
                      <div className="djm-os-score">
                        <b>{Math.round(Number(need.top_match_score || 0))}</b>
                        <small>best match</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <Empty text="No club needs recorded." />}
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Relationship timeline</h2>
                  <p>Conversations, events and changes in one history.</p>
                </div>
              </div>
              {(data.timeline || []).length ? (
                <div className="djm-os-list">
                  {data.timeline.slice(0, 30).map((item: any) => (
                    <article className="djm-os-feed-row" key={`${item.item_type}-${item.id}`}>
                      <span className="djm-os-feed-dot" />
                      <div>
                        <strong>{item.person_name || item.team_member_name || item.subtype}</strong>
                        <p>{item.summary}</p>
                        <small>{item.subtype} · {compactDateTime(item.occurred_at)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <Empty text="No club timeline yet." />}
            </section>
          </div>
        </>
      )}
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="djm-os-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="djm-os-empty"><Target size={24} /><p>{text}</p></div>;
}
