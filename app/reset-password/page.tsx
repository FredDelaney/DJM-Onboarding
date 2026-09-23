'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';

import Brand from '@/components/Brand';
import { isStrongPassword, STRONG_PASSWORD_MESSAGE } from '@/lib/password';
import { recoveryReturnPath } from '@/lib/recovery-return-path';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const search = useSearchParams();
  const returnPath = useMemo(
    () => recoveryReturnPath(search.get('next')),
    [search],
  );
  const backHref = returnPath || '/sign-in';
  const forgotHref = returnPath
    ? `/forgot-password?next=${encodeURIComponent(returnPath)}`
    : '/forgot-password';

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState('Checking your recovery link...');

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const recoveryLink =
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery');
      const { data } = await supabase.auth.getSession();
      if (active && recoveryLink && data.session) {
        setReady(true);
        setMessage('');
      }
    };
    void checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true);
        setMessage('');
      }
    });

    const timeout = window.setTimeout(() => {
      if (active) setMessage((current) => current || 'This recovery link is no longer active. Request a new one.');
    }, 5000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!isStrongPassword(password)) {
      setMessage(STRONG_PASSWORD_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setComplete(true);
      setPassword('');
      setConfirmPassword('');
    } catch (resetError: any) {
      setMessage(resetError?.message || 'Your password could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <section className="auth-brand">
        <Brand light />
        <div>
          <div className="yellow-line" />
          <h1>Choose a new password for your workspace.</h1>
          <p>Use a strong password you do not reuse elsewhere. You can return to the same agency journey when recovery is complete.</p>
        </div>
        <span className="small" style={{ color: 'rgba(255,255,255,.45)' }}>Secure account recovery</span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <Link href={backHref} className="small muted row" style={{ display: 'inline-flex' }}><ArrowLeft size={15} />{returnPath ? 'Back to owner workspace' : 'Back to sign in'}</Link>
          <div className="caps" style={{ color: 'var(--blue)', marginTop: 40 }}>NEW PASSWORD</div>
          <h2>{complete ? 'Password updated.' : 'Secure your account.'}</h2>

          {complete ? (
            <div className="stack" style={{ marginTop: 28 }}>
              <div className="card pad" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><ShieldCheck size={20} /><div><strong>Your new password is active.</strong><p className="small muted" style={{ marginTop: 4 }}>You have been signed out of the recovery session. Sign in again with your new password.</p></div></div>
              <Link href={backHref} className="btn btn-navy btn-block">{returnPath ? 'Back to owner workspace' : 'Sign in'} <ArrowRight size={17} /></Link>
            </div>
          ) : ready ? (
            <form className="stack" style={{ marginTop: 30 }} onSubmit={submit}>
              <PasswordField label="New password" value={password} show={show} setShow={setShow} onChange={setPassword} />
              <PasswordField label="Confirm password" value={confirmPassword} show={show} setShow={setShow} onChange={setConfirmPassword} />
              <p className="small muted">{STRONG_PASSWORD_MESSAGE}</p>
              {message ? <div className="small" style={{ padding: 12, borderRadius: 12, background: '#f3f4f6' }}>{message}</div> : null}
              <button className="btn btn-navy btn-block" disabled={busy}>{busy ? 'Updating...' : 'Set new password'} <ArrowRight size={17} /></button>
            </form>
          ) : (
            <div className="stack" style={{ marginTop: 28 }}>
              <div className="small" style={{ padding: 12, borderRadius: 12, background: '#f3f4f6' }}>{message}</div>
              <Link href={forgotHref} className="btn btn-navy btn-block">Request a new link <ArrowRight size={17} /></Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PasswordField({ label, value, show, setShow, onChange }: { label: string; value: string; show: boolean; setShow: (value: boolean) => void; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input className="input" style={{ paddingRight: 48 }} type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} minLength={12} required />
        <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: 12, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button>
      </div>
    </div>
  );
}
