'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from 'lucide-react';

import Brand from '@/components/Brand';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cleanEmail = email.trim().toLowerCase();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (resetError) throw resetError;
      setSent(true);
    } catch (resetError: any) {
      setError(resetError?.message || 'The recovery email could not be sent.');
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
          <h1>Get back into DJM securely.</h1>
          <p>Password recovery uses your confirmed account email. DJM never needs to know your password.</p>
        </div>
        <span className="small" style={{ color: 'rgba(255,255,255,.45)' }}>DJM Sports Management · Private player environment</span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <Link href="/sign-in" className="small muted row" style={{ display: 'inline-flex' }}><ArrowLeft size={15} />Back to sign in</Link>
          <div className="caps" style={{ color: 'var(--blue)', marginTop: 40 }}>ACCOUNT RECOVERY</div>
          <h2>{sent ? 'Check your email.' : 'Reset your password.'}</h2>
          <p className="page-intro" style={{ fontSize: 15 }}>
            {sent
              ? 'If this address belongs to a DJM account, a secure reset link has been sent.'
              : 'Enter the email you use for DJM. We will send a secure link to choose a new password.'}
          </p>

          {sent ? (
            <div className="stack" style={{ marginTop: 28 }}>
              <div className="card pad" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <ShieldCheck size={20} />
                <div><strong>Recovery email requested</strong><p className="small muted" style={{ marginTop: 4 }}>Open the newest DJM recovery email. The link returns you to DJM to set a new password.</p></div>
              </div>
              <Link href="/sign-in" className="btn btn-navy btn-block">Back to sign in <ArrowRight size={17} /></Link>
            </div>
          ) : (
            <form className="stack" style={{ marginTop: 30 }} onSubmit={submit}>
              <div className="field">
                <label className="label">Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--muted)' }} />
                  <input className="input" style={{ paddingLeft: 44 }} type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" required />
                </div>
              </div>
              {error ? <div className="small" style={{ padding: 12, borderRadius: 12, background: '#fff1f2', color: '#9f1239' }}>{error}</div> : null}
              <button className="btn btn-navy btn-block" disabled={busy}>{busy ? 'Sending...' : 'Send secure reset link'} <ArrowRight size={17} /></button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
