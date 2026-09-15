'use client';

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'next/navigation';

import { platformInvoke, friendlyError } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type InvitePayload = {
  email: string;
  expires_at: string;
  tenant?: {
    id?: string | null;
    slug?: string | null;
    status?: string | null;
  } | null;
  branding?: {
    display_name?: string | null;
    short_name?: string | null;
    portal_name?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    support_email?: string | null;
    website_url?: string | null;
  } | null;
  plan?: {
    plan_key?: string | null;
    status?: string | null;
  } | null;
};

type Workspace = {
  tenant_id?: string | null;
  tenant_slug?: string | null;
  portal_name?: string | null;
  hostname?: string | null;
  role?: string | null;
};

const strongPassword = (value: string) => ({
  length: value.length >= 12,
  lower: /[a-z]/.test(value),
  upper: /[A-Z]/.test(value),
  number: /\d/.test(value),
  symbol: /[^A-Za-z0-9]/.test(value),
});

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const formatExpiry = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function AgencyOwnerJoinPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || '').trim();
  const preflightStarted = useRef(false);

  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'register' | 'sign-in'>('register');
  const [sessionEmail, setSessionEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (preflightStarted.current) return;
      preflightStarted.current = true;

      try {
        const [inviteResult, sessionResult] = await Promise.all([
          platformInvoke<{ invite?: InvitePayload | null }>(
            'agency-owner-invite-public',
            {
              action: 'preflight',
              token,
            },
          ),
          supabase.auth.getSession(),
        ]);

        if (!active) return;

        const nextInvite = inviteResult?.invite || null;
        if (!nextInvite) {
          setInvalid(true);
          return;
        }

        setInvite(nextInvite);
        setSessionEmail(
          String(sessionResult.data.session?.user?.email || '')
            .trim()
            .toLowerCase(),
        );

        const title =
          nextInvite.branding?.portal_name ||
          nextInvite.branding?.display_name ||
          'Agency workspace';
        document.title = `${title} | Activate workspace`;
      } catch {
        if (active) setInvalid(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        setSessionEmail(
          String(session?.user?.email || '')
            .trim()
            .toLowerCase(),
        );
      },
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [token]);

  const brandName =
    invite?.branding?.display_name ||
    invite?.branding?.short_name ||
    'Agency workspace';
  const portalName =
    invite?.branding?.portal_name ||
    invite?.branding?.short_name ||
    brandName;
  const primary = invite?.branding?.primary_color || '#111827';
  const accent = invite?.branding?.accent_color || '#7c6cf2';

  const passwordChecks = useMemo(() => strongPassword(password), [password]);
  const passwordReady = Object.values(passwordChecks).every(Boolean);
  const inviteEmail = String(invite?.email || '')
    .trim()
    .toLowerCase();
  const sessionMatchesInvite =
    Boolean(sessionEmail) &&
    Boolean(inviteEmail) &&
    sessionEmail === inviteEmail;

  const completeExistingAccount = async () => {
    if (!sessionMatchesInvite || busy) return;
    setBusy(true);
    setMessage('');

    try {
      const result = await platformInvoke<{ workspace?: Workspace }>(
        'agency-owner-invite',
        { token },
      );
      setWorkspace(result?.workspace || {});
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      !invite ||
      !passwordReady ||
      fullName.trim().length < 2
    ) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const result = await platformInvoke<{ workspace?: Workspace }>(
        'agency-owner-invite-public',
        {
          action: 'register',
          token,
          email: inviteEmail,
          full_name: fullName.trim(),
          password,
        },
      );

      const signIn = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });

      if (signIn.error) {
        setMessage(
          'Your owner account was created, but automatic sign-in did not complete. Sign in with the password you just created.',
        );
        setMode('sign-in');
        return;
      }

      setWorkspace(result?.workspace || {});
    } catch (error) {
      const nextMessage = friendlyError(error);
      if (nextMessage.toLowerCase().includes('account already exists')) {
        setMode('sign-in');
        setMessage(
          'This email already has an account. Sign in to accept the invitation.',
        );
      } else {
        setMessage(nextMessage);
      }
    } finally {
      setBusy(false);
    }
  };

  const signInAndAccept = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !inviteEmail || !password) return;

    setBusy(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });
      if (error) throw error;

      const result = await platformInvoke<{ workspace?: Workspace }>(
        'agency-owner-invite',
        { token },
      );
      setWorkspace(result?.workspace || {});
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const signOutForInvite = async () => {
    await supabase.auth.signOut();
    setSessionEmail('');
    setMessage('');
  };

  if (loading) {
    return (
      <main className={styles.loading}>
        <div className={styles.loadingMark}>
          <LockKeyhole size={18} />
        </div>
        <strong>Opening secure invitation</strong>
        <span>Checking the workspace and invitation.</span>
      </main>
    );
  }

  if (invalid || !invite) {
    return (
      <main className={styles.invalidPage}>
        <section className={styles.invalidCard}>
          <ShieldCheck size={24} />
          <h1>This invitation is no longer available.</h1>
          <p>
            It may have expired, been replaced or already been used. Ask your
            agency contact for a new secure invitation.
          </p>
        </section>
      </main>
    );
  }

  const theme = {
    '--agency-primary': primary,
    '--agency-accent': accent,
  } as CSSProperties;

  if (workspace) {
    return (
      <main className={styles.successPage} style={theme}>
        <section className={styles.successPanel}>
          <div className={styles.successIcon}>
            <Check size={22} />
          </div>
          <p className={styles.eyebrow}>OWNER ACCESS ACTIVE</p>
          <h1>{portalName} is ready for you.</h1>
          <p>
            Your owner account is connected to {brandName}. Your agency
            workspace is now isolated to this organisation.
          </p>

          {workspace.tenant_slug ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() =>
                window.location.assign(
                  `/activate/${encodeURIComponent(workspace.tenant_slug || '')}`,
                )
              }
            >
              Continue to {portalName}
              <ArrowRight size={17} />
            </button>
          ) : (
            <div className={styles.workspacePending}>
              <ShieldCheck size={17} />
              <div>
                <strong>Owner access is complete</strong>
                <span>
                  Your agency setup route could not be resolved. Contact the
                  organisation that sent this invitation.
                </span>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} style={theme}>
      <section className={styles.brandPanel}>
        <div className={styles.brandLockup}>
          <div className={styles.brandMark}>
            {initials(brandName) || 'A'}
          </div>
          <div>
            <strong>{brandName}</strong>
            <span>{portalName}</span>
          </div>
        </div>

        <div className={styles.brandStatement}>
          <p className={styles.eyebrow}>PRIVATE AGENCY WORKSPACE</p>
          <h1>Your agency, ready to operate.</h1>
          <p>
            Activate your owner account to open the workspace prepared for your
            players, relationships and opportunities.
          </p>
        </div>

        <div className={styles.inviteMeta}>
          <span>
            {invite.plan?.plan_key
              ? `${invite.plan.plan_key.toUpperCase()} WORKSPACE`
              : 'AGENCY WORKSPACE'}
          </span>
          <span>Invite expires {formatExpiry(invite.expires_at)}</span>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.secureBadge}>
            <LockKeyhole size={15} />
            Secure owner activation
          </div>

          {sessionEmail ? (
            sessionMatchesInvite ? (
              <>
                <p className={styles.eyebrow}>ACCOUNT FOUND</p>
                <h2>Continue as {inviteEmail}</h2>
                <p className={styles.copy}>
                  This signed-in account matches the invitation. Confirm to
                  become an owner of {brandName}.
                </p>
                {message ? (
                  <div className={styles.message}>{message}</div>
                ) : null}
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void completeExistingAccount()}
                  disabled={busy}
                >
                  {busy ? 'Activating...' : 'Activate owner access'}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <p className={styles.eyebrow}>WRONG ACCOUNT</p>
                <h2>Use the invited email.</h2>
                <p className={styles.copy}>
                  You are signed in as {sessionEmail}, but this invitation
                  belongs to {inviteEmail}.
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void signOutForInvite()}
                >
                  <LogOut size={16} />
                  Sign out and continue
                </button>
              </>
            )
          ) : mode === 'register' ? (
            <form onSubmit={register}>
              <p className={styles.eyebrow}>OWNER ACTIVATION</p>
              <h2>Set up your owner account.</h2>
              <p className={styles.copy}>
                This account controls the agency workspace. Use your real name
                and a strong private password.
              </p>

              <label className={styles.field}>
                <span>Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  placeholder="Your full name"
                  required
                />
              </label>

              <label className={styles.field}>
                <span>Email</span>
                <input value={inviteEmail} readOnly aria-readonly="true" />
              </label>

              <label className={styles.field}>
                <span>Password</span>
                <div className={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </label>

              <div className={styles.passwordRules}>
                {[
                  ['length', '12+ characters'],
                  ['upper', 'Uppercase'],
                  ['lower', 'Lowercase'],
                  ['number', 'Number'],
                  ['symbol', 'Symbol'],
                ].map(([key, label]) => (
                  <span
                    key={key}
                    className={
                      passwordChecks[
                        key as keyof typeof passwordChecks
                      ]
                        ? styles.ruleComplete
                        : ''
                    }
                  >
                    <Check size={11} />
                    {label}
                  </span>
                ))}
              </div>

              {message ? (
                <div className={styles.message}>{message}</div>
              ) : null}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={
                  busy ||
                  !passwordReady ||
                  fullName.trim().length < 2
                }
              >
                {busy
                  ? 'Creating owner account...'
                  : `Activate ${portalName}`}
                <ArrowRight size={17} />
              </button>

              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setMode('sign-in');
                  setMessage('');
                  setPassword('');
                }}
              >
                Already have an account? Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={signInAndAccept}>
              <p className={styles.eyebrow}>EXISTING ACCOUNT</p>
              <h2>Sign in to accept.</h2>
              <p className={styles.copy}>
                Sign in as {inviteEmail}. We attach this account to {brandName}
                only after the invitation is verified.
              </p>

              <label className={styles.field}>
                <span>Email</span>
                <input value={inviteEmail} readOnly aria-readonly="true" />
              </label>

              <label className={styles.field}>
                <span>Password</span>
                <div className={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Your password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </label>

              {message ? (
                <div className={styles.message}>{message}</div>
              ) : null}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={busy}
              >
                {busy ? 'Signing in...' : 'Sign in and activate'}
                <ArrowRight size={17} />
              </button>

              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setMode('register');
                  setMessage('');
                  setPassword('');
                }}
              >
                Create a new owner account instead
              </button>
            </form>
          )}

          <div className={styles.securityNote}>
            <ShieldCheck size={15} />
            <span>
              This invitation is time-limited and single-purpose. The secure
              token is not stored in readable form.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
