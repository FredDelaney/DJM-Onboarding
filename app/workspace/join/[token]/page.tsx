'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {
  useParams,
  useRouter,
} from 'next/navigation';

import {
  isStrongPassword,
} from '@/lib/password';
import { supabase } from '@/lib/supabase';

const cleanColour = (
  value: unknown,
  fallback: string,
) => {
  const colour = String(
    value || '',
  ).trim();

  return /^#[0-9a-f]{6}$/i.test(
    colour,
  )
    ? colour
    : fallback;
};

export default function StaffInvitePage() {
  const params =
    useParams<{ token: string }>();

  const token = Array.isArray(
    params?.token,
  )
    ? params.token[0]
    : params?.token;

  const router = useRouter();

  const [invite, setInvite] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [mode, setMode] =
    useState<'register' | 'sign-in'>(
      'register',
    );

  const [fullName, setFullName] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [sessionEmail, setSessionEmail] =
    useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      if (!token) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      const [{ data, error }, sessionResult] =
        await Promise.all([
          supabase.functions.invoke(
            'agency-staff-invite-public',
            {
              body: {
                action: 'preflight',
                token,
              },
            },
          ),
          supabase.auth.getSession(),
        ]);

      if (!active) return;

      setInvite(
        !error && !data?.error
          ? data?.invite || null
          : null,
      );

      setSessionEmail(
        String(
          sessionResult.data.session?.user
            ?.email || '',
        )
          .trim()
          .toLowerCase(),
      );

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const inviteEmail = String(
    invite?.email || '',
  )
    .trim()
    .toLowerCase();

  const branding =
    invite?.branding || {};

  const agencyName =
    String(
      branding.display_name ||
        invite?.tenant?.slug ||
        'Agency',
    ).trim() || 'Agency';

  const shortName =
    String(
      branding.short_name ||
        agencyName,
    ).trim() || agencyName;

  const roleLabel = humanRole(
    String(invite?.role || ''),
  );

  const sessionMatchesInvite =
    Boolean(sessionEmail) &&
    sessionEmail === inviteEmail;

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 12,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      symbol:
        /[^A-Za-z0-9]/.test(password),
    }),
    [password],
  );

  const passwordReady =
    isStrongPassword(password);

  const tenantStyle = {
    '--navy': cleanColour(
      branding.primary_color,
      '#0A1B3D',
    ),
    '--blue': cleanColour(
      branding.primary_color,
      '#0A1B3D',
    ),
    '--yellow': cleanColour(
      branding.accent_color,
      '#5B8CFF',
    ),
  } as React.CSSProperties;

  const activateExisting = async () => {
    if (!token) return;

    setBusy(true);
    setMessage('');

    try {
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'agency-staff-invite',
          {
            body: { token },
          },
        );

      if (error) throw error;
      if (data?.error) {
        throw new Error(data.error);
      }

      router.replace('/agency');
    } catch (error: any) {
      setMessage(
        error?.message ||
          'Unable to activate agency access.',
      );
      setBusy(false);
    }
  };

  const register = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !token ||
      !inviteEmail ||
      !passwordReady
    ) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'agency-staff-invite-public',
          {
            body: {
              action: 'register',
              token,
              email: inviteEmail,
              password,
              full_name: fullName,
            },
          },
        );

      if (error) throw error;

      if (data?.account_exists) {
        setMode('sign-in');
        setMessage(
          'An account already exists for this email. Sign in to accept the invitation.',
        );
        setBusy(false);
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const {
        error: signInError,
      } =
        await supabase.auth.signInWithPassword(
          {
            email: inviteEmail,
            password,
          },
        );

      if (signInError) {
        throw signInError;
      }

      router.replace('/agency');
    } catch (error: any) {
      setMessage(
        error?.message ||
          'Unable to create your account.',
      );
      setBusy(false);
    }
  };

  const signInAndAccept = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!token || !inviteEmail) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const {
        error: signInError,
      } =
        await supabase.auth.signInWithPassword(
          {
            email: inviteEmail,
            password,
          },
        );

      if (signInError) {
        throw signInError;
      }

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'agency-staff-invite',
          {
            body: { token },
          },
        );

      if (error) throw error;
      if (data?.error) {
        throw new Error(data.error);
      }

      router.replace('/agency');
    } catch (error: any) {
      setMessage(
        error?.message ||
          'Unable to accept the invitation.',
      );
      setBusy(false);
    }
  };

  const signOutForInvite = async () => {
    await supabase.auth.signOut();
    setSessionEmail('');
    setMode('sign-in');
    setMessage('');
  };

  if (loading) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
    );
  }

  if (!invite) {
    return (
      <div
        className="center"
        style={tenantStyle}
      >
        <div
          className="card pad-lg"
          style={{
            maxWidth: 440,
            textAlign: 'center',
          }}
        >
          <ShieldCheck size={28} />
          <h2>
            This invitation is no longer
            active.
          </h2>
          <p className="muted">
            Ask the agency for a new team
            invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main
      className="auth-wrap"
      style={tenantStyle}
    >
      <section className="auth-brand">
        <div className="brand brand-light">
          <span className="brand-mark">
            {shortName
              .split(/\s+/)
              .filter(Boolean)
              .map(
                (part: string) =>
                  part[0],
              )
              .join('')
              .slice(0, 3)
              .toUpperCase()}
          </span>

          <span className="brand-copy">
            {agencyName}
            <small>
              REDREAM AGENCY WORKSPACE
            </small>
          </span>
        </div>

        <div>
          <div className="caps">
            TEAM INVITATION
          </div>

          <h1>
            Join {agencyName}
          </h1>

          <p>
            You have been invited as{' '}
            <strong>{roleLabel}</strong>.
            Your access applies to this
            agency workspace only.
          </p>
        </div>

        <span className="small">
          <ShieldCheck size={14} />
          Secure tenant invitation ·{' '}
          {inviteEmail}
        </span>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          {sessionEmail ? (
            sessionMatchesInvite ? (
              <>
                <div className="caps">
                  ACCOUNT FOUND
                </div>

                <h2>
                  Continue as {inviteEmail}
                </h2>

                <p className="page-intro">
                  This signed-in account
                  matches the invitation.
                  Confirm to join{' '}
                  {agencyName}.
                </p>

                {message ? (
                  <div className="join-message">
                    {message}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="btn btn-navy btn-block"
                  onClick={() =>
                    void activateExisting()
                  }
                  disabled={busy}
                >
                  {busy
                    ? 'Activating...'
                    : 'Activate agency access'}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <div className="caps">
                  WRONG ACCOUNT
                </div>

                <h2>
                  Use the invited email.
                </h2>

                <p className="page-intro">
                  You are signed in as{' '}
                  {sessionEmail}, but this
                  invitation belongs to{' '}
                  {inviteEmail}.
                </p>

                <button
                  type="button"
                  className="btn btn-navy btn-block"
                  onClick={() =>
                    void signOutForInvite()
                  }
                >
                  <LogOut size={16} />
                  Sign out and continue
                </button>
              </>
            )
          ) : mode === 'register' ? (
            <form
              onSubmit={register}
              className="stack"
            >
              <div className="caps">
                CREATE ACCOUNT
              </div>

              <h2>
                Join the agency workspace.
              </h2>

              <p className="page-intro">
                Create your ReDream account.
                The invitation will attach
                it only to {agencyName}.
              </p>

              <div className="field">
                <label className="label">
                  Full name
                </label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(
                      event.target.value,
                    )
                  }
                  autoComplete="name"
                  required
                />
              </div>

              <div className="field">
                <label className="label">
                  Email
                </label>
                <input
                  className="input"
                  value={inviteEmail}
                  readOnly
                />
              </div>

              <div className="field">
                <label className="label">
                  Password
                </label>

                <div
                  style={{
                    position: 'relative',
                  }}
                >
                  <input
                    className="input"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target.value,
                      )
                    }
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current,
                      )
                    }
                    style={{
                      position:
                        'absolute',
                      right: 10,
                      top: '50%',
                      transform:
                        'translateY(-50%)',
                      border: 0,
                      background:
                        'transparent',
                    }}
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                {[
                  [
                    'length',
                    '12+ characters',
                  ],
                  [
                    'upper',
                    'Uppercase',
                  ],
                  [
                    'lower',
                    'Lowercase',
                  ],
                  ['number', 'Number'],
                  ['symbol', 'Symbol'],
                ].map(([key, label]) => (
                  <span
                    key={key}
                    style={{
                      opacity:
                        passwordChecks[
                          key as keyof typeof passwordChecks
                        ]
                          ? 1
                          : 0.5,
                    }}
                  >
                    <Check size={11} />{' '}
                    {label}
                  </span>
                ))}
              </div>

              {message ? (
                <div className="join-message">
                  {message}
                </div>
              ) : null}

              <button
                className="btn btn-navy btn-block"
                disabled={
                  busy ||
                  !passwordReady ||
                  fullName.trim().length <
                    2
                }
              >
                {busy
                  ? 'Creating account...'
                  : `Join as ${roleLabel}`}
                <ArrowRight size={17} />
              </button>

              <button
                type="button"
                className="btn btn-block"
                onClick={() => {
                  setMode('sign-in');
                  setMessage('');
                  setPassword('');
                }}
              >
                Already have an account?
                Sign in
              </button>
            </form>
          ) : (
            <form
              onSubmit={signInAndAccept}
              className="stack"
            >
              <div className="caps">
                EXISTING ACCOUNT
              </div>

              <h2>
                Sign in to accept.
              </h2>

              <p className="page-intro">
                Sign in as {inviteEmail}.
                ReDream will attach this
                account to {agencyName}
                after the invitation is
                verified.
              </p>

              <div className="field">
                <label className="label">
                  Email
                </label>
                <input
                  className="input"
                  value={inviteEmail}
                  readOnly
                />
              </div>

              <div className="field">
                <label className="label">
                  Password
                </label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  autoComplete="current-password"
                  required
                />
              </div>

              {message ? (
                <div className="join-message">
                  {message}
                </div>
              ) : null}

              <button
                className="btn btn-navy btn-block"
                disabled={busy}
              >
                {busy
                  ? 'Signing in...'
                  : 'Sign in and join'}
                <ArrowRight size={17} />
              </button>

              <button
                type="button"
                className="btn btn-block"
                onClick={() => {
                  setMode('register');
                  setMessage('');
                  setPassword('');
                }}
              >
                Create a new account instead
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function humanRole(value: string) {
  if (value === 'operations') {
    return 'Operations';
  }

  if (value === 'admin') {
    return 'Admin';
  }

  if (value === 'agent') {
    return 'Agent';
  }

  if (value === 'scout') {
    return 'Scout';
  }

  return 'Agency team member';
}
