'use client';

import {
  CheckCircle2,
  LockKeyhole,
  Save,
} from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import SettingsWorkspace from '@/components/SettingsWorkspace';
import { useAdmin } from '@/components/AdminShell';
import styles from '@/components/AccountSettings.module.css';
import {
  friendlyError,
  platformInvoke,
} from '@/lib/platform-client';
import { tenantBrandTokens } from '@/lib/tenant-brand-style';

type AgencyForm = {
  display_name: string;
  portal_name: string;
  support_email: string;
  website_url: string;
  phone: string;
  primary_color: string;
  accent_color: string;
};

const EMPTY_FORM: AgencyForm = {
  display_name: '',
  portal_name: '',
  support_email: '',
  website_url: '',
  phone: '',
  primary_color: '#111827',
  accent_color: '#64748B',
};

export default function AgencySettingsPage() {
  const auth = useAdmin();
  const tenantId = String(auth.workspace?.tenant_id || '');
  const role = String(auth.workspace?.role || '');
  const canEdit = role === 'owner';
  const [form, setForm] = useState<AgencyForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const brandPreview = tenantBrandTokens({
    primary: form.primary_color,
    secondary: '#FFFFFF',
    accent: form.accent_color,
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true);
    setError('');

    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'account_overview',
        tenant_id: tenantId,
      });
      const branding = result?.account?.branding || {};
      setForm({
        display_name: String(branding.display_name || ''),
        portal_name: String(branding.portal_name || branding.display_name || ''),
        support_email: String(branding.support_email || ''),
        website_url: String(branding.website_url || ''),
        phone: String(branding.phone || ''),
        primary_color: String(branding.primary_color || '#111827'),
        accent_color: String(branding.accent_color || '#64748B'),
      });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!auth.loading) void load();
  }, [auth.loading, load]);

  const update = (key: keyof AgencyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || !tenantId) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await platformInvoke('agency-os', {
        action: 'account_agency_save',
        tenant_id: tenantId,
        ...form,
      });
      setMessage('Agency settings updated.');
      await auth.refresh();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsWorkspace
      title="Agency settings"
      description="Agency details and branding used across ReDream."
    >
      <div className={styles.stack}>

        {!canEdit ? (
          <div className={styles.notice}>
            <LockKeyhole size={16} />
            Agency identity is owner-controlled. You can review it here, but only
            an owner can change these details.
          </div>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? (
          <div className={styles.success}>
            <CheckCircle2 size={16} />
            {message}
          </div>
        ) : null}

        <form
          className={`${styles.panel} ${!canEdit ? styles.readOnly : ''}`}
          onSubmit={submit}
        >
          <div className={styles.panelHead}>
            <div>
              <h2>Workspace identity</h2>
              <p>Used in your workspace and club presentations.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Agency name</span>
              <input
                value={form.display_name}
                onChange={(event) => update('display_name', event.target.value)}
                disabled={!canEdit || busy}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span>Workspace name</span>
              <input
                value={form.portal_name}
                onChange={(event) => update('portal_name', event.target.value)}
                disabled={!canEdit || busy}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span>Support email</span>
              <input
                type="email"
                value={form.support_email}
                onChange={(event) => update('support_email', event.target.value)}
                disabled={!canEdit || busy}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                disabled={!canEdit || busy}
                maxLength={50}
              />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              <span>Website</span>
              <input
                type="url"
                value={form.website_url}
                onChange={(event) => update('website_url', event.target.value)}
                disabled={!canEdit || busy}
                placeholder="https://"
              />
            </label>
            <label className={styles.field}>
              <span>Primary colour</span>
              <input
                type="color"
                value={form.primary_color}
                onChange={(event) => update('primary_color', event.target.value.toUpperCase())}
                disabled={!canEdit || busy}
              />
            </label>
            <label className={styles.field}>
              <span>Accent colour</span>
              <input
                type="color"
                value={form.accent_color}
                onChange={(event) => update('accent_color', event.target.value.toUpperCase())}
                disabled={!canEdit || busy}
              />
            </label>
          </div>

          <div className={styles.brandGuardrail}>
            <div className={styles.brandGuardrailPreview}>
              <span
                style={{
                  background: brandPreview.primaryRaw,
                  color: brandPreview.onPrimaryRaw,
                }}
              >
                Primary
              </span>
              <span
                style={{
                  background: brandPreview.accentRaw,
                  color: brandPreview.onAccentRaw,
                }}
              >
                Accent highlight
              </span>
              <strong style={{ color: brandPreview.accent }}>Readable accent text</strong>
            </div>
            <p>
              Text and controls use accessible contrast. Logos and highlights keep your original colours.
            </p>
          </div>

          {canEdit ? (
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.primary}
                disabled={saving || busy}
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save agency settings'}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </SettingsWorkspace>
  );
}
