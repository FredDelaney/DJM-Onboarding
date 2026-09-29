'use client';

import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  Mail,
} from 'lucide-react';
import { useState } from 'react';

import ConnectionsPanel from '@/components/ConnectionsPanel';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import { useAdmin } from '@/components/AdminShell';
import styles from '@/components/AccountSettings.module.css';
import { friendlyError } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

export default function SecuritySettingsPage() {
  const auth = useAdmin();
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const email = String(auth.user?.email || '');

  const sendPasswordReset = async () => {
    if (!email) return;
    setBusy('password');
    setError('');
    setMessage('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) throw resetError;
      setMessage('Password reset email sent.');
    } catch (resetError) {
      setError(friendlyError(resetError));
    } finally {
      setBusy('');
    }
  };

  const signOut = async () => {
    setBusy('sign-out');
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  return (
    <SettingsWorkspace
      title="Security"
      description="Password and sign-in controls for your account."
    >
      <div className={styles.stack}>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? (
          <div className={styles.success}>
            <CheckCircle2 size={16} />
            {message}
          </div>
        ) : null}

        <div className={styles.gridTwo}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Sign-in email</h2>
                <p>Your account identity used to access ReDream.</p>
              </div>
              <Mail size={19} />
            </div>
            <label className={styles.field}>
              <span>Email</span>
              <input value={email} disabled />
            </label>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Password</h2>
                <p>Send a secure reset link to your account email.</p>
              </div>
              <KeyRound size={19} />
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void sendPasswordReset()}
                disabled={!email || Boolean(busy)}
              >
                Send password reset
              </button>
            </div>
          </section>
        </div>

        <ConnectionsPanel
          userId={String(auth.user?.id || '')}
          email={email}
          mode="staff"
          sections="security"
        />

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>This device</h2>
              <p>End the current ReDream session on this browser or device.</p>
            </div>
            <LogOut size={19} />
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void signOut()}
              disabled={Boolean(busy)}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </section>
      </div>
    </SettingsWorkspace>
  );
}
