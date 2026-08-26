'use client';

import {
  Suspense,
  useEffect,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageCircle,
  Send,
} from 'lucide-react';

import {
  PlayerShell,
  usePlayerContext,
  LoadingScreen,
} from '@/components/PlayerShell';
import {
  fmtDate,
  supabase,
} from '@/lib/supabase';

function InboxContent() {
  const ctx = usePlayerContext();
  const search = useSearchParams();

  const [requests, setRequests] =
    useState<any[]>([]);
  const [expanded, setExpanded] =
    useState<string | null>(null);
  const [reply, setReply] =
    useState('');
  const [compose, setCompose] =
    useState(
      search.get('compose') === '1',
    );
  const [note, setNote] =
    useState('');
  const [busy, setBusy] =
    useState(false);
  const [toast, setToast] =
    useState('');

  const load = async () => {
    if (!ctx.player) return;

    const { data, error } = await supabase
      .from('player_requests')
      .select('*')
      .eq('player_id', ctx.player.id)
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      setToast(
        'Could not refresh DJM updates',
      );
      return;
    }

    setRequests(data || []);
  };

  useEffect(() => {
    void load();
  }, [ctx.player?.id]);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  const update = async (
    request: any,
  ) => {
    setBusy(true);

    const completedAt =
      new Date().toISOString();

    const { error } = await supabase
      .from('player_requests')
      .update({
        player_reply:
          reply ||
          request.player_reply ||
          null,
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', request.id);

    if (error) {
      setToast(
        'Could not send. Please try again.',
      );
      setBusy(false);
      return;
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? {
              ...item,
              player_reply:
                reply ||
                request.player_reply ||
                null,
              status: 'completed',
              completed_at: completedAt,
            }
          : item,
      ),
    );

    setReply('');
    setExpanded(null);
    setToast('Done');
    setTimeout(
      () => setToast(''),
      1600,
    );
    setBusy(false);

    void Promise.all([
      load(),
      ctx.refresh(),
    ]);
  };

  const send = async () => {
    if (!note.trim() || !ctx.player) {
      return;
    }

    setBusy(true);

    const { error } = await supabase
      .from('player_requests')
      .insert({
        player_id: ctx.player.id,
        title: `Note from ${
          ctx.player.preferred_name ||
          ctx.player.first_name ||
          'player'
        }`,
        message: null,
        request_type: 'message',
        status: 'open',
        player_reply: note.trim(),
        created_by: null,
      });

    if (error) {
      setToast(
        'Could not send. Please try again.',
      );
      setBusy(false);
      return;
    }

    setNote('');
    setCompose(false);
    setToast('Sent to DJM');
    setTimeout(
      () => setToast(''),
      1600,
    );
    setBusy(false);

    void load();
  };

  const open = requests.filter(
    (request) =>
      request.status === 'open' &&
      request.request_type !== 'message',
  );

  const messages = requests.filter(
    (request) =>
      request.request_type === 'message',
  );

  const done = requests.filter(
    (request) =>
      request.status === 'completed' &&
      request.request_type !== 'message',
  );

  return (
    <PlayerShell inboxCount={open.length}>
      <main className="narrow player-shell djm-updates-page">
        <header className="djm-updates-head">
          <div>
            <div className="section-kicker">
              DJM + YOU
            </div>
            <h1 className="page-title">
              DJM updates.
            </h1>
            <p className="page-intro">
              Anything that needs your attention lives here. No admin, no clutter.
            </p>
          </div>

          <button
            className="btn btn-navy btn-sm"
            onClick={() =>
              setCompose(!compose)
            }
          >
            <MessageCircle size={16} />
            Send a note
          </button>
        </header>

        {compose && (
          <section className="djm-note-composer">
            <div className="section-kicker">
              SEND DJM A NOTE
            </div>
            <h2>What do you need?</h2>
            <p>
              Keep it short. A question, update or something you want the agency to follow up.
            </p>
            <textarea
              className="textarea"
              value={note}
              onChange={(event) =>
                setNote(event.target.value)
              }
              placeholder="Type your note…"
              autoFocus
            />
            <div className="djm-note-actions">
              <button
                className="btn btn-quiet btn-sm"
                onClick={() =>
                  setCompose(false)
                }
              >
                Cancel
              </button>
              <button
                className="btn btn-navy btn-sm"
                disabled={
                  busy || !note.trim()
                }
                onClick={send}
              >
                Send to DJM
                <Send size={15} />
              </button>
            </div>
          </section>
        )}

        <section className="djm-action-section">
          <div className="djm-section-line">
            <div>
              <span>ACTION NEEDED</span>
              <strong>
                {open.length
                  ? `${open.length} waiting for you`
                  : 'Nothing waiting'}
              </strong>
            </div>
          </div>

          {open.length === 0 ? (
            <div className="djm-all-clear">
              <div>
                <Check size={22} />
              </div>
              <strong>You’re all clear.</strong>
              <span>
                When DJM needs something from you, it will appear here.
              </span>
            </div>
          ) : (
            <div className="stack">
              {open.map((request) => {
                const isOpen =
                  expanded === request.id;

                return (
                  <article
                    key={request.id}
                    className="djm-request-card"
                  >
                    <div className="djm-request-top">
                      <span className="djm-request-pill">
                        ACTION NEEDED
                      </span>
                      {request.due_at && (
                        <span className="djm-request-date">
                          <Clock3 size={13} />
                          {fmtDate(request.due_at)}
                        </span>
                      )}
                    </div>

                    <h2>{request.title}</h2>
                    {request.message && (
                      <p>{request.message}</p>
                    )}

                    <button
                      className="djm-request-open"
                      onClick={() => {
                        setExpanded(
                          isOpen
                            ? null
                            : request.id,
                        );
                        setReply(
                          request.player_reply || '',
                        );
                      }}
                    >
                      {isOpen
                        ? 'Close'
                        : 'Open'}
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {isOpen && (
                      <div className="djm-request-reply">
                        <label className="label">
                          Add a note to DJM
                          <span className="muted">
                            {' '}optional
                          </span>
                        </label>
                        <textarea
                          className="textarea"
                          value={reply}
                          onChange={(event) =>
                            setReply(
                              event.target.value,
                            )
                          }
                          placeholder="Anything DJM should know?"
                        />
                        <button
                          className="btn btn-navy btn-block"
                          disabled={busy}
                          onClick={() =>
                            update(request)
                          }
                        >
                          <Check size={16} />
                          Done
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {messages.length > 0 && (
          <section className="djm-history-section">
            <div className="section-kicker">
              NOTES WITH DJM
            </div>
            <div className="djm-history-list">
              {messages
                .slice(0, 8)
                .map((message) => (
                  <div
                    className="djm-history-row"
                    key={message.id}
                  >
                    <div className="djm-history-icon">
                      <MessageCircle size={16} />
                    </div>
                    <div>
                      <strong>
                        {message.created_by
                          ? 'DJM'
                          : 'You'}
                      </strong>
                      <span>
                        {message.created_by
                          ? message.message ||
                            message.title
                          : message.player_reply ||
                            message.title}
                      </span>
                    </div>
                    <small>
                      {fmtDate(
                        message.created_at,
                      )}
                    </small>
                  </div>
                ))}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section className="djm-history-section">
            <div className="section-kicker">
              PAST ACTIONS
            </div>
            <div className="djm-history-list">
              {done
                .slice(0, 6)
                .map((request) => (
                  <div
                    className="djm-history-row"
                    key={request.id}
                  >
                    <div className="djm-history-icon">
                      <Check size={16} />
                    </div>
                    <div>
                      <strong>
                        {request.title}
                      </strong>
                      <span>Completed</span>
                    </div>
                    <small>
                      {fmtDate(
                        request.completed_at ||
                          request.created_at,
                      )}
                    </small>
                  </div>
                ))}
            </div>
          </section>
        )}

        <div className="djm-updates-foot">
          <span>
            Need something from us?
          </span>
          <button
            onClick={() =>
              setCompose(true)
            }
          >
            Send DJM a note
            <ArrowRight size={14} />
          </button>
        </div>

        {toast && (
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </PlayerShell>
  );
}

export default function Inbox() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <InboxContent />
    </Suspense>
  );
}
