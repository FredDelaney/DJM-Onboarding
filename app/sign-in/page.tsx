'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Fingerprint } from 'lucide-react';

import Brand from '@/components/Brand';
import { getDjmAuthCapabilities } from '@/lib/auth-capabilities';
import { isStrongPassword, STRONG_PASSWORD_MESSAGE } from '@/lib/password';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'staff'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [msg, setMsg] = useState('');

  const routeUser = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    router.replace(profile?.role === 'admin' || profile?.role === 'scout' ? '/admin' : '/home');
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      await routeUser(data.session.user.id);
    });

    void getDjmAuthCapabilities().then((capabilities) => {
      setPasskeyReady(capabilities.passkeysEnabled && capabilities.passkeysSupported);
    });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMsg('');

    const cleanEmail = email.trim().toLowerCase();

    if (mode === 'staff' && !isStrongPassword(password)) {
      setMsg(STRONG_PASSWORD_MESSAGE);
      setBusy(false);
      return;
    }

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
      await routeUser(data.user.id);
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: cleanEmail.split('@')[0] } },
    });

    if (error) {
      const text = error.message?.toLowerCase() || '';
      if (text.includes('database error saving new user') || text.includes('valid djm player invitation')) {
        setMsg('This email is not authorised for DJM staff access.');
      } else {
        setMsg(error.message);
      }
      setBusy(false);
      return;
    }

    if (data.session) {
      router.replace('/admin');
      setBusy(false);
      return;
    }

    setMsg('Account created. Check your email to confirm your account, then sign in.');
    setBusy(false);
  };

  const signInWithPasskey = async () => {
    if (!passkeyReady || passkeyBusy) return;
    setPasskeyBusy(true);
    setMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.user) throw new Error('DJM could not identify this passkey.');
      await routeUser(data.user.id);
    } catch (error: any) {
      setMsg(error?.message || 'Passkey sign-in was cancelled or unavailable.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const changeMode = () => {
    setMode(mode === 'login' ? 'staff' : 'login');
    setMsg('');
    setPassword('');
  };

  return (
    <main className="auth-wrap">
      <section className="auth-brand">
        <Brand light />
        <div>
          <div className="yellow-line" />
          <h1>Private by design. Simple by default.</h1>
          <p>DJM Player keeps the player experience deliberately light while giving the agency the information needed to represent a career properly.</p>
        </div>
        <span className="small" style={{ color: 'rgba(255,255,255,.45)' }}>DJM Sports Management · Private player environment</span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <Link href="/" className="small muted row" style={{ display: 'inline-flex' }}><ArrowLeft size={15} />Back</Link>
          <div className="caps" style={{ color: 'var(--blue)', marginTop: 40 }}>{mode === 'login' ? 'PRIVATE ACCESS' : 'DJM STAFF'}</div>
          <h2>{mode === 'login' ? 'Welcome back.' : 'Create staff access.'}</h2>
          <p className="page-intro" style={{ fontSize: 15 }}>
            {mode === 'login'
              ? 'Sign in to your DJM career space. New players join through a private invitation.'
              : 'Only pre-authorised DJM staff emails can create an account.'}
          </p>

          {mode === 'login' && passkeyReady ? (
            <button className="btn btn-navy btn-block" style={{ marginTop: 26 }} type="button" onClick={() => void signInWithPasskey()} disabled={passkeyBusy}>
              <Fingerprint size={18} /> {passkeyBusy ? 'Checking passkey...' : 'Continue with Face ID or passkey'}
            </button>
          ) : null}

          {mode === 'login' && passkeyReady ? <div className="small muted" style={{ textAlign: 'center', margin: '18px 0 -8px' }}>or use your password</div> : null}

          <form onSubmit={submit} className="stack" style={{ marginTop: 30 }}>
            <div className="field">
              <label className="label">Email</label>
              <input className="input" type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" required />
            </div>

            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <label className="label">Password</label>
                {mode === 'login' ? <Link href="/forgot-password" className="small" style={{ color: 'var(--blue)', fontWeight: 720 }}>Forgot password?</Link> : null}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  style={{ paddingRight: 48 }}
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'staff' ? '12+ characters · upper, lower, number, symbol' : 'Your password'}
                  minLength={mode === 'staff' ? 12 : 6}
                  required
                />
                <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: 12, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {msg ? <div className="small" style={{ padding: 12, borderRadius: 12, background: '#f3f4f6' }}>{msg}</div> : null}

            <button className="btn btn-navy btn-block" disabled={busy}>{busy ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create staff account'} <ArrowRight size={17} /></button>
          </form>

          <button type="button" onClick={changeMode} style={{ border: 0, background: 'none', padding: 0, marginTop: 22, color: 'var(--blue)', fontWeight: 720, cursor: 'pointer' }}>
            {mode === 'login' ? 'DJM staff: create authorised account' : 'Back to sign in'}
          </button>
        </div>
      </section>
    </main>
  );
}
