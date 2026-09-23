'use client';

import {
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { platformInvoke, friendlyError } from '@/lib/platform-client';

import styles from './AgencyActivationCard.module.css';

export type ActivationJourney = {
  score?: number | null;
  first_value_ready?: boolean | null;
  next_step?: string | null;
  counts?: {
    owners?: number | null;
    staff?: number | null;
    roster_players?: number | null;
    relationships?: number | null;
    player_opportunities?: number | null;
    active_club_needs?: number | null;
    completed_actions?: number | null;
    ai_events?: number | null;
  } | null;
  milestones?: Array<{
    key?: string | null;
    label?: string | null;
    complete?: boolean | null;
    weight?: number | null;
    completed_at?: string | null;
  }>;
  invite?: {
    sent_at?: string | null;
    opened_at?: string | null;
    accepted_at?: string | null;
  } | null;
};

export type OwnerInvite = {
  id: string;
  email?: string | null;
  status?: string | null;
  expires_at?: string | null;
  first_sent_at?: string | null;
  last_sent_at?: string | null;
  send_count?: number | null;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  open_count?: number | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
};

export type OwnerInviteLink = {
  tenantId: string;
  inviteId: string;
  url: string;
};

const STEP_LABELS: Record<string, string> = {
  owner_activation: 'Activate the agency owner',
  load_roster: 'Load the first player',
  add_club_relationship: 'Add the first club relationship',
  create_live_opportunity: 'Capture the first live opportunity',
  complete_first_action: 'Complete the first meaningful action',
  invite_team: 'Bring in a second staff member',
  use_intelligence: 'Use the first intelligence workflow',
  activation_complete: 'Activation complete',
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function AgencyActivationCard({
  tenantId,
  ownerEmail,
  ownerActive,
  journey,
  invites,
  initialInvite,
  onRefresh,
  onNotice,
  onError,
}: {
  tenantId: string;
  ownerEmail: string;
  ownerActive: boolean;
  journey?: ActivationJourney | null;
  invites: OwnerInvite[];
  initialInvite?: OwnerInviteLink | null;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [liveInvite, setLiveInvite] = useState<OwnerInviteLink | null>(
    initialInvite || null,
  );

  useEffect(() => {
    if (initialInvite?.tenantId === tenantId) {
      setLiveInvite(initialInvite);
    }
  }, [initialInvite, tenantId]);

  useEffect(() => {
    let active = true;

    if (ownerActive) {
      setEmailConfigured(null);
      return () => {
        active = false;
      };
    }

    platformInvoke<any>('platform-ops', {
      action: 'owner_invite_email_status',
    })
      .then((result) => {
        if (active) {
          setEmailConfigured(
            result?.email_delivery?.configured === true,
          );
        }
      })
      .catch(() => {
        if (active) setEmailConfigured(false);
      });

    return () => {
      active = false;
    };
  }, [ownerActive, tenantId]);

  const pendingInvite = useMemo(
    () => invites.find((invite) => invite.status === 'pending') || null,
    [invites],
  );
  const latestInvite = invites[0] || null;
  const score = Math.max(
    0,
    Math.min(100, Number(journey?.score || 0)),
  );
  const nextStep =
    STEP_LABELS[String(journey?.next_step || '')] ||
    String(journey?.next_step || 'Continue activation').replaceAll('_', ' ');

  const sendInviteEmail = async () => {
    if (
      !ownerEmail.trim() ||
      busy ||
      ownerActive ||
      emailConfigured !== true
    ) {
      return;
    }

    setBusy('email');
    onError('');

    try {
      const result = await platformInvoke<any>('platform-ops', {
        action: 'send_owner_invite_email',
        tenant_id: tenantId,
        email: ownerEmail.trim().toLowerCase(),
        expires_hours: 168,
      });

      const inviteId = String(result?.invite?.invite_id || '');
      const invitePath = String(result?.invite?.invite_path || '');

      if (!inviteId || !invitePath) {
        throw new Error(
          'Email was accepted but the secure invitation response was incomplete.',
        );
      }

      setLiveInvite({
        tenantId,
        inviteId,
        url: `${window.location.origin}${invitePath}`,
      });

      onNotice(
        `Owner invitation email sent to ${ownerEmail.trim().toLowerCase()}.`,
      );

      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy('');
    }
  };

  const createInvite = async () => {
    if (!ownerEmail.trim() || busy || ownerActive) return;
    setBusy('create');
    onError('');

    try {
      const result = await platformInvoke<any>('platform-ops', {
        action: 'create_owner_invite',
        tenant_id: tenantId,
        email: ownerEmail.trim().toLowerCase(),
        expires_hours: 168,
      });
      const inviteId = String(result?.invite?.invite_id || '');
      const invitePath = String(result?.invite?.invite_path || '');
      if (!inviteId || !invitePath) {
        throw new Error('Secure invitation could not be created.');
      }

      setLiveInvite({
        tenantId,
        inviteId,
        url: `${window.location.origin}${invitePath}`,
      });
      onNotice('A new secure owner invitation is ready to share.');
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy('');
    }
  };

  const copyInvite = async () => {
    if (!liveInvite?.url || busy) return;
    setBusy('copy');
    onError('');

    try {
      await navigator.clipboard.writeText(liveInvite.url);
      try {
        await platformInvoke('platform-ops', {
          action: 'mark_owner_invite_sent',
          invite_id: liveInvite.inviteId,
          channel: 'link',
        });
      } catch (trackingError) {
        onError(
          `Invitation copied, but delivery tracking did not update: ${friendlyError(
            trackingError,
          )}`,
        );
      }
      onNotice(
        'Secure owner invitation copied. It can now be sent to the agency owner.',
      );
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy('');
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!inviteId || busy) return;
    setBusy('revoke');
    onError('');

    try {
      await platformInvoke('platform-ops', {
        action: 'revoke_owner_invite',
        invite_id: inviteId,
      });
      if (liveInvite?.inviteId === inviteId) setLiveInvite(null);
      onNotice('Owner invitation revoked.');
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy('');
    }
  };

  return (
    <section id="activation-control" className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p>TIME TO VALUE</p>
          <h3>Agency activation</h3>
        </div>
        <div className={styles.score}>
          <strong>{score}%</strong>
          <span>activated</span>
        </div>
      </div>

      <div className={styles.scoreTrack}>
        <i style={{ width: `${score}%` }} />
      </div>

      <div className={styles.nextStep}>
        <span>
          {journey?.first_value_ready ? (
            <Check size={14} />
          ) : (
            <Clock3 size={14} />
          )}
        </span>
        <div>
          <strong>
            {journey?.first_value_ready
              ? 'First value reached'
              : 'Next activation move'}
          </strong>
          <small>
            {journey?.first_value_ready
              ? 'Players, relationships and a live opportunity are present.'
              : nextStep}
          </small>
        </div>
      </div>

      <div className={styles.milestones}>
        {(journey?.milestones || []).map((milestone) => (
          <div
            key={String(milestone.key)}
            className={milestone.complete ? styles.complete : ''}
          >
            <span>
              {milestone.complete ? <Check size={12} /> : null}
            </span>
            <div>
              <strong>{milestone.label || milestone.key}</strong>
              <small>
                {milestone.complete && milestone.completed_at
                  ? `Reached ${formatDate(milestone.completed_at)}`
                  : `${milestone.weight || 0}% of activation`}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.inviteDivider} />

      <div className={styles.inviteHeader}>
        <div>
          <p>OWNER ACCESS</p>
          <h4>
            {ownerActive
              ? 'Owner activated'
              : 'Secure owner invitation'}
          </h4>
        </div>
        {ownerActive ? (
          <ShieldCheck size={18} />
        ) : (
          <ExternalLink size={18} />
        )}
      </div>

      {ownerActive ? (
        <div className={styles.ownerReady}>
          <Check size={15} />
          <span>Owner membership is active for this agency.</span>
        </div>
      ) : (
        <>
          <div className={styles.inviteStatus}>
            <div>
              <span>Status</span>
              <strong>
                {pendingInvite
                  ? pendingInvite.first_opened_at
                    ? 'Opened'
                    : pendingInvite.first_sent_at
                      ? 'Sent'
                      : 'Created'
                  : latestInvite?.status
                    ? latestInvite.status.replaceAll('_', ' ')
                    : 'Not invited'}
              </strong>
            </div>
            <div>
              <span>Opens</span>
              <strong>{pendingInvite?.open_count || 0}</strong>
            </div>
            <div>
              <span>Expires</span>
              <strong>
                {formatDate(pendingInvite?.expires_at) || '-'}
              </strong>
            </div>
          </div>

          <div className={styles.emailDeliveryState}>
            {emailConfigured === true ? (
              <>
                <Mail size={14} />
                <span>
                  ReDream email delivery is ready. Emailing creates a fresh
                  secure link and invalidates any older pending link.
                </span>
              </>
            ) : emailConfigured === false ? (
              <>
                <ExternalLink size={14} />
                <span>
                  Email delivery is not configured yet. Use the secure-link
                  fallback.
                </span>
              </>
            ) : (
              <>
                <LoaderCircle size={14} className={styles.spin} />
                <span>Checking email delivery...</span>
              </>
            )}
          </div>

          <div className={styles.inviteActions}>
            {emailConfigured === true ? (
              <button
                type="button"
                className={styles.emailButton}
                onClick={() => void sendInviteEmail()}
                disabled={Boolean(busy) || !ownerEmail.trim()}
              >
                {busy === 'email' ? (
                  <LoaderCircle size={14} className={styles.spin} />
                ) : (
                  <Mail size={14} />
                )}
                Send by email
              </button>
            ) : null}

            {liveInvite?.tenantId === tenantId ? (
              <button
                type="button"
                onClick={() => void copyInvite()}
                disabled={Boolean(busy)}
              >
                {busy === 'copy' ? (
                  <LoaderCircle
                    size={14}
                    className={styles.spin}
                  />
                ) : (
                  <Clipboard size={14} />
                )}
                Copy secure link
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void createInvite()}
              disabled={Boolean(busy) || !ownerEmail.trim()}
            >
              {busy === 'create' ? (
                <LoaderCircle size={14} className={styles.spin} />
              ) : (
                <RefreshCw size={14} />
              )}
              {pendingInvite
                ? 'Rotate secure link'
                : 'Generate secure link'}
            </button>

            {pendingInvite ? (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void revokeInvite(pendingInvite.id)}
                disabled={Boolean(busy)}
              >
                {busy === 'revoke' ? (
                  <LoaderCircle size={14} className={styles.spin} />
                ) : (
                  <X size={14} />
                )}
                Revoke
              </button>
            ) : null}
          </div>

          {!liveInvite && pendingInvite ? (
            <p className={styles.inviteHint}>
              The existing raw token is intentionally unrecoverable. Generate
              a new secure link to resend access.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
