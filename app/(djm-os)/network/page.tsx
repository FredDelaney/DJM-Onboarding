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
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  FileUp,
  MessageCircleMore,
  RefreshCw,
  Search,
  Sparkles,
  UploadCloud,
  UserRound,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import {
  compactDateTime,
  djmInvoke,
  djmRpc,
  friendlyError,
  initials,
} from '@/lib/djm-os';

type Tab = 'today' | 'people' | 'clubs' | 'capture' | 'imports';

export default function NetworkPage() {
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [people, setPeople] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [captureChannel, setCaptureChannel] = useState('whatsapp');

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState('whatsapp');
  const [importPreview, setImportPreview] = useState<any>(null);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const now = new Date();
      const future = new Date(now.getTime() + 14 * 86400000);

      const [
        peopleData,
        clubData,
        taskData,
        suggestionData,
        reviewData,
        activityData,
        notificationData,
        importData,
        meetingData,
      ] = await Promise.all([
        djmRpc<any[]>('djm_network_people', {
          p_search: null,
          p_limit: 100,
        }),
        djmRpc<any[]>('djm_network_organisations', {
          p_search: null,
          p_limit: 100,
        }),
        djmRpc<any[]>('djm_network_tasks', { p_scope: 'mine' }),
        djmRpc<any[]>('djm_network_suggestions'),
        djmRpc<any[]>('djm_network_review_inbox', { p_scope: 'all' }),
        djmRpc<any[]>('djm_network_activity', { p_limit: 40 }),
        djmRpc<any[]>('djm_notifications', { p_limit: 40 }),
        djmRpc<any[]>('djm_import_history', { p_limit: 20 }),
        djmRpc<any[]>('djm_network_meetings', {
          p_scope: 'mine',
          p_from: now.toISOString(),
          p_to: future.toISOString(),
        }),
      ]);

      setPeople(peopleData || []);
      setClubs(clubData || []);
      setTasks(taskData || []);
      setSuggestions(suggestionData || []);
      setReviews(reviewData || []);
      setActivity(activityData || []);
      setNotifications(notificationData || []);
      setImports(importData || []);
      setMeetings(meetingData || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [
        p.full_name,
        p.current_organisation,
        p.role_title,
        p.country,
        p.email,
        p.whatsapp,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [people, search]);

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter((club) =>
      [club.name, club.country, club.city]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [clubs, search]);

  const completeTask = async (id: string) => {
    try {
      await djmRpc('djm_network_set_task_status', {
        p_task_id: id,
        p_status: 'completed',
      });
      setTasks((current) => current.filter((task) => task.id !== id));
      flash('Task completed');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const resolveReview = async (id: string, resolution: string) => {
    try {
      await djmRpc('djm_network_resolve_review', {
        p_review_id: id,
        p_resolution: resolution,
        p_note: null,
      });
      setReviews((current) => current.filter((item) => item.id !== id));
      flash(resolution === 'dismissed' ? 'Review dismissed' : 'Review resolved');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    const text = captureText.trim();
    if (!text) return;

    setBusy(true);
    setError('');

    try {
      await djmRpc('djm_network_capture_text', {
        p_text: text,
        p_channel: captureChannel,
        p_person_id: null,
        p_organisation_id: null,
        p_occurred_at: new Date().toISOString(),
      });
      setCaptureText('');
      flash('Captured into DJM Network');
      await load();
      setTab('today');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const makeImportForm = (dryRun: boolean) => {
    const form = new FormData();
    if (importFile) form.append('file', importFile);
    form.append('mode', importMode);
    form.append('dry_run', dryRun ? 'true' : 'false');
    form.append('timezone', 'Europe/Rome');
    return form;
  };

  const previewImport = async () => {
    if (!importFile) return;
    setBusy(true);
    setError('');

    try {
      const result = await djmInvoke(
        'djm-network-import',
        makeImportForm(true),
      );
      setImportPreview(result);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!importFile) return;
    setBusy(true);
    setError('');

    try {
      const result: any = await djmInvoke(
        'djm-network-import',
        makeImportForm(false),
      );
      setImportPreview(result);
      flash('Import completed');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const rollbackImport = async (batchId: string) => {
    const ok = window.confirm(
      'Undo this import batch? DJM will remove records created only by this batch and preserve records still used elsewhere.',
    );
    if (!ok) return;

    try {
      await djmRpc('djm_rollback_import', { p_batch_id: batchId });
      flash('Import rolled back safely');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <DjmOsShell
      eyebrow="Relationships, memory and action"
      title="DJM Network"
    >
      {toast ? <div className="djm-os-toast">{toast}</div> : null}
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="djm-os-toolbar">
        <div className="djm-os-tabs">
          {[
            ['today', 'Today'],
            ['people', 'People'],
            ['clubs', 'Clubs'],
            ['capture', 'Capture'],
            ['imports', 'Imports'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? 'is-active' : ''}
              onClick={() => setTab(value as Tab)}
            >
              {label}
              {value === 'today' && reviews.length > 0 ? (
                <span className="djm-os-tab-count">{reviews.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="djm-os-secondary-button"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {tab === 'today' ? (
        <>
          <section className="djm-os-metrics">
            <Metric label="Shared contacts" value={people.length} />
            <Metric label="Clubs" value={clubs.length} />
            <Metric label="Open tasks" value={tasks.length} tone={tasks.length ? 'attention' : 'normal'} />
            <Metric label="Needs review" value={reviews.length} tone={reviews.length ? 'attention' : 'normal'} />
            <Metric label="Upcoming calls" value={meetings.length} />
          </section>

          <div className="djm-os-grid djm-os-grid-2">
            <Panel
              icon={<CheckCircle2 size={18} />}
              title="Must do"
              subtitle="Commitments, not AI noise"
            >
              {tasks.length ? (
                <div className="djm-os-list">
                  {tasks.slice(0, 8).map((task) => (
                    <article className="djm-os-list-row" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <p>
                          {[task.person_name, task.organisation_name]
                            .filter(Boolean)
                            .join(' · ') || 'DJM'}
                        </p>
                        <small>
                          {task.due_at
                            ? `Due ${compactDateTime(task.due_at)}`
                            : 'No deadline'}
                        </small>
                      </div>
                      <button
                        className="djm-os-icon-button is-success"
                        onClick={() => void completeTask(task.id)}
                        aria-label="Complete task"
                      >
                        <CheckCircle2 size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No open commitments." />
              )}
            </Panel>

            <Panel
              icon={<Sparkles size={18} />}
              title="Worth doing"
              subtitle="Relationship and opportunity signals"
            >
              {suggestions.length ? (
                <div className="djm-os-list">
                  {suggestions.slice(0, 8).map((item) => (
                    <article className="djm-os-list-row" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.reason || 'DJM intelligence suggestion'}</p>
                        <small>
                          Score {item.score || 0}
                          {item.person_name ? ` · ${item.person_name}` : ''}
                          {item.organisation_name
                            ? ` · ${item.organisation_name}`
                            : ''}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No relationship suggestions right now." />
              )}
            </Panel>
          </div>

          <div className="djm-os-grid djm-os-grid-2">
            <Panel
              icon={<AlertCircle size={18} />}
              title="Review inbox"
              subtitle="Only ambiguity that actually needs a human"
            >
              {reviews.length ? (
                <div className="djm-os-list">
                  {reviews.slice(0, 6).map((item) => (
                    <article className="djm-os-list-row" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail || item.review_type}</p>
                        <small>
                          {item.owner_name || 'DJM'} ·{' '}
                          {compactDateTime(item.created_at)}
                        </small>
                      </div>
                      <div className="djm-os-row-actions">
                        <button
                          className="djm-os-mini-button"
                          onClick={() =>
                            void resolveReview(item.id, 'resolved')
                          }
                        >
                          Resolve
                        </button>
                        <button
                          className="djm-os-mini-button is-muted"
                          onClick={() =>
                            void resolveReview(item.id, 'dismissed')
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="Nothing needs human review." />
              )}
            </Panel>

            <Panel
              icon={<Clock3 size={18} />}
              title="Recent DJM activity"
              subtitle="One company memory"
            >
              {activity.length ? (
                <div className="djm-os-list">
                  {activity.slice(0, 8).map((item) => (
                    <article className="djm-os-feed-row" key={item.id}>
                      <span className="djm-os-feed-dot" />
                      <div>
                        <strong>
                          {item.actor_name || 'DJM'} ·{' '}
                          {String(item.event_type || '')
                            .replaceAll('_', ' ')
                            .toLowerCase()}
                        </strong>
                        <p>
                          {[item.person_name, item.organisation_name]
                            .filter(Boolean)
                            .join(' · ') || item.source || 'DJM OS'}
                        </p>
                        <small>{compactDateTime(item.occurred_at)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="Activity will appear as DJM works." />
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {tab === 'people' ? (
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Shared people</h2>
              <p>One contact record across Jesse, Dapo and Moses.</p>
            </div>
            <SearchBox value={search} onChange={setSearch} />
          </div>

          {filteredPeople.length ? (
            <div className="djm-os-card-grid">
              {filteredPeople.map((person) => (
                <article className="djm-os-person-card" key={person.id}>
                  <div className="djm-os-avatar">{initials(person.full_name)}</div>
                  <div className="djm-os-person-main">
                    <strong>{person.full_name}</strong>
                    <span>
                      {[person.role_title, person.current_organisation]
                        .filter(Boolean)
                        .join(' · ') || 'Relationship'}
                    </span>
                    <small>
                      {[person.country, person.city]
                        .filter(Boolean)
                        .join(' · ') || 'Location not set'}
                    </small>
                  </div>
                  <div className="djm-os-score">
                    <b>{person.relationship_score || 0}</b>
                    <small>relationship</small>
                  </div>
                  <div className="djm-os-card-contact">
                    {person.whatsapp ? (
                      <span>
                        <MessageCircleMore size={14} /> {person.whatsapp}
                      </span>
                    ) : null}
                    {person.email ? <span>{person.email}</span> : null}
                    <small>
                      Last contact {compactDateTime(person.last_interaction_at)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="No contacts match this search." />
          )}
        </section>
      ) : null}

      {tab === 'clubs' ? (
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Shared clubs</h2>
              <p>Contacts, current demand and relationship coverage.</p>
            </div>
            <SearchBox value={search} onChange={setSearch} />
          </div>

          {filteredClubs.length ? (
            <div className="djm-os-card-grid">
              {filteredClubs.map((club) => (
                <article className="djm-os-club-card" key={club.id}>
                  <div className="djm-os-club-icon">
                    <Building2 size={19} />
                  </div>
                  <div>
                    <strong>{club.name}</strong>
                    <p>
                      {[club.city, club.country].filter(Boolean).join(', ') ||
                        'Location not set'}
                    </p>
                  </div>
                  <div className="djm-os-club-stats">
                    <span>
                      <b>{club.contacts_count || 0}</b>
                      contacts
                    </span>
                    <span>
                      <b>{club.active_needs_count || 0}</b>
                      active needs
                    </span>
                  </div>
                  <small>
                    Last interaction {compactDateTime(club.last_interaction_at)}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="No clubs match this search." />
          )}
        </section>
      ) : null}

      {tab === 'capture' ? (
        <div className="djm-os-grid djm-os-grid-2">
          <section className="djm-os-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>Quick capture</h2>
                <p>Drop useful relationship intelligence here. DJM handles the admin.</p>
              </div>
              <MessageCircleMore size={22} />
            </div>

            <form onSubmit={submitCapture} className="djm-os-form">
              <label>
                Channel
                <select
                  value={captureChannel}
                  onChange={(e) => setCaptureChannel(e.target.value)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="phone">Phone call</option>
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                Message, call note or intelligence
                <textarea
                  rows={10}
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  placeholder="Example: Spoke with John at Club X. They still need a left-footed CB under 27, around €250k salary. I said I'd send two options tomorrow."
                />
              </label>

              <button
                className="djm-os-primary-button"
                type="submit"
                disabled={!captureText.trim() || busy}
              >
                <Sparkles size={16} />
                Capture into DJM
              </button>
            </form>
          </section>

          <section className="djm-os-panel djm-os-dark-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>What happens automatically</h2>
                <p>No duplicate CRM entry.</p>
              </div>
            </div>

            <ol className="djm-os-process-list">
              <li><span>01</span> Store the source interaction</li>
              <li><span>02</span> Link the person and club where known</li>
              <li><span>03</span> Detect commitments and follow-ups</li>
              <li><span>04</span> Detect recruitment requirements</li>
              <li><span>05</span> Refresh player matches</li>
              <li><span>06</span> Send ambiguity to Review, not bad data</li>
            </ol>
          </section>
        </div>
      ) : null}

      {tab === 'imports' ? (
        <div className="djm-os-grid djm-os-grid-2">
          <section className="djm-os-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>Historical import</h2>
                <p>WhatsApp TXT/ZIP, contacts CSV or vCard.</p>
              </div>
              <UploadCloud size={22} />
            </div>

            <div className="djm-os-form">
              <label>
                Import type
                <select
                  value={importMode}
                  onChange={(e) => {
                    setImportMode(e.target.value);
                    setImportPreview(null);
                  }}
                >
                  <option value="whatsapp">WhatsApp history</option>
                  <option value="contacts">Contacts CSV / VCF</option>
                </select>
              </label>

              <label className="djm-os-file-drop">
                <FileUp size={26} />
                <strong>
                  {importFile ? importFile.name : 'Choose import file'}
                </strong>
                <span>
                  {importMode === 'whatsapp'
                    ? 'Export WhatsApp without media for the cleanest result.'
                    : 'CSV and VCF are supported.'}
                </span>
                <input
                  type="file"
                  accept={
                    importMode === 'whatsapp'
                      ? '.txt,.zip,text/plain,application/zip'
                      : '.csv,.vcf,text/csv,text/vcard'
                  }
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null);
                    setImportPreview(null);
                  }}
                />
              </label>

              <div className="djm-os-button-row">
                <button
                  type="button"
                  className="djm-os-secondary-button"
                  disabled={!importFile || busy}
                  onClick={() => void previewImport()}
                >
                  Preview safely
                </button>
                <button
                  type="button"
                  className="djm-os-primary-button"
                  disabled={!importFile || busy || !importPreview?.dry_run}
                  onClick={() => void commitImport()}
                >
                  Import
                </button>
              </div>

              {importPreview ? (
                <div className="djm-os-preview">
                  <strong>
                    {importPreview.dry_run ? 'Safe preview' : 'Import result'}
                  </strong>
                  <pre>{JSON.stringify(importPreview, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          </section>

          <section className="djm-os-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>Import history</h2>
                <p>Every batch remains auditable and reversible.</p>
              </div>
              <Download size={20} />
            </div>

            {imports.length ? (
              <div className="djm-os-list">
                {imports.map((item) => (
                  <article className="djm-os-list-row" key={item.batch_id}>
                    <div>
                      <strong>{item.source_name}</strong>
                      <p>
                        {item.source_type} · {item.status}
                      </p>
                      <small>
                        {item.processed_rows || 0}/{item.total_rows || 0} rows ·{' '}
                        {item.duplicate_rows || 0} duplicates ·{' '}
                        {item.error_rows || 0} errors
                      </small>
                    </div>
                    {item.status !== 'rolled_back' ? (
                      <button
                        className="djm-os-mini-button is-muted"
                        onClick={() => void rollbackImport(item.batch_id)}
                      >
                        Undo
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="No historical imports yet." />
            )}
          </section>
        </div>
      ) : null}
    </DjmOsShell>
  );
}

function Metric({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: number;
  tone?: 'normal' | 'attention';
}) {
  return (
    <div className={`djm-os-metric ${tone === 'attention' ? 'is-attention' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="djm-os-panel">
      <div className="djm-os-panel-head">
        <div className="djm-os-panel-title">
          <span className="djm-os-panel-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="djm-os-empty">
      <UsersRound size={24} />
      <p>{text}</p>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="djm-os-search">
      <Search size={16} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
      />
    </label>
  );
}
