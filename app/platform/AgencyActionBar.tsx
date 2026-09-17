'use client';

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { platformInvoke, friendlyError } from '@/lib/platform-client';

import styles from './AgencyActionBar.module.css';

export type CustomerActionDescriptor = {
  key?: string | null;
  label?: string | null;
  mode?: 'focus' | 'execute' | null;
  target?: string | null;
  action?: string | null;
  can_execute?: boolean | null;
  requires_confirmation?: boolean | null;
  blocked_reason?: string | null;
};

export type CustomerActionSurface = {
  attention?: {
    requires_action?: boolean | null;
    state?: string | null;
    label?: string | null;
    why_now?: string | null;
    source?: string | null;
  } | null;
  attention_action?: CustomerActionDescriptor | null;
  evidence_action?: CustomerActionDescriptor | null;
  go_live_guard?: {
    allowed?: boolean | null;
    blocked_reason?: string | null;
    launch_ready?: boolean | null;
    first_value_ready?: boolean | null;
    contracted_monthly_cents?: number | null;
    plan_status?: string | null;
    serious_incidents?: number | null;
  } | null;
};

type LaunchDetail = {
  tenant?: Record<string, unknown> | null;
  branding?: Record<string, unknown> | null;
  lifecycle?: Record<string, unknown> | null;
  memberships?: Array<Record<string, unknown>> | null;
  activation_journey?: {
    first_value_ready?: boolean | null;
    next_step?: string | null;
    counts?: {
      roster_players?: number | null;
    } | null;
  } | null;
  go_live_readiness?: {
    ready?: boolean | null;
    primary_hostname?: string | null;
    go_live_at?: string | null;
  } | null;
  domain_control?: {
    workspace_ready?: boolean | null;
    primary_hostname?: string | null;
    platform_hostname?: string | null;
  } | null;
  privacy_readiness?: {
    ready_for_player_invites?: boolean | null;
  } | null;
};

type LaunchStep = {
  key: 'created' | 'owner' | 'workspace' | 'player' | 'value' | 'live';
  label: string;
  short: string;
  complete: boolean;
};

const NEXT_STEP_LABELS: Record<string, string> = {
  owner_activation: 'Activate the agency owner',
  load_roster: 'Load the first player',
  add_club_relationship: 'Add the first club relationship',
  create_live_opportunity: 'Capture the first live opportunity',
  complete_first_action: 'Complete the first meaningful action',
  invite_team: 'Bring in a second staff member',
  use_intelligence: 'Use the first intelligence workflow',
  activation_complete: 'Review launch readiness',
};

const sameAction = (
  left?: CustomerActionDescriptor | null,
  right?: CustomerActionDescriptor | null,
) =>
  Boolean(
    left?.key &&
      right?.key &&
      left.key === right.key &&
      left.target === right.target,
  );

const field = (
  record: Record<string, unknown> | null | undefined,
  key: string,
) => String(record?.[key] || '').trim();

export default function AgencyActionBar({
  tenantId,
  agencyName,
  surface,
  onFocus,
  onRefresh,
  onNotice,
  onError,
}: {
  tenantId: string;
  agencyName: string;
  surface?: CustomerActionSurface | null;
  onFocus: (target: string) => void;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [launchDetail, setLaunchDetail] = useState<LaunchDetail | null>(null);
  const [launchLoading, setLaunchLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLaunchLoading(true);
    setLaunchDetail(null);
    setConfirming(false);

    void platformInvoke<any>('platform-ops', {
      action: 'customer_detail',
      tenant_id: tenantId,
    })
      .then((result) => {
        if (!active) return;
        setLaunchDetail((result?.customer || null) as LaunchDetail | null);
      })
      .catch(() => {
        // The parent surface remains usable if launch detail cannot refresh.
      })
      .finally(() => {
        if (active) setLaunchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tenantId, surface]);

  const primary = useMemo(
    () =>
      surface?.attention?.requires_action
        ? surface?.attention_action || surface?.evidence_action || null
        : surface?.evidence_action || null,
    [surface],
  );

  const secondary =
    surface?.attention?.requires_action &&
    surface?.evidence_action &&
    !sameAction(primary, surface.evidence_action)
      ? surface.evidence_action
      : null;

  const ownerActive = Boolean(
    launchDetail?.memberships?.some(
      (membership) =>
        String(membership.role || '') === 'owner' &&
        String(membership.status || '') === 'active',
    ),
  );

  const brandReady = Boolean(
    field(launchDetail?.branding, 'display_name') &&
      field(launchDetail?.branding, 'portal_name') &&
      field(launchDetail?.branding, 'primary_color'),
  );

  const workspaceHostname = String(
    launchDetail?.domain_control?.primary_hostname ||
      launchDetail?.go_live_readiness?.primary_hostname ||
      launchDetail?.domain_control?.platform_hostname ||
      '',
  ).trim();

  const workspaceReady = Boolean(
    brandReady &&
      launchDetail?.domain_control?.workspace_ready &&
      workspaceHostname,
  );

  const firstPlayerReady =
    Number(launchDetail?.activation_journey?.counts?.roster_players || 0) > 0;

  const firstValueReady = Boolean(
    launchDetail?.activation_journey?.first_value_ready ||
      surface?.go_live_guard?.first_value_ready,
  );

  const live = Boolean(
    field(launchDetail?.lifecycle, 'stage') === 'live' ||
      launchDetail?.go_live_readiness?.go_live_at,
  );

  const privacyReady =
    launchDetail?.privacy_readiness?.ready_for_player_invites !== false;

  const steps: LaunchStep[] = [
    {
      key: 'created',
      label: 'Create agency',
      short: 'Provisioned',
      complete: Boolean(launchDetail?.tenant || !launchLoading),
    },
    {
      key: 'owner',
      label: 'Owner activation',
      short: ownerActive ? 'Owner active' : 'Owner access',
      complete: ownerActive,
    },
    {
      key: 'workspace',
      label: 'Branded workspace',
      short: workspaceReady ? 'Workspace ready' : 'Brand + address',
      complete: workspaceReady,
    },
    {
      key: 'player',
      label: 'First player',
      short: firstPlayerReady ? 'Player onboarded' : 'Onboard player',
      complete: firstPlayerReady,
    },
    {
      key: 'value',
      label: 'First value',
      short: firstValueReady ? 'Value reached' : 'Reach value',
      complete: firstValueReady,
    },
    {
      key: 'live',
      label: 'Go live',
      short: live ? 'Agency live' : 'Launch',
      complete: live,
    },
  ];

  const completeCount = steps.filter((step) => step.complete).length;
  const nextStep =
    steps.find((step) => !step.complete) || steps[steps.length - 1];

  const nextActivationLabel =
    NEXT_STEP_LABELS[
      String(launchDetail?.activation_journey?.next_step || '')
    ] || 'Continue the first-value journey';

  const run = async (action: CustomerActionDescriptor) => {
    if (busy) return;

    if (action.mode === 'focus') {
      if (action.target) onFocus(action.target);
      return;
    }

    if (action.mode !== 'execute' || !action.action) return;

    if (action.requires_confirmation && !confirming) {
      setConfirming(true);
      return;
    }

    setBusy(true);
    onError('');

    try {
      if (action.action === 'go_live_customer') {
        await platformInvoke('platform-ops', {
          action: 'go_live_customer',
          tenant_id: tenantId,
        });
        onNotice(`${agencyName} is now live.`);
      } else {
        throw new Error('This operator action is not supported yet.');
      }

      setConfirming(false);
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const openWorkspace = () => {
    if (!workspaceHostname) return;
    const url = /^https?:\/\//i.test(workspaceHostname)
      ? workspaceHostname
      : `https://${workspaceHostname}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const launchAction = () => {
    if (live) {
      openWorkspace();
      return;
    }

    if (nextStep.key === 'owner') {
      onFocus('activation-control');
      return;
    }

    if (nextStep.key === 'workspace') {
      onFocus('domain-control');
      return;
    }

    if (nextStep.key === 'player') {
      if (!privacyReady) {
        onFocus('privacy-control');
        return;
      }
      if (workspaceHostname) {
        openWorkspace();
        return;
      }
      onFocus('domain-control');
      return;
    }

    if (nextStep.key === 'value') {
      onFocus('activation-control');
      return;
    }

    const goLiveAction =
      [surface?.attention_action, surface?.evidence_action].find(
        (action) => action?.action === 'go_live_customer',
      ) || null;

    if (goLiveAction && surface?.go_live_guard?.allowed) {
      void run(goLiveAction);
      return;
    }

    onFocus('go-live-control');
  };

  const nextCopy = (() => {
    if (live) {
      return {
        kicker: 'LAUNCH COMPLETE',
        title: `${agencyName} is live`,
        text: 'The workspace is active. Open it to review the customer experience or continue normal customer success work.',
        button: workspaceHostname ? 'Open workspace' : 'View launch record',
      };
    }

    if (nextStep.key === 'owner') {
      return {
        kicker: 'NEXT MILESTONE',
        title: 'Activate the agency owner',
        text: 'Share the secure owner invitation. The journey advances automatically when the owner membership becomes active.',
        button: 'Open owner activation',
      };
    }

    if (nextStep.key === 'workspace') {
      return {
        kicker: 'NEXT MILESTONE',
        title: 'Make the branded workspace reachable',
        text: brandReady
          ? 'The brand is provisioned. Finish the managed workspace address so the agency can enter its own environment.'
          : 'Complete the customer brand and workspace address before asking the agency to onboard players.',
        button: 'Finish workspace',
      };
    }

    if (nextStep.key === 'player') {
      return {
        kicker: 'NEXT MILESTONE',
        title: privacyReady
          ? 'Onboard the first real player'
          : 'Finish player privacy first',
        text: privacyReady
          ? 'Open the agency workspace and add the first real player. ReDream will detect the roster evidence automatically.'
          : 'Player activation is held until the agency-approved privacy identity and notice are configured.',
        button: privacyReady ? 'Open agency workspace' : 'Configure privacy',
      };
    }

    if (nextStep.key === 'value') {
      return {
        kicker: 'NEXT MILESTONE',
        title: nextActivationLabel,
        text: 'Do the next meaningful piece of agency work. First value is recognised from real usage, not from manually ticking a setup box.',
        button: 'View first-value path',
      };
    }

    return {
      kicker: surface?.go_live_guard?.allowed
        ? 'READY TO LAUNCH'
        : 'FINAL MILESTONE',
      title: surface?.go_live_guard?.allowed
        ? `Take ${agencyName} live`
        : 'Clear the final launch gate',
      text: surface?.go_live_guard?.allowed
        ? 'First value and launch readiness are satisfied. The server will re-check every guard before changing the lifecycle.'
        : surface?.go_live_guard?.blocked_reason ||
          'Review launch readiness and clear the remaining required evidence.',
      button: surface?.go_live_guard?.allowed
        ? 'Go live'
        : 'Review launch gates',
    };
  })();

  if (launchLoading && !launchDetail) {
    return (
      <section
        className={`${styles.card} ${styles.loadingCard}`}
        aria-label="Agency launch journey"
      >
        <LoaderCircle size={15} className={styles.spin} />
        <div>
          <strong>Mapping agency launch</strong>
          <span>Reading the live activation and workspace evidence.</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label="Agency launch journey">
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>AGENCY LAUNCH</span>
          <strong>From provisioned to useful to live</strong>
          <p>
            One path, driven by customer evidence. No parallel setup checklist
            to maintain.
          </p>
        </div>

        <div
          className={`${styles.progressBadge} ${
            live ? styles.progressComplete : ''
          }`}
        >
          <strong>{completeCount}/6</strong>
          <span>{live ? 'live' : 'milestones'}</span>
        </div>
      </div>

      <div className={styles.steps}>
        {steps.map((step, index) => {
          const active = !live && step.key === nextStep.key;
          return (
            <div
              key={step.key}
              className={`${styles.step} ${
                step.complete ? styles.stepComplete : ''
              } ${active ? styles.stepActive : ''}`}
            >
              <div className={styles.stepRail}>
                <span className={styles.stepMark}>
                  {step.complete ? (
                    <Check size={11} />
                  ) : active ? (
                    <Circle size={9} />
                  ) : (
                    index + 1
                  )}
                </span>
              </div>
              <strong>{step.label}</strong>
              <small>{step.short}</small>
            </div>
          );
        })}
      </div>

      {!confirming ? (
        <div className={`${styles.nextMove} ${live ? styles.liveMove : ''}`}>
          <div className={styles.nextCopy}>
            <span>{nextCopy.kicker}</span>
            <strong>{nextCopy.title}</strong>
            <p>{nextCopy.text}</p>
          </div>

          <div className={styles.actions}>
            {secondary && !live ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void run(secondary)}
                disabled={busy}
              >
                {secondary.label || 'Open operator action'}
              </button>
            ) : null}

            <button
              type="button"
              className={styles.primary}
              onClick={launchAction}
              disabled={busy || (live && !workspaceHostname)}
            >
              {busy ? (
                <LoaderCircle size={14} className={styles.spin} />
              ) : live || nextStep.key === 'player' ? (
                <ExternalLink size={14} />
              ) : nextStep.key === 'live' &&
                surface?.go_live_guard?.allowed ? (
                <ShieldCheck size={14} />
              ) : (
                <ArrowRight size={14} />
              )}
              {nextCopy.button}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.confirm}>
          <div>
            <CheckCircle2 size={15} />
            <p>
              Move {agencyName} live? The server will re-check launch readiness,
              first value, the commercial contract, active plan and serious
              incidents before changing the lifecycle.
            </p>
          </div>

          <span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                const goLiveAction =
                  [surface?.attention_action, surface?.evidence_action].find(
                    (action) => action?.action === 'go_live_customer',
                  ) || null;
                if (goLiveAction) void run(goLiveAction);
              }}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle size={14} className={styles.spin} />
              ) : (
                <ShieldCheck size={14} />
              )}
              Confirm go live
            </button>
          </span>
        </div>
      )}

      <small className={styles.truth}>
        ReDream advances milestones from live tenant, workspace and usage
        evidence. Operator actions never mark a blocker complete by
        themselves.
      </small>
    </section>
  );
}
