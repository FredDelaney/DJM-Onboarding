'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MessageCircleMore,
  Pencil,
  Save,
  Trash2,
  UserPlus,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import ResearchLinkRail from '@/components/ResearchLinkRail';
import StaffAssignmentPicker from '@/components/StaffAssignmentPicker';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
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

const TERMINAL_STAGES = new Set(['signed', 'paused', 'declined', 'lost']);

export default function RecruitmentTargetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [channel, setChannel] = useState('whatsapp');
  const [direction, setDirection] = useState('outbound');
  const [summary, setSummary] = useState('');
  const [savingOutreach, setSavingOutreach] = useState(false);

  const [followUp, setFollowUp] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [nextStepOpen, setNextStepOpen] = useState(false);
  const [savingNextAction, setSavingNextAction] = useState(false);

  const [promoting, setPromoting] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const load = async () => {
    setError('');
    try {
      const result: any = await djmRpc('djm_recruitment_target', {
        p_prospect_id: id,
      });

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

        setFollowUp(toLocalDateTimeValue(target.next_action_at));
        setNextStepOpen(
          !target.next_action_at &&
            !TERMINAL_STAGES.has(String(target.recruitment_stage || 'identified')),
        );
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const target = data?.target;

  const age = useMemo(
    () => calculateAge(target?.date_of_birth),
    [target?.date_of_birth],
  );

  const active = target
    ? !TERMINAL_STAGES.has(String(target.recruitment_stage || 'identified'))
    : false;

  const lastContact = target?.last_contact_at || target?.first_contact_at || null;
  const nextAt = target?.next_action_at
    ? new Date(target.next_action_at)
    : null;
  const overdue = Boolean(
    active &&
      nextAt &&
      !Number.isNaN(nextAt.getTime()) &&
      nextAt.getTime() < Date.now(),
  );

  const setStage = async (stage: string) => {
    setError('');
    setNotice('');
    try {
      await djmRpc('djm_recruitment_set_stage', {
        p_prospect_id: id,
        p_stage: stage,
        p_next_action_at: target?.next_action_at || null,
        p_note: null,
      });
      setNotice(`Status updated to ${stageLabel(stage)}.`);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const logInteraction = async (event: FormEvent) => {
    event.preventDefault();
    if (!summary.trim() || savingOutreach) return;

    setSavingOutreach(true);
    setError('');
    setNotice('');

    try {
      await djmRpc('djm_recruitment_log_interaction', {
        p_prospect_id: id,
        p_channel: channel,
        p_summary: summary.trim(),
        p_direction: direction,
        p_occurred_at: new Date().toISOString(),
        p_next_action_at: null,
      });

      setSummary('');
      setNotice('Contact update saved.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSavingOutreach(false);
    }
  };

  const saveNextAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!followUp || savingNextAction) return;

    setSavingNextAction(true);
    setError('');
    setNotice('');

    try {
      await djmRpc('djm_recruitment_set_next_action', {
        p_prospect_id: id,
        p_next_action_at: new Date(followUp).toISOString(),
        p_note: followUpNote.trim() || null,
      });

      setFollowUpNote('');
      setNextStepOpen(false);
      setNotice('Next step and reminder saved.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSavingNextAction(false);
    }
  };

  const quickFollowUp = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(10, 0, 0, 0);
    setFollowUp(toLocalDateTimeValue(date));
    setNextStepOpen(true);
  };

  const promote = async () => {
    const ok = window.confirm(
      'Confirm this player has signed with DJM and create their Signed Player record?',
    );
    if (!ok) return;

    setPromoting(true);
    try {
      const result: any = await djmRpc(
        'djm_recruitment_promote_to_signed_player',
        { p_prospect_id: id },
      );
      router.push(`/admin/players/${result.player_id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPromoting(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || savingProfile) return;

    setSavingProfile(true);
    setError('');
    setNotice('');

    try {
      await djmRpc('djm_recruitment_update_profile', {
        p_prospect_id: id,
        p_transfermarkt_url: profile.transfermarkt_url || null,
        p_market_value:
          profile.market_value === '' ? null : Number(profile.market_value),
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

      setEditingProfile(false);
      setNotice('Player details saved.');
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteTarget = async () => {
    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'recruitment_target',
        p_entity_id: id,
      });

      const ok = window.confirm(
        `Permanently delete ${target?.full_name}? This removes ${
          impact?.interactions || 0
        } recruitment interactions and ${
          impact?.reports || 0
        } reports. This cannot be undone.`,
      );

      if (!ok) return;

      await djmRpc('djm_delete_entity', {
        p_entity_type: 'recruitment_target',
        p_entity_id: id,
        p_confirm: true,
      });

      router.push('/admin');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <DjmOsShell
      eyebrow="Prospect"
      title={target?.full_name || 'Recruitment target'}
    >
      <style jsx global>{`
        .prospect-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .prospect-toolbar-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .prospect-command {
          overflow: hidden;
          margin-bottom: 16px;
          border: 1px solid var(--djm-line);
          border-radius: 20px;
          background: #fff;
          box-shadow: var(--djm-shadow);
        }

        .prospect-command-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid #edf1f4;
        }

        .prospect-command-top p {
          margin: 4px 0 0;
          color: var(--djm-muted);
          font-size: 12px;
        }

        .prospect-chip-row {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .prospect-chip {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 4px 9px;
          border: 1px solid #dbe4e9;
          border-radius: 999px;
          background: #f5f8f9;
          color: #466479;
          font-size: 10px;
          font-weight: 850;
          text-transform: capitalize;
        }

        .prospect-chip.is-contacted {
          border-color: #cce2d5;
          background: #eff8f3;
          color: #2f7653;
        }

        .prospect-chip.is-overdue {
          border-color: #efc7c2;
          background: #fff0ee;
          color: #99433e;
        }

        .prospect-command-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .prospect-command-cell {
          min-width: 0;
          padding: 17px 20px;
          border-right: 1px solid #edf1f4;
        }

        .prospect-command-cell:last-child {
          border-right: 0;
        }

        .prospect-command-label {
          display: block;
          margin-bottom: 7px;
          color: #8797a3;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .prospect-command-value {
          display: block;
          color: var(--djm-navy);
          font-size: 14px;
          font-weight: 850;
          line-height: 1.3;
        }

        .prospect-command-value.is-overdue {
          color: #99433e;
        }

        .prospect-command-meta {
          display: block;
          margin-top: 4px;
          color: var(--djm-muted);
          font-size: 10px;
          line-height: 1.4;
        }

        .prospect-stage-select {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          border: 1px solid var(--djm-line);
          border-radius: 10px;
          outline: none;
          background: #fff;
          color: var(--djm-ink);
          padding: 9px 10px;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          text-transform: capitalize;
        }

        .prospect-inline-action {
          margin-top: 9px;
          appearance: none;
          border: 0;
          background: transparent;
          color: #315f7d;
          padding: 0;
          font: inherit;
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
        }

        .prospect-next-editor {
          padding: 18px 20px 20px;
          border-top: 1px solid #edf1f4;
          background: #fbfcfd;
        }

        .prospect-next-editor form {
          display: grid;
          grid-template-columns: minmax(220px, .9fr) minmax(260px, 1.2fr) auto;
          gap: 10px;
          align-items: end;
        }

        .prospect-next-editor label {
          display: grid;
          gap: 6px;
          color: #607285;
          font-size: 10px;
          font-weight: 800;
        }

        .prospect-next-editor input {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          border: 1px solid var(--djm-line);
          border-radius: 10px;
          outline: none;
          background: #fff;
          color: var(--djm-ink);
          padding: 9px 10px;
          font: inherit;
          font-size: 12px;
        }

        .prospect-quick-dates {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .prospect-quick-date {
          min-height: 34px;
          padding: 0 10px;
          border: 1px solid #dce5ea;
          border-radius: 9px;
          background: #fff;
          color: #4a677a;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .prospect-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .prospect-two-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .prospect-form-note {
          margin: -4px 0 0;
          color: #8a9aa5;
          font-size: 10px;
          line-height: 1.45;
        }

        .prospect-facts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          padding: 8px 18px 16px;
        }

        .prospect-fact {
          min-width: 0;
          padding: 12px 0;
          border-bottom: 1px solid #eef2f4;
        }

        .prospect-fact:nth-last-child(-n + 2) {
          border-bottom: 0;
        }

        .prospect-fact:nth-child(odd) {
          padding-right: 14px;
        }

        .prospect-fact:nth-child(even) {
          padding-left: 14px;
          border-left: 1px solid #eef2f4;
        }

        .prospect-fact span {
          display: block;
          margin-bottom: 4px;
          color: #8b9aa5;
          font-size: 9px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: .06em;
        }

        .prospect-fact strong {
          display: block;
          overflow: hidden;
          color: var(--djm-navy);
          font-size: 12px;
          line-height: 1.4;
          text-overflow: ellipsis;
        }

        .prospect-profile-notes {
          margin: 0 18px 16px;
          padding: 12px 13px;
          border-radius: 11px;
          background: #f6f8f9;
          color: #5d7486;
          font-size: 11px;
          line-height: 1.5;
        }

        .prospect-source-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #315f7d;
          text-decoration: none;
          font-weight: 800;
        }

        .prospect-edit-panel {
          margin-bottom: 16px;
        }

        .prospect-edit-form {
          padding: 0;
          gap: 0;
        }

        .prospect-form-group {
          padding: 18px 22px 20px;
          border-bottom: 1px solid #edf1f4;
        }

        .prospect-form-group:last-of-type {
          border-bottom: 0;
        }

        .prospect-form-group h3 {
          margin: 0 0 4px;
          color: var(--djm-navy);
          font-size: 13px;
        }

        .prospect-form-group > p {
          margin: 0 0 14px;
          color: var(--djm-muted);
          font-size: 10px;
        }

        .prospect-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .prospect-form-grid .is-wide {
          grid-column: 1 / -1;
        }

        .prospect-edit-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding: 16px 22px 20px;
          background: #fbfcfd;
          border-top: 1px solid #edf1f4;
        }

        .prospect-lower-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr);
          gap: 16px;
          margin-top: 16px;
        }

        .prospect-task-due.is-overdue {
          color: #99433e;
          font-weight: 800;
        }

        .prospect-danger {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #e6ecef;
        }

        .prospect-danger button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid #efd0cd;
          border-radius: 10px;
          background: #fff8f7;
          color: #99433e;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .prospect-command-grid,
          .prospect-main-grid,
          .prospect-lower-grid {
            grid-template-columns: 1fr;
          }

          .prospect-command-cell {
            border-right: 0;
            border-bottom: 1px solid #edf1f4;
          }

          .prospect-command-cell:last-child {
            border-bottom: 0;
          }

          .prospect-next-editor form {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .prospect-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .prospect-toolbar-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .prospect-toolbar-actions .djm-os-primary-button,
          .prospect-toolbar-actions .djm-os-secondary-button {
            width: 100%;
            min-height: 44px;
          }

          .prospect-command-top {
            align-items: flex-start;
            flex-direction: column;
          }

          .prospect-two-fields,
          .prospect-facts,
          .prospect-form-grid {
            grid-template-columns: 1fr;
          }

          .prospect-fact,
          .prospect-fact:nth-child(odd),
          .prospect-fact:nth-child(even) {
            padding: 11px 0;
            border-left: 0;
            border-bottom: 1px solid #eef2f4;
          }

          .prospect-fact:last-child {
            border-bottom: 0;
          }

          .prospect-form-grid .is-wide {
            grid-column: auto;
          }

          .prospect-next-editor,
          .prospect-form-group,
          .prospect-edit-actions {
            padding-left: 16px;
            padding-right: 16px;
          }

          .prospect-edit-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .prospect-edit-actions button {
            min-height: 44px;
            width: 100%;
          }

          .prospect-danger button {
            width: 100%;
            justify-content: center;
            min-height: 44px;
          }
        }
      `}</style>

      <div className="prospect-toolbar">
        <button
          type="button"
          className="djm-os-secondary-button"
          onClick={() => router.back()}
        >
          <ArrowLeft size={15} />
          Back
        </button>

        <div className="prospect-toolbar-actions">
          <button
            type="button"
            className="djm-os-secondary-button"
            onClick={() => setEditingProfile((value) => !value)}
          >
            <Pencil size={14} />
            {editingProfile ? 'Close details' : 'Edit details'}
          </button>

          {target?.recruitment_stage === 'signed' &&
          !target?.signed_player_id ? (
            <button
              type="button"
              className="djm-os-primary-button"
              onClick={() => void promote()}
              disabled={promoting}
            >
              <CheckCircle2 size={15} />
              {promoting ? 'Creating…' : 'Create signed player'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="ux-alert ux-alert-error">
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="ux-alert ux-alert-success">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      ) : null}

      {!target ? (
        <div className="djm-os-empty">
          <UserPlus size={25} />
          <p>Loading prospect…</p>
        </div>
      ) : (
        <>
          <section className="prospect-command">
            <div className="prospect-command-top">
              <div>
                <strong style={{ color: 'var(--djm-navy)', fontSize: 15 }}>
                  Recruitment workflow
                </strong>
                <p>Status, contact and next step. Everything important is here.</p>
              </div>

              <div className="prospect-chip-row">
                <span className="prospect-chip">
                  {stageLabel(target.recruitment_stage || 'identified')}
                </span>
                <span
                  className={`prospect-chip ${
                    target.first_contact_at ? 'is-contacted' : ''
                  }`}
                >
                  {target.first_contact_at ? '✓ Contacted' : 'Not contacted'}
                </span>
                {overdue ? (
                  <span className="prospect-chip is-overdue">Overdue</span>
                ) : null}
              </div>
            </div>

            <div className="prospect-command-grid">
              <div className="prospect-command-cell">
                <span className="prospect-command-label">Status</span>
                <select
                  className="prospect-stage-select"
                  value={target.recruitment_stage || 'identified'}
                  onChange={(event) => void setStage(event.target.value)}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabel(stage)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="prospect-command-cell">
                <StaffAssignmentPicker
                  kind="prospect"
                  entityId={id}
                  assignedUserId={target.owner_user_id}
                  onAssigned={(userId) =>
                    setData((current: any) =>
                      current
                        ? {
                            ...current,
                            target: {
                              ...current.target,
                              owner_user_id: userId,
                            },
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div className="prospect-command-cell">
                <span className="prospect-command-label">Last contact</span>
                <strong className="prospect-command-value">
                  {lastContact ? compactDateTime(lastContact) : 'Not contacted yet'}
                </strong>
                <span className="prospect-command-meta">
                  {target.last_reply_at
                    ? `Last reply ${compactDateTime(target.last_reply_at)}`
                    : target.first_contact_at
                      ? 'No reply recorded yet'
                      : 'Log the first contact below'}
                </span>
              </div>

              <div className="prospect-command-cell">
                <span className="prospect-command-label">Next step</span>
                <strong
                  className={`prospect-command-value ${
                    overdue ? 'is-overdue' : ''
                  }`}
                >
                  {target.next_action_at
                    ? compactDateTime(target.next_action_at)
                    : active
                      ? 'Not set'
                      : 'No active follow-up'}
                </strong>

                {active ? (
                  <>
                    <span className="prospect-command-meta">
                      {overdue
                        ? 'This follow-up is overdue.'
                        : target.next_action_at
                          ? 'DJM will keep this in the task flow.'
                          : 'Set this now so the prospect cannot be forgotten.'}
                    </span>
                    <button
                      type="button"
                      className="prospect-inline-action"
                      onClick={() => setNextStepOpen((value) => !value)}
                    >
                      {nextStepOpen
                        ? 'Close'
                        : target.next_action_at
                          ? 'Change next step'
                          : 'Set next step'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {active && nextStepOpen ? (
              <div className="prospect-next-editor">
                <form onSubmit={saveNextAction}>
                  <label>
                    Follow-up date & time
                    <input
                      type="datetime-local"
                      required
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                    />
                  </label>

                  <label>
                    What needs to happen?
                    <input
                      value={followUpNote}
                      onChange={(event) => setFollowUpNote(event.target.value)}
                      placeholder="e.g. Call after his match"
                    />
                  </label>

                  <button
                    type="submit"
                    className="djm-os-primary-button"
                    disabled={!followUp || savingNextAction}
                  >
                    <CalendarClock size={15} />
                    {savingNextAction ? 'Saving…' : 'Save reminder'}
                  </button>
                </form>

                <div className="prospect-quick-dates">
                  <button
                    type="button"
                    className="prospect-quick-date"
                    onClick={() => quickFollowUp(1)}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="prospect-quick-date"
                    onClick={() => quickFollowUp(3)}
                  >
                    In 3 days
                  </button>
                  <button
                    type="button"
                    className="prospect-quick-date"
                    onClick={() => quickFollowUp(7)}
                  >
                    In 1 week
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="prospect-main-grid">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Quick update</h2>
                  <p>Record a message, reply, call or meeting in a few seconds.</p>
                </div>
                <MessageCircleMore size={20} />
              </div>

              <form
                className="djm-os-form prospect-quick-form"
                onSubmit={logInteraction}
              >
                <div className="prospect-two-fields">
                  <label>
                    What happened?
                    <select
                      value={direction}
                      onChange={(event) => setDirection(event.target.value)}
                    >
                      <option value="outbound">DJM contacted player</option>
                      <option value="inbound">Player replied</option>
                      <option value="mutual">Call / conversation</option>
                    </select>
                  </label>

                  <label>
                    Channel
                    <select
                      value={channel}
                      onChange={(event) => setChannel(event.target.value)}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="instagram">Instagram</option>
                      <option value="phone">Phone</option>
                      <option value="meeting">Meeting</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="email">Email</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>

                <label>
                  Short note
                  <textarea
                    rows={3}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="e.g. Replied positively. Wants to speak after his match on Sunday."
                  />
                </label>

                <p className="prospect-form-note">
                  Saving this updates the contact history without changing an
                  existing follow-up reminder.
                </p>

                <button
                  className="djm-os-primary-button"
                  type="submit"
                  disabled={!summary.trim() || savingOutreach}
                >
                  <Save size={15} />
                  {savingOutreach ? 'Saving…' : 'Save update'}
                </button>
              </form>
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Player details</h2>
                  <p>The useful information at a glance.</p>
                </div>
                <button
                  type="button"
                  className="djm-os-secondary-button"
                  onClick={() => setEditingProfile(true)}
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </div>

              <div className="prospect-facts">
                <Fact label="Club" value={target.current_club || 'Not added'} />
                <Fact
                  label="Position"
                  value={target.primary_position || 'Not added'}
                />
                <Fact
                  label="Age"
                  value={
                    age != null
                      ? `${age}${target.date_of_birth ? ` · ${shortDate(target.date_of_birth)}` : ''}`
                      : 'Not added'
                  }
                />
                <Fact
                  label="Nationality"
                  value={target.nationality || 'Not added'}
                />
                <Fact
                  label="Contract"
                  value={
                    target.contract_expiry
                      ? `Until ${shortDate(target.contract_expiry)}`
                      : 'Not added'
                  }
                />
                <Fact
                  label="Market value"
                  value={
                    target.market_value != null
                      ? `${target.market_value_currency || 'EUR'} ${Number(
                          target.market_value,
                        ).toLocaleString('en-GB')}`
                      : 'Not added'
                  }
                />
                <Fact
                  label="Agent"
                  value={
                    target.agent_name ||
                    target.agent_status ||
                    'Not added'
                  }
                />
                <Fact
                  label="Contact"
                  value={
                    target.whatsapp ||
                    target.email ||
                    target.instagram_url ||
                    'Not added'
                  }
                />
              </div>

              {target.notes || target.recruitment_notes ? (
                <div className="prospect-profile-notes">
                  {target.notes || target.recruitment_notes}
                </div>
              ) : null}

              {target.transfermarkt_url ? (
                <div style={{ padding: '0 18px 18px' }}>
                  <a
                    className="prospect-source-link"
                    href={target.transfermarkt_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Transfermarkt
                    <ExternalLink size={13} />
                  </a>
                </div>
              ) : null}
            </section>
          </div>

          {editingProfile && profile ? (
            <section className="djm-os-panel prospect-edit-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Edit player details</h2>
                  <p>Only fill what is useful. Blank fields are completely fine.</p>
                </div>
                <button
                  type="button"
                  className="djm-os-secondary-button"
                  onClick={() => setEditingProfile(false)}
                >
                  Close
                </button>
              </div>

              <form
                className="djm-os-form prospect-edit-form"
                onSubmit={saveProfile}
              >
                <div className="prospect-form-group">
                  <h3>Player</h3>
                  <p>Core football information.</p>
                  <div className="prospect-form-grid">
                    <label>
                      Date of birth
                      <input
                        type="date"
                        value={profile.date_of_birth}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            date_of_birth: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Nationality
                      <input
                        value={profile.nationality}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            nationality: event.target.value,
                          })
                        }
                        placeholder="e.g. New Zealand"
                      />
                    </label>

                    <label>
                      Position
                      <input
                        value={profile.primary_position}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            primary_position: event.target.value,
                          })
                        }
                        placeholder="e.g. Centre Midfielder"
                      />
                    </label>

                    <label>
                      Preferred foot
                      <select
                        value={profile.preferred_foot}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            preferred_foot: event.target.value,
                          })
                        }
                      >
                        <option value="">Unknown</option>
                        <option>Left</option>
                        <option>Right</option>
                        <option>Both</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="prospect-form-group">
                  <h3>Club & contract</h3>
                  <p>Current football situation.</p>
                  <div className="prospect-form-grid">
                    <label>
                      Current club
                      <input
                        value={profile.current_club}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            current_club: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Country
                      <input
                        value={profile.current_country}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            current_country: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Contract expiry
                      <input
                        type="date"
                        value={profile.contract_expiry}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            contract_expiry: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Market value
                      <input
                        type="number"
                        min="0"
                        value={profile.market_value}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            market_value: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Currency
                      <select
                        value={profile.market_value_currency}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            market_value_currency: event.target.value,
                          })
                        }
                      >
                        <option>EUR</option>
                        <option>GBP</option>
                        <option>USD</option>
                        <option>AUD</option>
                        <option>NZD</option>
                        <option>SEK</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="prospect-form-group">
                  <h3>Representation & contact</h3>
                  <p>How to reach them and who currently represents them.</p>
                  <div className="prospect-form-grid">
                    <label>
                      Agent status
                      <input
                        value={profile.agent_status}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            agent_status: event.target.value,
                          })
                        }
                        placeholder="e.g. No agent / represented"
                      />
                    </label>

                    <label>
                      Agent name
                      <input
                        value={profile.agent_name}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            agent_name: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      WhatsApp
                      <input
                        value={profile.whatsapp}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            whatsapp: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Email
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            email: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="is-wide">
                      Instagram
                      <input
                        value={profile.instagram_url}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            instagram_url: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="prospect-form-group">
                  <h3>Source</h3>
                  <p>Keep the research link without making the page about the source.</p>
                  <div className="prospect-form-grid">
                    <label className="is-wide">
                      Transfermarkt URL
                      <input
                        value={profile.transfermarkt_url}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            transfermarkt_url: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="prospect-edit-actions">
                  <button
                    className="djm-os-primary-button"
                    type="submit"
                    disabled={savingProfile}
                  >
                    <Save size={15} />
                    {savingProfile ? 'Saving…' : 'Save details'}
                  </button>

                  <button
                    className="djm-os-secondary-button"
                    type="button"
                    onClick={() => setEditingProfile(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          ) : null}

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
            title="Research & contact shortcuts"
          />

          <div className="prospect-lower-grid">
            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Contact history</h2>
                  <p>A clean record of what has actually happened.</p>
                </div>
              </div>

              {(data.interactions || []).length ? (
                <div className="djm-os-list">
                  {data.interactions.map((item: any) => (
                    <article className="djm-os-feed-row" key={item.id}>
                      <span className="djm-os-feed-dot" />
                      <div>
                        <strong>
                          {stageLabel(item.channel)} ·{' '}
                          {interactionDirection(item.direction)}
                        </strong>
                        <p>{item.summary}</p>
                        <small>
                          {item.owner_name || 'DJM'} ·{' '}
                          {compactDateTime(item.occurred_at)}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="djm-os-empty">
                  <MessageCircleMore size={25} />
                  <p>No contact recorded yet.</p>
                </div>
              )}
            </section>

            <section className="djm-os-panel">
              <div className="djm-os-panel-head">
                <div>
                  <h2>Next actions</h2>
                  <p>What DJM needs to do from here.</p>
                </div>
              </div>

              {(data.tasks || []).length ? (
                <div className="djm-os-list">
                  {data.tasks.map((task: any) => {
                    const due = task.due_at ? new Date(task.due_at) : null;
                    const taskOverdue = Boolean(
                      due &&
                        !Number.isNaN(due.getTime()) &&
                        due.getTime() < Date.now() &&
                        !['completed', 'cancelled'].includes(task.status),
                    );

                    return (
                      <article className="djm-os-list-row" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <p>{stageLabel(task.status || 'open')}</p>
                          <small
                            className={`prospect-task-due ${
                              taskOverdue ? 'is-overdue' : ''
                            }`}
                          >
                            {task.due_at
                              ? `${taskOverdue ? 'Overdue · ' : ''}${compactDateTime(
                                  task.due_at,
                                )}`
                              : 'No deadline'}
                          </small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="djm-os-empty">
                  <CalendarClock size={25} />
                  <p>No open recruitment actions.</p>
                </div>
              )}
            </section>
          </div>

          <div className="prospect-danger">
            <button type="button" onClick={() => void deleteTarget()}>
              <Trash2 size={14} />
              Delete prospect
            </button>
          </div>
        </>
      )}
    </DjmOsShell>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="prospect-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function stageLabel(value?: string | null) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function interactionDirection(value?: string | null) {
  if (value === 'outbound') return 'DJM contacted player';
  if (value === 'inbound') return 'Player replied';
  if (value === 'mutual') return 'Conversation';
  return 'Interaction';
}

function calculateAge(value?: string | null) {
  if (!value) return null;

  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let result = today.getFullYear() - birth.getFullYear();

  const birthdayThisYear = new Date(
    today.getFullYear(),
    birth.getMonth(),
    birth.getDate(),
    12,
  );

  if (today < birthdayThisYear) result -= 1;
  return result;
}

function shortDate(value?: string | null) {
  if (!value) return '';

  const date = new Date(
    value.length <= 10 ? `${value}T12:00:00` : value,
  );

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function toLocalDateTimeValue(value?: string | Date | null) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
