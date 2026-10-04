'use client';

import {
  Camera,
  CheckCircle2,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import AgencyBirthdayEditor from '@/components/AgencyBirthdayEditor';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import { useAdmin } from '@/components/AdminShell';
import styles from '@/components/AccountSettings.module.css';
import {
  friendlyError,
  platformInvoke,
  platformRpc,
} from '@/lib/platform-client';
import { publicFile, supabase } from '@/lib/supabase';

type ProfileForm = {
  display_name: string;
  job_title: string;
  phone: string;
  locale: string;
  timezone: string;
  avatar_path: string;
};

const EMPTY_FORM: ProfileForm = {
  display_name: '',
  job_title: '',
  phone: '',
  locale: 'en-GB',
  timezone: 'Europe/Rome',
  avatar_path: '',
};

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R';

export default function ProfileSettingsPage() {
  const auth = useAdmin();
  const tenantId = String(auth.workspace?.tenant_id || '');
  const userId = String(auth.user?.id || '');
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true);
    setError('');

    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'account_overview',
        tenant_id: tenantId,
      });
      const profile = result?.account?.profile || {};
      setForm({
        display_name: String(profile.display_name || ''),
        job_title: String(profile.job_title || ''),
        phone: String(profile.phone || ''),
        locale: String(profile.locale || 'en-GB'),
        timezone: String(profile.timezone || 'Europe/Rome'),
        avatar_path: String(profile.avatar_path || ''),
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

  const avatarUrl = useMemo(
    () => publicFile('player-public', form.avatar_path),
    [form.avatar_path],
  );

  const update = (key: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  };

  const saveProfile = async (
    nextAvatarPath = form.avatar_path,
  ) => {
    if (!tenantId || !userId) return false;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'account_profile_save',
        tenant_id: tenantId,
        display_name: form.display_name,
        job_title: form.job_title,
        phone: form.phone,
        locale: form.locale,
        timezone: form.timezone,
        avatar_path: nextAvatarPath || null,
      });
      const saved = result?.profile || {};
      setForm((current) => ({
        ...current,
        avatar_path: String(saved.avatar_path || ''),
      }));
      setMessage('Profile updated.');
      window.dispatchEvent(new Event('redream:profile-updated'));
      await auth.refresh();
      return true;
    } catch (saveError) {
      setError(friendlyError(saveError));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await saveProfile();
  };

  const uploadAvatar = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userId) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPG, PNG or WebP profile image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile images must be 5 MB or smaller.');
      return;
    }

    const extension =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg';
    const nextPath = `${userId}/account/avatar-${Date.now()}.${extension}`;
    const previousPath = form.avatar_path;

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const { error: uploadError } = await supabase.storage
        .from('player-public')
        .upload(nextPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const saved = await saveProfile(nextPath);
      if (!saved) {
        await supabase.storage.from('player-public').remove([nextPath]);
        return;
      }

      if (previousPath && previousPath !== nextPath) {
        await supabase.storage.from('player-public').remove([previousPath]);
      }
      setForm((current) => ({ ...current, avatar_path: nextPath }));
      setMessage('Profile photo updated.');
    } catch (uploadError) {
      setError(friendlyError(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    const previousPath = form.avatar_path;
    if (!previousPath) return;

    const saved = await saveProfile('');
    if (!saved) return;

    await supabase.storage.from('player-public').remove([previousPath]);
    setForm((current) => ({ ...current, avatar_path: '' }));
    setMessage('Profile photo removed.');
  };

  return (
    <SettingsWorkspace
      title="My profile"
      description="Your photo, name and preferences."
    >
      <div className={styles.stack}>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? (
          <div className={styles.success}>
            <CheckCircle2 size={16} />
            {message}
          </div>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Profile photo</h2>
              <p>Used across ownership, team handoffs and your account menu.</p>
            </div>
            <Camera size={19} />
          </div>

          <div className={styles.avatarEditor}>
            <div className={styles.avatarLarge}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile" />
              ) : (
                initials(form.display_name)
              )}
            </div>
            <div className={styles.avatarControls}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void uploadAvatar(event)}
                disabled={uploading || busy}
              />
              <p className={styles.muted}>JPG, PNG or WebP. Maximum 5 MB.</p>
              {form.avatar_path ? (
                <button
                  type="button"
                  className={styles.dangerQuiet}
                  onClick={() => void removeAvatar()}
                  disabled={saving || uploading}
                >
                  <Trash2 size={14} />
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <form className={styles.panel} onSubmit={submit}>
          <div className={styles.panelHead}>
            <div>
              <h2>Personal details</h2>
              <p>Your login email is managed separately and cannot be changed here.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Full name</span>
              <input
                value={form.display_name}
                onChange={(event) => update('display_name', event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span>Job title</span>
              <input
                value={form.job_title}
                onChange={(event) => update('job_title', event.target.value)}
                placeholder="Agent, Scout, Operations..."
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span>Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                maxLength={50}
              />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input value={String(auth.user?.email || '')} disabled />
            </label>
            <label className={styles.field}>
              <span>Language</span>
              <select
                value={form.locale}
                onChange={(event) => update('locale', event.target.value)}
              >
                <option value="en-GB">English (UK)</option>
                <option value="en-US">English (US)</option>
                <option value="it-IT">Italiano</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Timezone</span>
              <input
                value={form.timezone}
                onChange={(event) => update('timezone', event.target.value)}
                placeholder="Europe/Rome"
                maxLength={80}
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="submit"
              disabled={saving || busy}
            >
              {saving ? <LoaderCircle size={15} /> : null}
              Save profile
            </button>
          </div>
        </form>
        {tenantId && userId && ['owner','admin','agent','scout','operations'].includes(String(auth.workspace?.role || auth.profile?.tenant_role || '')) ? <AgencyBirthdayEditor entityKind="staff" entityId={userId} tenantId={tenantId} rpc={platformRpc} /> : null}
      </div>
    </SettingsWorkspace>
  );
}
