'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { dealCredibility } from '@/lib/intelligence';

const STAGES = [
  'qualifying',
  'contacted',
  'interest',
  'negotiating',
  'offer',
  'contracting',
  'won',
  'lost',
  'paused',
];

export default function DealRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const result: any = await djmRpc('djm_deal_room', {
        p_deal_room_id: id,
      });
      setData(result);
      const d = result?.deal;
      if (d) {
        setForm({
          title: d.title || '',
          stage: d.stage || 'qualifying',
          expected_commission: d.expected_commission ?? '',
          currency: d.currency || 'EUR',
          legacy_probability: d.probability ?? 25,
          primary_blocker: d.primary_blocker || '',
          next_decision: d.next_decision || '',
          next_action_at: d.next_action_at
            ? new Date(d.next_action_at).toISOString().slice(0, 16)
            : '',
        });
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');

    try {
      await djmRpc('djm_deal_room_upsert', {
        p_id: id,
        p_title: form.title,
        p_organisation_id: null,
        p_source_person_id: null,
        p_player_id: null,
        p_prospect_id: null,
        p_club_need_id: null,
        p_stage: form.stage,
        p_expected_commission:
          form.expected_commission === ''
            ? null
            : Number(form.expected_commission),
        p_currency: form.currency,
        // Compatibility only: the current live RPC requires this legacy field.
        // It is not presented as a forecast or used to calculate pipeline value.
        p_probability: Number(form.legacy_probability),
        p_primary_blocker: form.primary_blocker || null,
        p_next_decision: form.next_decision || null,
        p_next_action_at: form.next_action_at
          ? new Date(form.next_action_at).toISOString()
          : null,
        p_source: 'deal_room',
      });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const setStage = async (stage: string) => {
    const reason =
      stage === 'lost'
        ? window.prompt('Why was the deal lost?')
        : stage === 'won'
          ? window.prompt('Any closing note?')
          : null;

    try {
      await djmRpc('djm_deal_room_set_stage', {
        p_deal_room_id: id,
        p_stage: stage,
        p_probability:
          stage === 'won' || stage === 'lost'
            ? null
            : Number(form?.legacy_probability || 25),
        p_outcome_reason: reason || null,
      });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const deleteDeal = async () => {
    try {
      const ok = window.confirm(
        `Permanently delete ${deal?.title || 'this Deal Room'}? Use Lost or Paused if this was a real commercial situation you want DJM to remember.`,
      );
      if (!ok) return;
      await djmRpc('djm_delete_entity', {
        p_entity_type: 'deal_room',
        p_entity_id: id,
        p_confirm: true,
      });
      router.push('/deals');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const deal = data?.deal;
  const credibility = deal ? dealCredibility(deal) : 'Insufficient evidence';

  return (
    <DjmOsShell
      eyebrow="Evidence-led commercial situation"
      title={deal?.title || 'Deal Room'}
    >
      <div className="djm-os-toolbar">
        <Link
          href="/deals"
          className="djm-os-secondary-button"
          style={{ textDecoration: 'none' }}
        >
          <ArrowLeft size={15} />
          Deals
        </Link>

        <div className="djm-os-button-row">
          <button
            className="djm-os-secondary-button"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
          </button>
          <button className="djm-os-secondary-button" type="button" onClick={() => void deleteDeal()}>
            Delete Deal Room
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

      {!deal || !form ? (
        <div className="djm-os-empty">
          <CircleDollarSign size={25} />
          <p>{busy ? 'Loading deal…' : 'Deal Room not found.'}</p>
        </div>
      ) : (
        <>
          <section className="djm-os-metrics">
            <Metric label="Club" value={deal.organisation_name || '—'} />
            <Metric label="Player" value={deal.player_name || '—'} />
            <Metric label="Credibility" value={credibility} />
            <Metric label="Stage" value={String(deal.stage || 'qualifying').replaceAll('_', ' ')} />
            <Metric
              label="Expected commission"
              value={
                deal.expected_commission != null
                  ? `${deal.currency} ${Number(
                      deal.expected_commission,
                    ).toLocaleString('en-GB')}`
                  : '—'
              }
            />
            <Metric label="Next action" value={deal.next_action_at ? compactDateTime(deal.next_action_at) : 'Not scheduled'} />
          </section>

          <div className="djm-os-grid djm-os-grid-2">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>What moves this deal?</h2>
                  <p>
                    Keep this brutally practical. One blocker, one decision, one
                    next action.
                  </p>
                </div>
              </div>

              <form className="djm-os-form" onSubmit={save}>
                <label>
                  Deal title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </label>

                <label>
                  Stage
                  <select
                    value={form.stage}
                    onChange={(e) =>
                      setForm({ ...form, stage: e.target.value })
                    }
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="djm-os-form-grid" style={{ padding: 0 }}>
                  <label>
                    Expected commission
                    <input
                      type="number"
                      min="0"
                      value={form.expected_commission}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          expected_commission: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Currency
                    <select
                      value={form.currency}
                      onChange={(e) =>
                        setForm({ ...form, currency: e.target.value })
                      }
                    >
                      <option>EUR</option>
                      <option>GBP</option>
                      <option>USD</option>
                      <option>AUD</option>
                      <option>NZD</option>
                      <option>SEK</option>
                      <option>NOK</option>
                    </select>
                  </label>
                </div>

                <label>
                  Primary blocker
                  <textarea
                    rows={3}
                    value={form.primary_blocker}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        primary_blocker: e.target.value,
                      })
                    }
                    placeholder="What is the single biggest thing stopping this?"
                  />
                </label>

                <label>
                  Next decision required
                  <textarea
                    rows={3}
                    value={form.next_decision}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        next_decision: e.target.value,
                      })
                    }
                    placeholder="What concrete yes/no/commitment do we need next?"
                  />
                </label>

                <label>
                  Next action
                  <input
                    type="datetime-local"
                    value={form.next_action_at}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        next_action_at: e.target.value,
                      })
                    }
                  />
                </label>

                <button
                  className="djm-os-primary-button"
                  type="submit"
                  disabled={busy}
                >
                  Save Deal Room
                </button>
              </form>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Decision view</h2>
                  <p>
                    The information DJM needs before spending another hour on
                    this.
                  </p>
                </div>
              </div>

              <div className="djm-os-form">
                <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}>
                  <strong>Blocker</strong>
                  <p>{deal.primary_blocker || 'No blocker recorded yet.'}</p>
                </div>

                <div className="djm-os-preview" style={{ background: '#f5f8fa', color: '#31465b' }}>
                  <strong>Next decision</strong>
                  <p>{deal.next_decision || 'No concrete next decision recorded.'}</p>
                </div>

                <div>
                  <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>
                    Owner
                  </strong>
                  <p style={{ fontSize: 12 }}>
                    {deal.owner_name || 'DJM'}
                  </p>
                </div>

                <div>
                  <strong style={{ color: 'var(--djm-navy)', fontSize: 12 }}>
                    Next action
                  </strong>
                  <p style={{ fontSize: 12 }}>
                    {deal.next_action_at
                      ? compactDateTime(deal.next_action_at)
                      : 'Not scheduled'}
                  </p>
                </div>

                <div className="djm-os-button-row">
                  <button
                    type="button"
                    className="djm-os-primary-button"
                    onClick={() => void setStage('won')}
                  >
                    <CheckCircle2 size={15} />
                    Won
                  </button>
                  <button
                    type="button"
                    className="djm-os-secondary-button"
                    onClick={() => void setStage('paused')}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="djm-os-secondary-button"
                    onClick={() => void setStage('lost')}
                  >
                    Lost
                  </button>
                </div>
              </div>
            </section>
          </div>

          <section className="djm-os-panel">
            <div className="djm-os-panel-head">
              <div>
                <h2>Open actions</h2>
                <p>
                  Tasks connected to the underlying Club Need.
                </p>
              </div>
            </div>
            {(data.tasks || []).length ? (
              <div className="djm-os-list">
                {data.tasks.map((task: any) => (
                  <article className="djm-os-list-row" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <p>{task.status}</p>
                      <small>
                        {task.due_at
                          ? compactDateTime(task.due_at)
                          : 'No deadline'}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="djm-os-empty">
                <CircleDollarSign size={25} />
                <p>No linked actions yet.</p>
              </div>
            )}
          </section>
        </>
      )}
    </DjmOsShell>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="djm-os-metric">
      <strong
        style={{
          fontSize:
            typeof value === 'string' && value.length > 18 ? 16 : undefined,
        }}
      >
        {value}
      </strong>
      <span>{label}</span>
    </div>
  );
}
