'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Fingerprint } from 'lucide-react';

import Brand from '@/components/Brand';
import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import { getAuthCapabilities } from '@/lib/auth-capabilities';
import { resolveSignedInDestination } from '@/lib/auth-routing';
import { captureReturnPath } from '@/lib/capture-return-path';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const router = useRouter();
  const runtime = useTenantRuntime();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [msg, setMsg] = useState('');

  const routeUser = async (userId: string) => {
    const destination = await resolveSignedInDestination(userId, {
      runtimeTenantId: runtime.tenant_id,
      runtimeTenantSlug: runtime.resolved ? runtime.slug : null,
    });

    const captureReturn = captureReturnPath(
      new URLSearchParams(window.location.search).get('next'),
    );

    if (captureReturn && destination.kind === 'agency') {
      router.replace(captureReturn);
      return;
    }

    router.replace(destination.href);
  };

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      try {
        await routeUser(data.session.user.id);
      } catch {
        if (active) setMsg('We could not open your workspace. Please try again.');
      }
    });

    void getAuthCapabilities().then((capabilities) => {
      if (!active) return;
      setPasskeyReady(
        capabilities.passkeysEnabled && capabilities.passkeysSupported,
      );
    });

    return () => {
      active = false;
    };
  }, [runtime.tenant_id, runtime.resolved, runtime.slug]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    try {
      await routeUser(data.user.id);
    } catch {
      setMsg('You signed in, but we could not resolve your workspace. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signInWithPasskey = async () => {
    if (!passkeyReady || passkeyBusy) return;
    setPasskeyBusy(true);
    setMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.user) throw new Error('passkey_not_found');
      await routeUser(data.user.id);
    } catch (error: any) {
      const code = String(error?.code || '').toLowerCase();
      const name = String(error?.name || '').toLowerCase();
      const text = String(error?.message || '').toLowerCase();

      if (
        name.includes('notallowed') ||
        code.includes('credential_not_found') ||
        text.includes('cancel') ||
        text.includes('credential') ||
        text.includes('passkey_not_found')
      ) {
        setMsg('No passkey was used. Sign in with your password below.');
      } else if (
        code.includes('passkey_disabled') ||
        (text.includes('passkey') && text.includes('disabled'))
      ) {
        setMsg('Quick sign-in is not enabled for this workspace. Use your password below.');
      } else {
        setMsg('Face ID or passkey sign-in did not complete. Use your password below.');
      }
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <section className="auth-brand">
        <Brand light />
        <div>
          <div className="yellow-line" />
          <h1>Private access. The right workspace for you.</h1>
          <p>
            Agency staff open the ReDream Agency Workspace. Represented players
            open their private Player Workspace from the same secure sign-in.
          </p>
        </div>
        <span className="small" style={{ color: 'rgba(255,255,255,.45)' }}>
          ReDream · Private workspace
        </span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <Link
            href="/"
            className="small muted row"
            style={{ display: 'inline-flex' }}
          >
            <ArrowLeft size={15} />Back
          </Link>

          <div
            className="caps"
            style={{ color: 'var(--blue)', marginTop: 40 }}
          >
            PRIVATE ACCESS
          </div>
          <h2>Welcome back.</h2>
          <p className="page-intro" style={{ fontSize: 15 }}>
            Sign in once. ReDream will open the workspace your account is
            authorised to use.
          </p>

          {passkeyReady ? (
            <button
              className="btn btn-navy btn-block"
              style={{ marginTop: 26 }}
              type="button"
              onClick={() => void signInWithPasskey()}
              disabled={passkeyBusy}
            >
              <Fingerprint size={18} />
              {passkeyBusy ? 'Opening secure sign-in...' : 'Use Face ID or passkey'}
            </button>
          ) : null}

          {passkeyReady ? (
            <>
              <div
                className="small muted"
                style={{ textAlign: 'center', margin: '10px 0 -8px', lineHeight: 1.5 }}
              >
                No email or password needed if you already set up a passkey on
                this device or password manager.
              </div>
              <div
                className="small muted"
                style={{ textAlign: 'center', margin: '18px 0 -8px' }}
              >
                or sign in with your password
              </div>
            </>
          ) : null}

          <form onSubmit={submit} className="stack" style={{ marginTop: 30 }}>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>

            <div className="field">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <label className="label">Password</label>
                <Link
                  href="/forgot-password"
                  className="small"
                  style={{ color: 'var(--blue)', fontWeight: 720 }}
                >
                  Forgot password?
                </Link>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  style={{ paddingRight: 48 }}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow(!show)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 12,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {msg ? (
              <div
                className="small"
                style={{ padding: 12, borderRadius: 12, background: '#f3f4f6' }}
              >
                {msg}
              </div>
            ) : null}

            <button className="btn btn-navy btn-block" disabled={busy}>
              {busy ? 'Opening workspace...' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>

          <p className="small muted" style={{ marginTop: 22, lineHeight: 1.6 }}>
            New agency staff join through a secure invitation from their agency.
            New players join through their private player invitation.
          </p>
        </div>
      </section>
    </main>
  );
}
