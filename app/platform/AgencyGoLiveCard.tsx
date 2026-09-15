'use client';

import {
  Check,
  CircleAlert,
  ExternalLink,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { platformInvoke, friendlyError } from '@/lib/platform-client';

import styles from './AgencyGoLiveCard.module.css';

export type GoLiveGate = {
  key?: string | null;
  label?: string | null;
  required?: boolean | null;
  complete?: boolean | null;
  responsible_party?: string | null;
  reason?: string | null;
  operator_action?: string | null;
  priority?: number | null;
};

export type GoLiveReadiness = {
  ready?: boolean | null;
  status?: string | null;
  readiness_pct?: number | null;
  required_total?: number | null;
  required_complete?: number | null;
  blocker_count?: number | null;
  next_blocker?: GoLiveGate | null;
  gates?: GoLiveGate[];
  blockers?: GoLiveGate[];
  primary_hostname?: string | null;
  go_live_at?: string | null;
};

export type OperatorIntervention = {
  key?: string | null;
  label?: string | null;
  why?: string | null;
  responsible_party?: string | null;
  impact?: string | null;
  priority?: number | null;
  operator_action?: string | null;
  context?: Record<string, unknown> | null;
};

export type PrivacyReadiness = {
  configured?: boolean | null;
  controller_configured?: boolean | null;
  notice_configured?: boolean | null;
  notice_effective?: boolean | null;
  ready_for_player_invites?: boolean | null;
  next_step?: string | null;
  profile?: {
    controllerName?: string | null;
    contactEmail?: string | null;
    noticeUrl?: string | null;
    noticeVersion?: string | null;
    effectiveAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

const responsibilityLabel = (value?: string | null) => {
  if (value === 'agency_owner') return 'Agency action';
  if (value === 'redream') return 'ReDream action';
  return 'Observed';
};

export default function AgencyGoLiveCard({
  tenantId,
  agencyName,
  internal,
  readiness,
  intervention,
  privacy,
  privacyFocusToken,
  onRefresh,
  onNotice,
  onError,
}: {
  tenantId: string;
  agencyName: string;
  internal: boolean;
  readiness?: GoLiveReadiness | null;
  intervention?: OperatorIntervention | null;
  privacy?: PrivacyReadiness | null;
  privacyFocusToken?: number;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [controllerName, setControllerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [noticeUrl, setNoticeUrl] = useState('');
  const [noticeVersion, setNoticeVersion] = useState('');

  useEffect(() => {
    setControllerName(String(privacy?.profile?.controllerName || agencyName || ''));
    setContactEmail(String(privacy?.profile?.contactEmail || ''));
    setNoticeUrl(String(privacy?.profile?.noticeUrl || ''));
    setNoticeVersion(String(privacy?.profile?.noticeVersion || ''));
  }, [agencyName, privacy]);

  useEffect(() => {
    setPrivacyOpen(false);
  }, [tenantId]);

  useEffect(() => {
    if (privacyFocusToken) setPrivacyOpen(true);
  }, [privacyFocusToken]);

  const pct = Math.max(0, Math.min(100, Number(readiness?.readiness_pct || 0)));
  const gates = useMemo(() => readiness?.gates || [], [readiness?.gates]);
  const next = intervention || null;
  const privacyReady = Boolean(privacy?.ready_for_player_invites);

  const savePrivacy = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || internal) return;

    const controller = controllerName.trim();
    const url = noticeUrl.trim();
    const version = noticeVersion.trim();

    if (!controller || !url || !version) {
      onError('Controller name, privacy notice URL and notice version are required.');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      onError('Privacy notice URL must start with http:// or https://.');
      return;
    }

    setBusy(true);
    onError('');

    try {
      await platformInvoke('platform-ops', {
        action: 'update_privacy_profile',
        tenant_id: tenantId,
        controller_name: controller,
        privacy_contact_email: contactEmail.trim().toLowerCase() || null,
        privacy_notice_url: url,
        notice_version: version,
      });
      onNotice(`${agencyName} privacy readiness updated.`);
      setPrivacyOpen(false);
      await onRefresh();
    } catch (error) {
      const message = friendlyError(error);
      onError(
        message.includes('privacy_notice_version_conflict')
          ? 'This notice version is already locked to different privacy details. Use a new notice version for legal changes.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="go-live-control" className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p>GO-LIVE CONTROL</p>
          <h3>{readiness?.ready ? 'Ready to launch' : 'Launch readiness'}</h3>
        </div>
        <div className={`${styles.status} ${readiness?.ready ? styles.ready : styles.blocked}`}>
          {readiness?.ready ? <ShieldCheck size={15} /> : <CircleAlert size={15} />}
          <strong>{pct}%</strong>
        </div>
      </div>

      <div className={styles.progress}>
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.progressMeta}>
        <span>{readiness?.required_complete || 0}/{readiness?.required_total || 0} launch gates complete</span>
        {readiness?.primary_hostname ? (
          <span className={styles.hostname}>
            <Globe2 size={12} />
            {readiness.primary_hostname}
          </span>
        ) : null}
      </div>

      {next && Number(next.priority || 999) < 100 ? (
        <div className={styles.intervention}>
          <div className={styles.interventionTop}>
            <span>{responsibilityLabel(next.responsible_party)}</span>
            <small>{String(next.impact || 'launch').replaceAll('_', ' ')}</small>
          </div>
          <strong>{next.label || 'Next intervention'}</strong>
          <p>{next.why || 'A customer milestone needs attention.'}</p>
          <div className={styles.operatorMove}>
            <ArrowMark />
            <span>{next.operator_action || 'Remove the next blocker.'}</span>
          </div>
        </div>
      ) : null}

      <div className={styles.gates}>
        {gates.map((gate) => (
          <div className={styles.gate} key={String(gate.key)}>
            <span className={`${styles.gateMark} ${gate.complete ? styles.gateComplete : ''}`}>
              {gate.complete ? <Check size={12} /> : null}
            </span>
            <div>
              <strong>{gate.label || gate.key}</strong>
              <small>{gate.complete ? gate.reason : gate.operator_action || gate.reason}</small>
            </div>
            <em>
              {!gate.required ? 'Not required' : gate.complete ? 'Ready' : responsibilityLabel(gate.responsible_party)}
            </em>
          </div>
        ))}
      </div>

      {!internal ? (
        <div id="privacy-control" className={styles.privacyControl}>
          <div>
            <span className={styles.privacyIcon}>
              <LockKeyhole size={14} />
            </span>
            <div>
              <strong>{privacyReady ? 'Privacy ready' : 'Privacy blocks player activation'}</strong>
              <small>
                {privacyReady
                  ? `${privacy?.profile?.controllerName || agencyName} · ${privacy?.profile?.noticeVersion || 'Current notice'}`
                  : 'The agency must supply its controller identity and current player-facing notice.'}
              </small>
            </div>
          </div>

          <button type="button" onClick={() => setPrivacyOpen((current) => !current)}>
            {privacyOpen ? 'Close' : privacyReady ? 'Review' : 'Configure'}
          </button>
        </div>
      ) : null}

      {privacyOpen && !internal ? (
        <form className={styles.privacyForm} onSubmit={savePrivacy}>
          <div className={styles.formGrid}>
            <label>
              <span>Data controller</span>
              <input value={controllerName} onChange={(event) => setControllerName(event.target.value)} placeholder="Agency legal/controller name" required />
            </label>
            <label>
              <span>Privacy contact</span>
              <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="privacy@agency.com" />
            </label>
            <label className={styles.fullField}>
              <span>Published privacy notice</span>
              <input value={noticeUrl} onChange={(event) => setNoticeUrl(event.target.value)} placeholder="https://agency.com/privacy" required />
            </label>
            <label>
              <span>Notice version</span>
              <input value={noticeVersion} onChange={(event) => setNoticeVersion(event.target.value)} placeholder="v1 or 2026-09" required />
            </label>
          </div>

          <div className={styles.legalBoundary}>
            <ShieldCheck size={14} />
            <span>Use the agency-approved notice. ReDream records the supplied identity and version; it does not generate or approve legal wording.</span>
          </div>

          <div className={styles.formActions}>
            {privacy?.profile?.noticeUrl ? (
              <a href={privacy.profile.noticeUrl} target="_blank" rel="noopener noreferrer">
                Open current notice
                <ExternalLink size={12} />
              </a>
            ) : <span />}
            <button type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={14} className={styles.spin} /> : <Check size={14} />}
              {busy ? 'Saving...' : 'Save privacy profile'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ArrowMark() {
  return <span className={styles.arrowMark}>→</span>;
}
