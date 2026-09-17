'use client';

import {
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { friendlyError, platformInvoke } from '@/lib/platform-client';

import styles from './AgencyDomainCard.module.css';

type DomainRecord = {
  id: string;
  hostname: string;
  domain_type: 'platform_subdomain' | 'custom';
  status: 'pending' | 'verifying' | 'verified' | 'disabled';
  is_primary: boolean;
  verified_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, any> | null;
};

export type DomainControl = {
  tenant_id?: string;
  plan_key?: string | null;
  custom_domain_enabled?: boolean;
  custom_domain_optional?: boolean;
  workspace_ready?: boolean;
  platform_hostname?: string | null;
  primary_hostname?: string | null;
  verified_platform_domains?: number;
  verified_custom_domains?: number;
  pending_custom_domains?: number;
  domains?: DomainRecord[];
  truth_contract?: {
    default_address?: string;
    custom_domain?: string;
    primary_switch?: string;
  };
};

type Infrastructure = {
  provider_configured?: boolean;
  redream_domain_configured?: boolean;
  base_domain?: string | null;
};

type Props = {
  tenantId: string;
  initialControl?: DomainControl | null;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const cleanHostname = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');

const statusLabel = (status?: string | null) => {
  if (status === 'verified') return 'Verified';
  if (status === 'verifying') return 'Checking DNS';
  if (status === 'pending') return 'Waiting for DNS';
  if (status === 'disabled') return 'Disabled';
  return 'Unknown';
};

const dnsRecords = (domain?: DomainRecord | null) => {
  const records = domain?.metadata?.provider_state?.dns_records;
  return Array.isArray(records) ? records : [];
};

const isProviderManaged = (domain?: DomainRecord | null) =>
  domain?.metadata?.provider === 'vercel' ||
  domain?.metadata?.created_from === 'platform_ops';

export default function AgencyDomainCard({
  tenantId,
  initialControl,
  onRefresh,
  onNotice,
  onError,
}: Props) {
  const [control, setControl] = useState<DomainControl | null>(
    initialControl || null,
  );
  const [infrastructure, setInfrastructure] =
    useState<Infrastructure | null>(null);
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setControl(initialControl || null);
  }, [initialControl, tenantId]);

  useEffect(() => {
    let active = true;

    setInfrastructure(null);
    setHostname('');
    setBusy('');

    void platformInvoke<any>('platform-ops', {
      action: 'domain_control',
      tenant_id: tenantId,
    })
      .then((result) => {
        if (!active) return;
        setControl(result?.domain_control || null);
        setInfrastructure(result?.infrastructure || null);
      })
      .catch(() => {
        // The parent customer load still provides safe read-only domain state.
      });

    return () => {
      active = false;
    };
  }, [tenantId]);

  const domains = control?.domains || [];
  const platformDomain = useMemo(
    () => domains.find((domain) => domain.domain_type === 'platform_subdomain'),
    [domains],
  );
  const customDomains = useMemo(
    () => domains.filter((domain) => domain.domain_type === 'custom'),
    [domains],
  );

  const refreshControl = async () => {
    const result = await platformInvoke<any>('platform-ops', {
      action: 'domain_control',
      tenant_id: tenantId,
    });
    setControl(result?.domain_control || null);
    setInfrastructure(result?.infrastructure || null);
    return result;
  };

  const run = async (
    key: string,
    body: Record<string, any>,
    success: string | ((result: any) => string),
  ) => {
    if (busy) return;
    setBusy(key);
    onError('');
    try {
      const result = await platformInvoke<any>('platform-ops', body);
      if (result?.domain_control) {
        setControl(result.domain_control);
      }
      await refreshControl();
      await onRefresh();
      onNotice(typeof success === 'function' ? success(result) : success);
    } catch (error) {
      onError(friendlyError(error));
      try {
        await refreshControl();
      } catch {
        // Preserve the original action error.
      }
    } finally {
      setBusy('');
    }
  };

  const assignManagedDomain = async () => {
    await run(
      'assign-platform',
      {
        action: 'assign_platform_domain',
        tenant_id: tenantId,
      },
      (result) => {
        const assigned =
          String(result?.domain?.hostname || '') ||
          String(result?.domain_control?.platform_hostname || '');
        return assigned
          ? `${assigned} is ready as the managed ReDream address.`
          : 'Managed ReDream address assigned.';
      },
    );
  };

  const addCustomDomain = async () => {
    const clean = cleanHostname(hostname);
    if (!clean) return;

    await run(
      'add',
      {
        action: 'add_custom_domain',
        tenant_id: tenantId,
        hostname: clean,
      },
      `${clean} added. Follow the DNS instructions below, then check again.`,
    );
    setHostname('');
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice('Copied to clipboard.');
    } catch {
      onError('Could not copy to clipboard.');
    }
  };

  const managedDescription = platformDomain
    ? 'Automatically managed by ReDream and kept as the permanent fallback.'
    : infrastructure === null
      ? 'Checking managed ReDream address availability.'
      : infrastructure.redream_domain_configured
        ? 'Managed ReDream infrastructure is ready. Assign this agency its permanent fallback address.'
        : 'Managed ReDream addresses are not enabled in this environment yet.';

  return (
    <section id="domain-control" className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p>DOMAIN</p>
          <h3>Workspace address</h3>
        </div>
        <Globe2 size={17} />
      </div>

      <div className={styles.managedBlock}>
        <div className={styles.managedIcon}>
          <ShieldCheck size={18} />
        </div>
        <div className={styles.managedCopy}>
          <span>REDREAM ADDRESS</span>
          <strong>
            {control?.platform_hostname || 'Not assigned yet'}
          </strong>
          <small>{managedDescription}</small>
        </div>
        {platformDomain?.status === 'verified' ? (
          <span className={styles.goodBadge}>
            <Check size={11} />
            Ready
          </span>
        ) : null}
      </div>

      {!platformDomain && infrastructure?.redream_domain_configured ? (
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => void assignManagedDomain()}
            disabled={Boolean(busy)}
          >
            {busy === 'assign-platform' ? (
              <LoaderCircle size={13} className={styles.spin} />
            ) : (
              <ShieldCheck size={13} />
            )}
            Set up ReDream address
          </button>
        </div>
      ) : null}

      {!platformDomain && infrastructure?.redream_domain_configured === false ? (
        <div className={styles.infoBox}>
          <CircleAlert size={15} />
          <span>
            Managed ReDream address infrastructure is not enabled in this
            environment yet. Existing verified workspace addresses are
            unaffected.
          </span>
        </div>
      ) : null}

      {control?.primary_hostname ? (
        <div className={styles.primaryLine}>
          <span>Primary workspace</span>
          <a
            href={`https://${control.primary_hostname}`}
            target="_blank"
            rel="noreferrer"
          >
            {control.primary_hostname}
            <ExternalLink size={12} />
          </a>
        </div>
      ) : null}

      <div className={styles.divider} />

      <div className={styles.customHeading}>
        <div>
          <strong>Custom domain</strong>
          <span>Optional</span>
        </div>
        <p>
          Use an agency-owned address such as app.agency.com. A managed ReDream
          address remains available as the fallback once it has been assigned.
        </p>
      </div>

      {control?.custom_domain_enabled === false ? (
        <div className={styles.infoBox}>
          <CircleAlert size={15} />
          <span>
            Custom domains are not included in this agency&apos;s current plan.
          </span>
        </div>
      ) : (
        <>
          <div className={styles.addRow}>
            <input
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="app.agency.com"
              disabled={busy === 'add'}
            />
            <button
              type="button"
              onClick={() => void addCustomDomain()}
              disabled={
                !hostname.trim() ||
                Boolean(busy) ||
                infrastructure?.provider_configured !== true
              }
            >
              {busy === 'add' ? (
                <LoaderCircle size={14} className={styles.spin} />
              ) : (
                <Globe2 size={14} />
              )}
              Connect
            </button>
          </div>

          {infrastructure?.provider_configured === false ? (
            <div className={styles.infoBox}>
              <CircleAlert size={15} />
              <span>
                Custom-domain automation is not configured on this environment
                yet. Existing workspace addresses are unaffected.
              </span>
            </div>
          ) : null}
        </>
      )}

      <div className={styles.domainList}>
        {customDomains.map((domain) => {
          const records = dnsRecords(domain);
          const verified = domain.status === 'verified';
          const providerManaged = isProviderManaged(domain);

          return (
            <div className={styles.domainItem} key={domain.id}>
              <div className={styles.domainTop}>
                <div>
                  <strong>{domain.hostname}</strong>
                  <span>
                    {statusLabel(domain.status)}
                    {domain.is_primary ? ' · Primary' : ''}
                    {!providerManaged ? ' · Existing workspace domain' : ''}
                  </span>
                </div>

                <span
                  className={
                    verified ? styles.goodBadge : styles.pendingBadge
                  }
                >
                  {verified ? <Check size={11} /> : <RefreshCw size={11} />}
                  {statusLabel(domain.status)}
                </span>
              </div>

              {records.length ? (
                <div className={styles.dnsBox}>
                  <span className={styles.dnsTitle}>
                    DNS records required
                  </span>

                  {records.map((record: any, index: number) => (
                    <div
                      className={styles.dnsRecord}
                      key={`${domain.id}:${record.type}:${index}`}
                    >
                      <span>{String(record.type || '')}</span>
                      <code>{String(record.name || '')}</code>
                      <code>{String(record.value || '')}</code>
                      <button
                        type="button"
                        aria-label="Copy DNS value"
                        onClick={() => void copy(String(record.value || ''))}
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className={styles.actions}>
                {providerManaged && !verified && domain.status !== 'disabled' ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        `refresh:${domain.id}`,
                        {
                          action: 'refresh_custom_domain',
                          tenant_id: tenantId,
                          domain_id: domain.id,
                        },
                        (result) =>
                          result?.verified
                            ? `${domain.hostname} is verified.`
                            : `Checked ${domain.hostname}. DNS is still propagating or needs attention.`,
                      )
                    }
                    disabled={Boolean(busy)}
                  >
                    {busy === `refresh:${domain.id}` ? (
                      <LoaderCircle size={13} className={styles.spin} />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    Check DNS
                  </button>
                ) : null}

                {providerManaged && verified && !domain.is_primary ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        `primary:${domain.id}`,
                        {
                          action: 'set_primary_domain',
                          tenant_id: tenantId,
                          domain_id: domain.id,
                        },
                        `${domain.hostname} is now the primary workspace address.`,
                      )
                    }
                    disabled={Boolean(busy)}
                  >
                    {busy === `primary:${domain.id}` ? (
                      <LoaderCircle size={13} className={styles.spin} />
                    ) : (
                      <Check size={13} />
                    )}
                    Make primary
                  </button>
                ) : null}

                {providerManaged && domain.status !== 'disabled' ? (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Disconnect ${domain.hostname}? The ReDream address remains available when configured.`,
                        )
                      ) {
                        void run(
                          `disable:${domain.id}`,
                          {
                            action: 'disable_custom_domain',
                            tenant_id: tenantId,
                            domain_id: domain.id,
                          },
                          `${domain.hostname} disconnected.`,
                        );
                      }
                    }}
                    disabled={Boolean(busy)}
                  >
                    {busy === `disable:${domain.id}` ? (
                      <LoaderCircle size={13} className={styles.spin} />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {!customDomains.length ? (
          <div className={styles.empty}>
            <Globe2 size={17} />
            <div>
              <strong>No custom domain connected</strong>
              <span>
                This is completely optional. A managed ReDream address is
                enough once it has been assigned.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
