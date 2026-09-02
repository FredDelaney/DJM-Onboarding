'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  Clipboard,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  SunMedium,
} from 'lucide-react';

import { getDjmAuthCapabilities } from '@/lib/auth-capabilities';
import { disableWebPush, enableWebPush, getPushReadiness, type PushReadiness } from '@/lib/push';
import { supabase } from '@/lib/supabase';

import styles from './ConnectionsPanel.module.css';

type ReminderIntensity = 'minimal' | 'normal' | 'everything';

const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

type PreferenceState = {
  task_reminders: boolean;
  email_reminders: boolean;
  morning_brief: boolean;
  reminder_intensity: ReminderIntensity;
  timezone: string;
  email_address: string;
};

const defaultPreferences = (email: string): PreferenceState => ({
  task_reminders: true,
  email_reminders: false,
  morning_brief: false,
  reminder_intensity: 'normal',
  timezone: deviceTimezone(),
  email_address: email,
});

function projectUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function feedUrl(token: string) {
  return `${projectUrl()}/functions/v1/djm-calendar-feed?token=${encodeURIComponent(token)}`;
}

function appleFeedUrl(token: string) {
  return feedUrl(token).replace(/^https:/, 'webcal:');
}

export default function ConnectionsPanel({
  userId,
  email,
  mode,
}: {
  userId: string;
  email: string;
  mode: 'staff' | 'player';
}) {
  const [preferences, setPreferences] = useState<PreferenceState>(() => defaultPreferences(email));
  const [calendarToken, setCalendarToken] = useState('');
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [emailDelivery, setEmailDelivery] = useState<{ enabled: boolean; provider?: string | null }>({ enabled: false });
  const [pushState, setPushState] = useState<PushReadiness>('unsupported');
  const [passkeysEnabled, setPasskeysEnabled] = useState(false);
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; friendly_name?: string | null; created_at?: string | null; last_used_at?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [preferenceResult, calendarResult, emailResult, authCapabilities, readiness] = await Promise.all([
        supabase
          .from('notification_preferences')
          .select('task_reminders,email_reminders,morning_brief,reminder_intensity,timezone,email_address')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase.rpc('djm_get_calendar_subscription'),
        supabase.rpc('djm_email_delivery_status'),
        getDjmAuthCapabilities(),
        getPushReadiness(),
      ]);

      if (preferenceResult.error) throw preferenceResult.error;
      if (calendarResult.error) throw calendarResult.error;
      if (emailResult.error) throw emailResult.error;

      const saved = preferenceResult.data;
      if (saved) {
        setPreferences({
          task_reminders: saved.task_reminders !== false,
          email_reminders: Boolean(saved.email_reminders),
          morning_brief: Boolean(saved.morning_brief),
          reminder_intensity: (saved.reminder_intensity || 'normal') as ReminderIntensity,
          timezone: saved.timezone || deviceTimezone(),
          email_address: saved.email_address || email,
        });
      } else {
        setPreferences(defaultPreferences(email));
      }

      const calendar = calendarResult.data as { token?: string; enabled?: boolean } | null;
      setCalendarToken(calendar?.token || '');
      setCalendarEnabled(calendar?.enabled !== false);
      setEmailDelivery((emailResult.data || { enabled: false }) as { enabled: boolean; provider?: string | null });
      setPushState(readiness);
      setPasskeysEnabled(authCapabilities.passkeysEnabled);
      setPasskeysSupported(authCapabilities.passkeysSupported);

      if (authCapabilities.passkeysEnabled && authCapabilities.passkeysSupported) {
        const result = await supabase.auth.passkey.list();
        if (!result.error) setPasskeys(result.data || []);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Connections could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [email, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const privateFeed = useMemo(() => (calendarToken ? feedUrl(calendarToken) : ''), [calendarToken]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2600);
  };

  const copyCalendar = async () => {
    if (!privateFeed) return;
    await navigator.clipboard.writeText(privateFeed);
    flash('Private calendar link copied.');
  };

  const openApple = () => {
    if (!calendarToken) return;
    window.location.href = appleFeedUrl(calendarToken);
  };

  const openGoogle = async () => {
    if (!privateFeed) return;
    await navigator.clipboard.writeText(privateFeed);
    window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank', 'noopener,noreferrer');
    flash('Calendar link copied. Paste it into Google Calendar From URL.');
  };

  const rotateCalendar = async () => {
    if (busy) return;
    setBusy('calendar');
    setError('');
    try {
      const { data, error: rotateError } = await supabase.rpc('djm_rotate_calendar_subscription');
      if (rotateError) throw rotateError;
      const calendar = data as { token?: string; enabled?: boolean } | null;
      setCalendarToken(calendar?.token || '');
      setCalendarEnabled(calendar?.enabled !== false);
      flash('Private calendar link reset. Old links no longer work.');
    } catch (rotateError: any) {
      setError(rotateError?.message || 'Calendar link could not be reset.');
    } finally {
      setBusy('');
    }
  };

  const savePreferences = async () => {
    if (busy) return;
    setBusy('preferences');
    setError('');
    try {
      const { error: preferenceError } = await supabase.from('notification_preferences').upsert({
        user_id: userId,
        ...preferences,
        email_reminders: emailDelivery.enabled ? preferences.email_reminders : false,
        updated_at: new Date().toISOString(),
      });
      if (preferenceError) throw preferenceError;
      flash('Reminder settings saved.');
    } catch (preferenceError: any) {
      setError(preferenceError?.message || 'Reminder settings could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const useDeviceTimezone = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) setPreferences((current) => ({ ...current, timezone }));
  };

  const enablePush = async () => {
    if (busy) return;
    setBusy('push');
    setError('');
    try {
      await enableWebPush(userId);
      setPushState('enabled');
      flash('Notifications enabled on this device.');
    } catch (pushError: any) {
      setError(pushError?.message || 'Notifications could not be enabled.');
      setPushState(await getPushReadiness());
    } finally {
      setBusy('');
    }
  };

  const disablePush = async () => {
    if (busy) return;
    setBusy('push');
    setError('');
    try {
      await disableWebPush();
      setPushState('ready');
      flash('Notifications disabled on this device.');
    } catch (pushError: any) {
      setError(pushError?.message || 'Notifications could not be disabled.');
    } finally {
      setBusy('');
    }
  };

  const addPasskey = async () => {
    if (busy) return;
    if (!passkeysEnabled) {
      setError('Face ID or passkey sign-in is not enabled for this DJM environment.');
      return;
    }
    if (!passkeysSupported) {
      setError('This browser or device cannot create a passkey here. Your password will keep working.');
      return;
    }

    setBusy('passkey');
    setError('');
    try {
      const { error: passkeyError } = await supabase.auth.registerPasskey();
      if (passkeyError) throw passkeyError;
      const list = await supabase.auth.passkey.list();
      if (list.error) throw list.error;
      setPasskeys(list.data || []);
      flash('Quick sign-in is ready on this device.');
    } catch (passkeyError: any) {
      const code = String(passkeyError?.code || '').toLowerCase();
      const name = String(passkeyError?.name || '').toLowerCase();
      const text = String(passkeyError?.message || '').toLowerCase();

      if (name.includes('notallowed') || text.includes('cancel')) {
        setError('Passkey setup was cancelled. Nothing changed and your password still works.');
      } else if (code.includes('credential_exists') || text.includes('already')) {
        setError('This passkey is already linked to your DJM account.');
      } else if (code.includes('passkey_disabled')) {
        setError('Face ID or passkey sign-in is not enabled for this DJM environment.');
      } else {
        setError('Passkey setup did not complete. Your password still works, so you can try again safely.');
      }
    } finally {
      setBusy('');
    }
  };

  const removePasskey = async (passkeyId: string) => {
    if (busy) return;
    setBusy(passkeyId);
    setError('');
    try {
      const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId });
      if (deleteError) throw deleteError;
      setPasskeys((current) => current.filter((item) => item.id !== passkeyId));
      flash('Passkey removed.');
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Passkey could not be removed.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <RefreshCw size={18} className={styles.spin} /> Connecting your DJM account...
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {message ? <div className={styles.success} role="status"><Check size={16} />{message}</div> : null}

      <section className={`${styles.card} ${styles.securityCard}`}>
        <div className={styles.cardHead}>
          <div className={styles.icon}><ShieldCheck size={20} /></div>
          <div>
            <span>SECURITY</span>
            <h2>Secure access, simple recovery.</h2>
            <p>Recover access through your confirmed DJM email. Your password always works. Set up Face ID or a passkey once for faster sign-in without typing your email or password.</p>
          </div>
        </div>

        <div className={styles.rows}>
          <div className={styles.row}>
            <div className={styles.rowIcon}><KeyRound size={18} /></div>
            <div className={styles.rowCopy}>
              <strong>Password recovery</strong>
              <span>{email || 'Your confirmed DJM account email'}</span>
            </div>
            <a className={styles.secondaryButton} href="/forgot-password">Reset password</a>
          </div>

          {passkeysEnabled ? (
            <div className={styles.row}>
              <div className={styles.rowIcon}><Fingerprint size={18} /></div>
              <div className={styles.rowCopy}>
                <strong>Face ID or passkey</strong>
                <span>
                  {!passkeysSupported
                    ? 'Passkeys are not available on this browser or device.'
                    : passkeys.length
                      ? `${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'} registered.`
                      : 'Set it up once here, then use Face ID, Touch ID, Windows Hello or your password manager at sign-in.'}
                </span>
              </div>
              {passkeysSupported ? (
                <button className={styles.primaryButton} type="button" onClick={() => void addPasskey()} disabled={busy === 'passkey'}>
                  <Fingerprint size={16} /> {busy === 'passkey' ? 'Setting up...' : passkeys.length ? 'Add another passkey' : 'Set up quick sign-in'}
                </button>
              ) : (
                <span className={styles.statusPill}>Unavailable on this device</span>
              )}
            </div>
          ) : null}

          {passkeys.map((passkey) => (
            <div className={styles.passkeyRow} key={passkey.id}>
              <span><Smartphone size={15} />{passkey.friendly_name || 'Passkey'}</span>
              <button type="button" onClick={() => void removePasskey(passkey.id)} disabled={busy === passkey.id}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.icon}><CalendarDays size={20} /></div>
          <div>
            <span>CALENDAR</span>
            <h2>Your DJM dates, where you already look.</h2>
            <p>Subscribe once. Dated DJM actions then stay current from the private DJM feed.</p>
          </div>
        </div>

        <div className={styles.calendarActions}>
          <button className={styles.primaryButton} type="button" onClick={openApple} disabled={!calendarToken || !calendarEnabled}>
            <CalendarDays size={16} /> Apple Calendar
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => void openGoogle()} disabled={!calendarToken || !calendarEnabled}>
            <ExternalLink size={16} /> Google Calendar
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => void copyCalendar()} disabled={!calendarToken || !calendarEnabled}>
            <Clipboard size={16} /> Copy private link
          </button>
        </div>

        <div className={styles.privateNote}>
          <ShieldCheck size={16} />
          <span>The feed contains only dated DJM action titles, times and deep links. Treat the subscription URL like a password.</span>
          <button type="button" onClick={() => void rotateCalendar()} disabled={busy === 'calendar'}>
            <RotateCcw size={14} /> {busy === 'calendar' ? 'Resetting...' : 'Reset link'}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.icon}><Bell size={20} /></div>
          <div>
            <span>SMART REMINDERS</span>
            <h2>Only the reminders that matter.</h2>
            <p>{mode === 'staff' ? 'DJM tasks and follow-ups are ranked by urgency.' : 'DJM requests and check-ins stay visible without notification noise.'}</p>
          </div>
        </div>

        <div className={styles.segmented} aria-label="Reminder intensity">
          {(['minimal', 'normal', 'everything'] as ReminderIntensity[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preferences.reminder_intensity === value}
              className={preferences.reminder_intensity === value ? styles.activeSegment : ''}
              onClick={() => setPreferences((current) => ({ ...current, reminder_intensity: value }))}
            >
              <strong>{value[0].toUpperCase() + value.slice(1)}</strong>
              <span>{value === 'minimal' ? 'Close deadline only' : value === 'normal' ? 'Next day plus urgent' : 'Adds a 3 day heads-up'}</span>
            </button>
          ))}
        </div>

        <div className={styles.rows}>
          <SettingToggle
            icon={<Bell size={18} />}
            title="Task notifications"
            text="Push reminders for dated DJM actions."
            checked={preferences.task_reminders}
            onChange={(checked) => setPreferences((current) => ({ ...current, task_reminders: checked }))}
          />
          <SettingToggle
            icon={<SunMedium size={18} />}
            title="Morning DJM brief"
            text="One concise morning summary, only when there is something to do."
            checked={preferences.morning_brief}
            onChange={(checked) => setPreferences((current) => ({ ...current, morning_brief: checked }))}
          />
          {emailDelivery.enabled ? (
            <SettingToggle
              icon={<Mail size={18} />}
              title="Email reminders"
              text="Important reminders can also reach your DJM account email."
              checked={preferences.email_reminders}
              onChange={(checked) => setPreferences((current) => ({ ...current, email_reminders: checked }))}
            />
          ) : null}
        </div>

        <div className={styles.deviceRow}>
          <div>
            <Smartphone size={18} />
            <span><strong>This device</strong><small>{pushCopy(pushState)}</small></span>
          </div>
          {pushState === 'enabled' ? (
            <button className={styles.secondaryButton} type="button" onClick={() => void disablePush()} disabled={busy === 'push'}>Turn off</button>
          ) : pushState === 'ready' ? (
            <button className={styles.primaryButton} type="button" onClick={() => void enablePush()} disabled={busy === 'push'}>{busy === 'push' ? 'Enabling...' : 'Enable notifications'}</button>
          ) : null}
        </div>

        <div className={styles.timezoneRow}>
          <label>
            Time zone
            <input
              value={preferences.timezone}
              onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))}
              placeholder="Europe/Rome"
            />
          </label>
          <button type="button" onClick={useDeviceTimezone}>Use this device</button>
        </div>

        <div className={styles.saveRow}>
          <span>Changes are saved only when you press Save.</span>
          <button className={styles.primaryButton} type="button" onClick={() => void savePreferences()} disabled={busy === 'preferences'}>
            {busy === 'preferences' ? 'Saving...' : 'Save reminder settings'}
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingToggle({
  icon,
  title,
  text,
  checked,
  disabled = false,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`${styles.row} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.rowIcon}>{icon}</div>
      <div className={styles.rowCopy}><strong>{title}</strong><span>{text}</span></div>
      <input className={styles.toggleInput} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className={styles.toggle} aria-hidden><i /></span>
    </label>
  );
}

function pushCopy(state: PushReadiness) {
  if (state === 'enabled') return 'DJM notifications are enabled on this device.';
  if (state === 'needs_install') return 'On iPhone, add DJM to the Home Screen first, then enable notifications.';
  if (state === 'denied') return 'Notifications are blocked in this device or browser settings.';
  if (state === 'ready') return 'Ready to receive DJM reminders.';
  return 'Push notifications are not supported on this device.';
}
