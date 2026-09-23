'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

export default function ReDreamOperatorSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user) {
        router.replace('/platform');
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    router.replace('/platform');
  };

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brand}>
          <img
            src="/brand/redream-lockup-light.png"
            alt="ReDream Systems | Agency Autopilot"
            className={styles.brandLogo}
          />
          <span className={styles.brandContext}>Private control plane</span>
        </div>

        <div className={styles.statement}>
          <p>REDREAM SYSTEMS</p>
          <h1>Run the agency. Move the business.</h1>
          <span>The operating system behind modern football agencies.</span>
        </div>

        <small>Authorised platform operators only.</small>
      </section>

      <section className={styles.formPanel}>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.lock}>
            <LockKeyhole size={18} />
          </div>

          <p className={styles.eyebrow}>OPERATOR ACCESS</p>
          <h2>Welcome back.</h2>
          <p className={styles.copy}>
            Sign in to the ReDream Systems control plane.
          </p>

          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {message ? <div className={styles.message}>{message}</div> : null}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
