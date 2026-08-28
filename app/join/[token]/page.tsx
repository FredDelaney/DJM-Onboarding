'use client';

import {
  useEffect,
  useState,
} from 'react';
import {
  useParams,
  useRouter,
} from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

import Brand from '@/components/Brand';
import {
  isStrongPassword,
  STRONG_PASSWORD_MESSAGE,
} from '@/lib/password';
import { supabase } from '@/lib/supabase';

export default function Join() {
  const { token } =
    useParams<{ token: string }>();
  const router = useRouter();

  const [invite, setInvite] =
    useState<any>(null);
  const [loading, setLoading] =
    useState(true);
  const [password, setPassword] =
    useState('');
  const [msg, setMsg] =
    useState('');
  const [busy, setBusy] =
    useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } =
        await supabase.rpc(
          'validate_player_invite_v2',
          {
            invite_token: token,
          },
        );

      setInvite(
        !error ? data?.[0] : null,
      );
      setLoading(false);
    })();
  }, [token]);

  const submit = async (event: any) => {
    event.preventDefault();

    if (!invite?.email) return;

    if (!isStrongPassword(password)) {
      setMsg(STRONG_PASSWORD_MESSAGE);
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      await supabase.auth.signOut();

      const {
        data: accepted,
        error: inviteError,
      } = await supabase.functions.invoke(
        'accept-player-invite',
        {
          body: {
            token,
            email: invite.email,
            password,
          },
        },
      );

      if (inviteError) {
        throw inviteError;
      }

      if (accepted?.error) {
        throw new Error(
          accepted.error,
        );
      }

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: invite.email,
          password,
        });

      if (signInError) {
        throw signInError;
      }

      const { data: sessionData } =
        await supabase.auth.getSession();

      if (!sessionData.session) {
        throw new Error(
          'Your account was created, but we could not start your session. Please sign in again.',
        );
      }

      router.replace('/onboarding');
    } catch (error: any) {
      setMsg(
        error?.message ||
          'We could not activate your DJM Player account. Please try again.',
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
          style={{
            maxWidth: 430,
            textAlign: 'center',
          }}
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

  const playerName =
    invite.full_name || 'Player';

  return (
    <main className="auth-wrap join-premium">
      <section className="auth-brand join-premium-brand">
        <Brand light />

        <div>
          <div className="join-player-mark">
            {String(playerName)
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="caps join-caps">
            YOUR PRIVATE CAREER SPACE
          </div>

          <h1>{playerName}</h1>

          <p>
            DJM has already started your player record. Check the details, add anything we cannot know for you, and you are done.
          </p>
        </div>

        <span className="small join-private-line">
          <ShieldCheck size={14} />
          Private invitation · {invite.email}
        </span>
      </section>

      <section className="auth-form">
        <div className="auth-box join-premium-box">
          <div
            className="caps"
            style={{ color: 'var(--blue)' }}
          >
            DJM PLAYER
          </div>

          <h2>Your profile is waiting.</h2>

          <p className="page-intro">
            We already know who you are. Create your private access and then just check what DJM has prepared.
          </p>

          <div className="join-known-card">
            <CheckCircle2 size={18} />
            <div>
              <strong>{playerName}</strong>
              <span>{invite.email}</span>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="stack"
          >
            <div className="field">
              <label className="label">
                Create password
              </label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="12+ characters · upper, lower, number, symbol"
                minLength={12}
                required
              />
            </div>

            {msg && (
              <div className="join-message">
                {msg}
              </div>
            )}

            <button
              className="btn btn-navy btn-block join-continue"
              disabled={busy}
            >
              {busy
                ? 'Creating…'
                : 'Open my DJM Player'}
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="join-trust-note">
            <ShieldCheck size={16} />
            <span>
              Personal documents, salary expectations and private career information are not public.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
