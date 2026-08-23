'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Brand from '@/components/Brand';
import { supabase } from '@/lib/supabase';

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('validate_player_invite', {
        invite_token: token,
      });

      setInvite(!error ? data?.[0] : null);
      setLoading(false);
    })();
  }, [token]);

  const submit = async (e: any) => {
    e.preventDefault();
    if (!invite?.email) return;

    setBusy(true);
    setMsg('');

    try {
      // Make sure an existing DJM/admin session cannot bleed into
      // the new player's onboarding experience.
      await supabase.auth.signOut();

      const { data: accepted, error: inviteError } =
        await supabase.functions.invoke('accept-player-invite', {
          body: {
            token,
            email: invite.email,
            password,
            full_name: name,
          },
        });

      if (inviteError) throw inviteError;
      if (accepted?.error) throw new Error(accepted.error);

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: invite.email,
          password,
        });

      if (signInError) throw signInError;

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        throw new Error(
          'Your account was created, but we could not start your session. Please sign in again.'
        );
      }

      setMsg('Welcome to DJM Player.');
      router.replace('/onboarding');
    } catch (error: any) {
      setMsg(
        error?.message ||
          'We could not activate your DJM Player account. Please try again.'
      );
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  if (!invite?.valid) {
    return (
      <div className="center">
        <div
          className="card pad-lg"
          style={{ maxWidth: 430, textAlign: 'center' }}
        >
          <Brand />
          <h2 style={{ marginTop: 28 }}>
            This invitation is no longer active.
          </h2>
          <p className="muted">
            Ask DJM for a new player invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="auth-wrap">
      <section className="auth-brand">
        <Brand light />

        <div>
          <CheckCircle2 size={28} color="#f5e900" />

          <h1 style={{ fontSize: 50 }}>
            Welcome to DJM Player.
          </h1>

          <p>
            Your profile, check-ins, private career information
            and DJM requests will live here from now on.
          </p>
        </div>

        <span
          className="small"
          style={{ color: 'rgba(255,255,255,.45)' }}
        >
          Invitation for {invite.email}
        </span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <div
            className="caps"
            style={{ color: 'var(--blue)' }}
          >
            PRIVATE INVITATION
          </div>

          <h2>Set up your access.</h2>

          <p
            className="page-intro"
            style={{ fontSize: 15 }}
          >
            This takes less than a minute. Your onboarding follows
            straight after.
          </p>

          <form
            onSubmit={submit}
            className="stack"
            style={{ marginTop: 28 }}
          >
            <div className="field">
              <label className="label">
                Your name
              </label>

              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>

            <div className="field">
              <label className="label">
                Email
              </label>

              <input
                className="input"
                value={invite.email}
                disabled
              />
            </div>

            <div className="field">
              <label className="label">
                Create password
              </label>

              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {msg && (
              <div className="small">
                {msg}
              </div>
            )}

            <button
              className="btn btn-navy btn-block"
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Continue'}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
