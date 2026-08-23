'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  Clock3,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import {
  PlayerShell,
  usePlayerContext,
  LoadingScreen,
} from '@/components/PlayerShell';

import { fmtDate, supabase } from '@/lib/supabase';

function InboxContent() {
  const ctx = usePlayerContext();
  const search = useSearchParams();

  const [requests, setRequests] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [compose, setCompose] = useState(search.get('compose') === '1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    if (!ctx.player) return;

    const { data, error } = await supabase
      .from('player_requests')
      .select('*')
      .eq('player_id', ctx.player.id)
      .order('created_at', { ascending: false });

    if (error) {
      setToast('Could not refresh inbox');
      return;
    }

    setRequests(data || []);
  };

  useEffect(() => {
    load();
  }, [ctx.player?.id]);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  const update = async (r: any, status = 'completed') => {
    setBusy(true);

    const { error } = await supabase
      .from('player_requests')
      .update({
        player_reply: reply || r.player_reply || null,
        status,
        completed_at:
          status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', r.id);

    if (error) {
      setToast('Could not send. Please try again.');
      setBusy(false);
      return;
    }

    setReply('');
    setExpanded(null);

    setToast(
      status === 'completed'
        ? 'Sent to DJM'
        : 'Reply saved'
    );

    setTimeout(() => setToast(''), 1800);

    await load();
    await ctx.refresh();

    setBusy(false);
  };

  const send = async () => {
    if (!note.trim() || !ctx.player) return;

    setBusy(true);

    const { error } = await supabase
      .from('player_requests')
      .insert({
        player_id: ctx.player.id,
        title: `Message from ${
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
      setToast('Could not send. Please try again.');
      setBusy(false);
      return;
    }

    setNote('');
    setCompose(false);

    setToast('Message sent to DJM');
    setTimeout(() => setToast(''), 1800);

    await load();

    setBusy(false);
  };

  const open = requests.filter(
    (r) =>
      r.status === 'open' &&
      r.request_type !== 'message'
  );

  const messages = requests.filter(
    (r) => r.request_type === 'message'
  );

  const done = requests.filter(
    (r) =>
      r.status === 'completed' &&
      r.request_type !== 'message'
  );

  return (
    <PlayerShell inboxCount={open.length}>
      <main className="narrow player-shell">
        <div
          className="row-between"
          style={{
            alignItems: 'flex-end',
            margin: '14px 0 28px',
          }}
        >
          <div>
            <div className="section-kicker">
              DJM INBOX
            </div>

            <h1
              className="page-title"
              style={{ marginBottom: 0 }}
            >
              Keep it simple.
            </h1>
          </div>

          <button
            className="btn btn-navy btn-sm"
            onClick={() => setCompose(!compose)}
          >
            <MessageCircle size={16} />
            Message DJM
          </button>
        </div>

        <p
          className="page-intro"
          style={{ marginBottom: 28 }}
        >
          Anything DJM needs from you appears here.
          Reply once, complete it, move on.
        </p>

        {compose && (
          <section
            className="card pad-lg card-shadow"
            style={{ marginBottom: 22 }}
          >
            <div className="section-kicker">
              MESSAGE DJM
            </div>

            <h3
              style={{
                margin: '0 0 7px',
                fontSize: 21,
              }}
            >
              What do you need?
            </h3>

            <p
              className="small muted"
              style={{ marginTop: 0 }}
            >
              Send a short note. DJM can reply with a
              new message or request.
            </p>

            <textarea
              className="textarea"
              value={note}
              onChange={(e) =>
                setNote(e.target.value)
              }
              placeholder="Type your message…"
              autoFocus
            />

            <div
              className="row"
              style={{
                marginTop: 12,
                justifyContent: 'flex-end',
              }}
            >
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => setCompose(false)}
              >
                Cancel
              </button>

              <button
                className="btn btn-navy btn-sm"
                disabled={busy || !note.trim()}
                onClick={send}
              >
                Send
                <Send size={15} />
              </button>
            </div>
          </section>
        )}

        <div className="stack">
          {open.length === 0 ? (
            <div className="card empty">
              <Check
                size={24}
                style={{
                  margin: '0 auto 10px',
                }}
              />

              <strong>Nothing waiting.</strong>

              <span>
                When DJM needs something from you, it
                will show up here.
              </span>
            </div>
          ) : (
            open.map((r) => {
              const isOpen =
                expanded === r.id;

              return (
                <article
                  key={r.id}
                  className={`request-card ${
                    r.due_at ? 'urgent' : ''
                  }`}
                >
                  <div className="request-meta">
                    <span className="pill pill-blue">
                      DJM request
                    </span>

                    {r.due_at && (
                      <span className="small muted row">
                        <Clock3 size={13} />
                        {fmtDate(r.due_at)}
                      </span>
                    )}
                  </div>

                  <h3>{r.title}</h3>

                  {r.message && (
                    <p>{r.message}</p>
                  )}

                  <button
                    className="btn btn-quiet btn-sm"
                    style={{ marginTop: 16 }}
                    onClick={() => {
                      setExpanded(
                        isOpen ? null : r.id
                      );

                      setReply(
                        r.player_reply || ''
                      );
                    }}
                  >
                    {isOpen
                      ? 'Close'
                      : 'Reply / complete'}

                    {isOpen ? (
                      <ChevronUp size={15} />
                    ) : (
                      <ChevronDown size={15} />
                    )}
                  </button>

                  {isOpen && (
                    <div className="reply-box">
                      <label className="label">
                        Reply to DJM{' '}
                        <span
                          className="muted"
                          style={{ fontWeight: 500 }}
                        >
                          (optional)
                        </span>
                      </label>

                      <textarea
                        className="textarea"
                        style={{
                          marginTop: 8,
                          minHeight: 88,
                        }}
                        value={reply}
                        onChange={(e) =>
                          setReply(
                            e.target.value
                          )
                        }
                        placeholder="Add a note…"
                      />

                      <button
                        className="btn btn-navy btn-block"
                        style={{ marginTop: 12 }}
                        disabled={busy}
                        onClick={() =>
                          update(
                            r,
                            'completed'
                          )
                        }
                      >
                        <Check size={16} />
                        Send & mark complete
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {messages.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <div className="section-kicker">
              MESSAGES
            </div>

            <div className="card pad">
              <div className="list-clean">
                {messages
                  .slice(0, 8)
                  .map((r) => (
                    <div
                      className="list-row"
                      key={r.id}
                    >
                      <div className="list-icon">
                        <MessageCircle
                          size={17}
                        />
                      </div>

                      <div className="list-copy">
                        <strong>
                          {r.created_by
                            ? 'DJM'
                            : 'You'}
                        </strong>

                        <span>
                          {r.created_by
                            ? r.message ||
                              r.title
                            : r.player_reply ||
                              r.title}
                        </span>
                      </div>

                      <span className="tiny muted">
                        {fmtDate(
                          r.created_at
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <div className="section-kicker">
              COMPLETED
            </div>

            <div className="card pad">
              <div className="list-clean">
                {done
                  .slice(0, 6)
                  .map((r) => (
                    <div
                      className="list-row"
                      key={r.id}
                    >
                      <div className="list-icon">
                        <Check size={17} />
                      </div>

                      <div className="list-copy">
                        <strong>
                          {r.title}
                        </strong>

                        <span>
                          {fmtDate(
                            r.completed_at ||
                              r.created_at
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

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
