'use client';

import {
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import { platformInvoke, friendlyError } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

import styles from './page.module.css';

type LaunchStep = {
  key: string;
  label: string;
  complete: boolean;
};

type LaunchData = {
  tenant_id: string;
  tenant_slug: string;
  stage?: string | null;
  plan_key?: string | null;
  branding: {
    display_name?: string | null;
    short_name?: string | null;
    portal_name?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    support_email?: string | null;
    website_url?: string | null;
    phone?: string | null;
    logo_asset?: string | null;
  };
  privacy?: {
    ready_for_player_invites?: boolean | null;
    profile?: {
      controllerName?: string | null;
      contactEmail?: string | null;
      noticeUrl?: string | null;
      noticeVersion?: string | null;
    } | null;
  } | null;
  activation?: {
    score?: number | null;
    first_value_ready?: boolean | null;
  } | null;
  owner_setup?: {
    complete?: boolean | null;
    next_step?: string | null;
    completed_count?: number | null;
    total_count?: number | null;
    steps?: LaunchStep[];
  } | null;
  platform_managed?: {
    workspace_address_ready?: boolean | null;
    workspace_hostname?: string | null;
    launch_ready?: boolean | null;
  } | null;
  players?: Array<{
    id: string;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    primary_position?: string | null;
    current_club?: string | null;
  }>;
};

const STEP_COPY: Record<
  string,
  { eyebrow: string; title: string; copy: string }
> = {
  branding: {
    eyebrow: 'YOUR IDENTITY',
    title: 'Make the workspace unmistakably yours.',
    copy: 'Confirm the agency name, player portal name and support details your players should see.',
  },
  privacy: {
    eyebrow: 'PLAYER PRIVACY',
    title: 'Connect your approved privacy notice.',
    copy: 'Provide the controller identity and current published notice used by your agency. The platform records what you provide; it does not draft or approve legal wording.',
  },
  first_player: {
    eyebrow: 'FIRST PLAYER',
    title: 'Start with one real player.',
    copy: 'Use a real represented player so the workspace proves value on genuine agency work from the start.',
  },
  first_relationship: {
    eyebrow: 'FIRST RELATIONSHIP',
    title: 'Add one club contact you actually know.',
    copy: 'A real relationship makes the next opportunity and follow-up workflow useful immediately.',
  },
  first_opportunity: {
    eyebrow: 'FIRST LIVE OPPORTUNITY',
    title: 'Capture something commercially real.',
    copy: 'Use a club requirement or live route you are already working on. This is the moment the workspace becomes operational.',
  },
  owner_setup_complete: {
    eyebrow: 'OWNER SETUP COMPLETE',
    title: 'Your workspace has real working value.',
    copy: 'Your identity, privacy foundation and first operating loop are in place. Progress remains evidence-led as your agency starts using the workspace.',
  },
};

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export default function AgencyLaunchPage() {
  const runtime = useTenantRuntime();
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [launch, setLaunch] = useState<LaunchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [brand, setBrand] = useState({
    displayName: runtime.branding.display_name || '',
    portalName: runtime.branding.portal_name || runtime.branding.display_name || '',
    primaryColor: runtime.branding.primary_color || '#111827',
    accentColor: runtime.branding.accent_color || '#64748B',
    supportEmail: runtime.branding.support_email || '',
    websiteUrl: runtime.branding.website_url || '',
    phone: runtime.branding.phone || '',
  });

  const [privacy, setPrivacy] = useState({
    controllerName: '',
    contactEmail: '',
    noticeUrl: '',
    noticeVersion: '',
  });

  const [player, setPlayer] = useState({
    firstName: '',
    lastName: '',
    position: '',
    club: '',
    country: '',
    transfermarktUrl: '',
  });

  const [relationship, setRelationship] = useState({
    contactName: '',
    clubName: '',
    role: '',
    country: '',
    notes: '',
  });

  const [opportunity, setOpportunity] = useState({
    playerId: '',
    clubName: '',
    country: '',
    summary: '',
    nextAction: '',
  });

  const loadLaunch = useCallback(async () => {
    if (!runtime.resolved || !runtime.slug) return;
    setLoading(true);
    setError('');
    try {
      const result = await platformInvoke<{ launch?: LaunchData }>('agency-launch', {
        action: 'get',
        tenant_slug: runtime.slug,
      });
      const next = result?.launch || null;
      setLaunch(next);
      if (next?.branding) {
        setBrand({
          displayName: String(next.branding.display_name || ''),
          portalName: String(next.branding.portal_name || next.branding.display_name || ''),
          primaryColor: String(next.branding.primary_color || '#111827'),
          accentColor: String(next.branding.accent_color || '#64748B'),
          supportEmail: String(next.branding.support_email || ''),
          websiteUrl: String(next.branding.website_url || ''),
          phone: String(next.branding.phone || ''),
        });
      }
      if (next?.privacy?.profile) {
        setPrivacy({
          controllerName: String(next.privacy.profile.controllerName || ''),
          contactEmail: String(next.privacy.profile.contactEmail || ''),
          noticeUrl: String(next.privacy.profile.noticeUrl || ''),
          noticeVersion: String(next.privacy.profile.noticeVersion || ''),
        });
      }
      if (!opportunity.playerId && next?.players?.[0]?.id) {
        setOpportunity((current) => ({
          ...current,
          playerId: String(next.players?.[0]?.id || ''),
        }));
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [opportunity.playerId, runtime.resolved, runtime.slug]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session?.user);
      setSignedIn(hasSession);
      setSessionReady(true);
      if (hasSession) void loadLaunch();
      else setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session?.user);
      setSignedIn(hasSession);
      setSessionReady(true);
      if (hasSession) void loadLaunch();
      else {
        setLaunch(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [loadLaunch]);

  const nextStep = String(
    launch?.owner_setup?.next_step || 'branding',
  );
  const stepCopy = STEP_COPY[nextStep] || STEP_COPY.branding;
  const completed = Number(launch?.owner_setup?.completed_count || 0);
  const total = Number(launch?.owner_setup?.total_count || 5);
  const progress = Math.max(0, Math.min(100, (completed / Math.max(total, 1)) * 100));

  const theme = {
    '--launch-primary':
      launch?.branding?.primary_color || runtime.branding.primary_color,
    '--launch-accent':
      launch?.branding?.accent_color || runtime.branding.accent_color,
  } as CSSProperties;

  const workspaceName =
    launch?.branding?.display_name ||
    runtime.branding.display_name ||
    'Agency workspace';

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy('sign-in');
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) throw authError;
    } catch (authError) {
      setError(friendlyError(authError));
    } finally {
      setBusy('');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setLaunch(null);
    setPassword('');
  };

  const invokeLaunch = async (
    action: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    if (busy || !launch) return;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const result = await platformInvoke<{ launch?: LaunchData }>('agency-launch', {
        action,
        tenant_slug: runtime.slug,
        ...body,
      });
      if (result?.launch) setLaunch(result.launch);
      setNotice(success);
      await loadLaunch();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy('');
    }
  };

  const saveBrand = async (event: FormEvent) => {
    event.preventDefault();
    await invokeLaunch(
      'update_branding',
      {
        display_name: brand.displayName,
        portal_name: brand.portalName,
        primary_color: brand.primaryColor,
        accent_color: brand.accentColor,
        support_email: brand.supportEmail,
        website_url: brand.websiteUrl || null,
        phone: brand.phone || null,
      },
      'Workspace identity saved.',
    );
  };

  const savePrivacy = async (event: FormEvent) => {
    event.preventDefault();
    if (!launch || busy) return;
    setBusy('privacy');
    setError('');
    setNotice('');
    try {
      await platformInvoke('agency-privacy', {
        action: 'update',
        tenant_id: launch.tenant_id,
        controller_name: privacy.controllerName,
        privacy_contact_email: privacy.contactEmail || null,
        privacy_notice_url: privacy.noticeUrl,
        notice_version: privacy.noticeVersion,
      });
      setNotice('Privacy profile saved.');
      await loadLaunch();
    } catch (privacyError) {
      const message = friendlyError(privacyError);
      setError(
        message.includes('privacy_notice_version_conflict')
          ? 'That notice version is already locked to different details. Use a new version when the legal notice changes.'
          : message,
      );
    } finally {
      setBusy('');
    }
  };

  const savePlayer = async (event: FormEvent) => {
    event.preventDefault();
    await invokeLaunch(
      'create_first_player',
      {
        first_name: player.firstName,
        last_name: player.lastName,
        primary_position: player.position,
        current_club: player.club || null,
        current_country: player.country || null,
        transfermarkt_url: player.transfermarktUrl || null,
      },
      'First player added.',
    );
  };

  const saveRelationship = async (event: FormEvent) => {
    event.preventDefault();
    await invokeLaunch(
      'create_first_relationship',
      {
        contact_name: relationship.contactName,
        club_name: relationship.clubName,
        contact_role: relationship.role || null,
        country: relationship.country || null,
        notes: relationship.notes || null,
      },
      'First club relationship added.',
    );
  };

  const saveOpportunity = async (event: FormEvent) => {
    event.preventDefault();
    await invokeLaunch(
      'create_first_opportunity',
      {
        player_id: opportunity.playerId,
        club_name: opportunity.clubName,
        country: opportunity.country || null,
        summary: opportunity.summary || null,
        next_action: opportunity.nextAction || null,
      },
      'First live opportunity captured.',
    );
  };

  const activeForm = useMemo(() => {
    if (!launch) return null;

    if (nextStep === 'branding') {
      return (
        <form className={styles.form} onSubmit={saveBrand}>
          <div className={styles.grid}>
            <Field label="Agency name">
              <input
                value={brand.displayName}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, displayName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Player portal name">
              <input
                value={brand.portalName}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, portalName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Support email">
              <input
                type="email"
                value={brand.supportEmail}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, supportEmail: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Website">
              <input
                value={brand.websiteUrl}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, websiteUrl: event.target.value }))
                }
                placeholder="https://agency.com"
              />
            </Field>
            <Field label="Primary colour">
              <input
                className={styles.colourInput}
                type="color"
                value={brand.primaryColor}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, primaryColor: event.target.value }))
                }
              />
            </Field>
            <Field label="Accent colour">
              <input
                className={styles.colourInput}
                type="color"
                value={brand.accentColor}
                onChange={(event) =>
                  setBrand((current) => ({ ...current, accentColor: event.target.value }))
                }
              />
            </Field>
          </div>
          <Primary busy={busy === 'update_branding'} label="Save workspace identity" />
        </form>
      );
    }

    if (nextStep === 'privacy') {
      return (
        <form className={styles.form} onSubmit={savePrivacy}>
          <div className={styles.grid}>
            <Field label="Data controller">
              <input
                value={privacy.controllerName}
                onChange={(event) =>
                  setPrivacy((current) => ({ ...current, controllerName: event.target.value }))
                }
                placeholder="Your agency legal/controller name"
                required
              />
            </Field>
            <Field label="Privacy contact">
              <input
                type="email"
                value={privacy.contactEmail}
                onChange={(event) =>
                  setPrivacy((current) => ({ ...current, contactEmail: event.target.value }))
                }
                placeholder="privacy@agency.com"
              />
            </Field>
            <Field label="Published privacy notice" wide>
              <input
                value={privacy.noticeUrl}
                onChange={(event) =>
                  setPrivacy((current) => ({ ...current, noticeUrl: event.target.value }))
                }
                placeholder="https://agency.com/privacy"
                required
              />
            </Field>
            <Field label="Notice version">
              <input
                value={privacy.noticeVersion}
                onChange={(event) =>
                  setPrivacy((current) => ({ ...current, noticeVersion: event.target.value }))
                }
                placeholder="2026-09 or v1"
                required
              />
            </Field>
          </div>
          <div className={styles.boundary}>
            <ShieldCheck size={15} />
            <span>
              Use the notice approved by your agency. This workspace records the
              supplied controller and notice version; it does not provide legal approval.
            </span>
          </div>
          <Primary busy={busy === 'privacy'} label="Save privacy profile" />
        </form>
      );
    }

    if (nextStep === 'first_player') {
      return (
        <form className={styles.form} onSubmit={savePlayer}>
          <div className={styles.grid}>
            <Field label="First name">
              <input
                value={player.firstName}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, firstName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Last name">
              <input
                value={player.lastName}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, lastName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Primary position">
              <input
                value={player.position}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, position: event.target.value }))
                }
                placeholder="RW, CB, CM..."
                required
              />
            </Field>
            <Field label="Current club">
              <input
                value={player.club}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, club: event.target.value }))
                }
              />
            </Field>
            <Field label="Current country">
              <input
                value={player.country}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, country: event.target.value }))
                }
              />
            </Field>
            <Field label="Transfermarkt profile">
              <input
                value={player.transfermarktUrl}
                onChange={(event) =>
                  setPlayer((current) => ({ ...current, transfermarktUrl: event.target.value }))
                }
                placeholder="Optional source link"
              />
            </Field>
          </div>
          <Primary busy={busy === 'create_first_player'} label="Add first player" />
        </form>
      );
    }

    if (nextStep === 'first_relationship') {
      return (
        <form className={styles.form} onSubmit={saveRelationship}>
          <div className={styles.grid}>
            <Field label="Club contact">
              <input
                value={relationship.contactName}
                onChange={(event) =>
                  setRelationship((current) => ({
                    ...current,
                    contactName: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label="Club">
              <input
                value={relationship.clubName}
                onChange={(event) =>
                  setRelationship((current) => ({ ...current, clubName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Role">
              <input
                value={relationship.role}
                onChange={(event) =>
                  setRelationship((current) => ({ ...current, role: event.target.value }))
                }
                placeholder="Sporting Director"
              />
            </Field>
            <Field label="Country">
              <input
                value={relationship.country}
                onChange={(event) =>
                  setRelationship((current) => ({ ...current, country: event.target.value }))
                }
              />
            </Field>
            <Field label="Relationship context" wide>
              <textarea
                value={relationship.notes}
                onChange={(event) =>
                  setRelationship((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
                placeholder="How you know them or the most useful context."
              />
            </Field>
          </div>
          <Primary
            busy={busy === 'create_first_relationship'}
            label="Add first relationship"
          />
        </form>
      );
    }

    if (nextStep === 'first_opportunity') {
      return (
        <form className={styles.form} onSubmit={saveOpportunity}>
          <div className={styles.grid}>
            <Field label="Player context">
              <select
                value={opportunity.playerId}
                onChange={(event) =>
                  setOpportunity((current) => ({ ...current, playerId: event.target.value }))
                }
                required
              >
                <option value="">Choose player</option>
                {(launch.players || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Club">
              <input
                value={opportunity.clubName}
                onChange={(event) =>
                  setOpportunity((current) => ({ ...current, clubName: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Country">
              <input
                value={opportunity.country}
                onChange={(event) =>
                  setOpportunity((current) => ({ ...current, country: event.target.value }))
                }
              />
            </Field>
            <Field label="Next action">
              <input
                value={opportunity.nextAction}
                onChange={(event) =>
                  setOpportunity((current) => ({ ...current, nextAction: event.target.value }))
                }
                placeholder="Call, pitch, send profile..."
              />
            </Field>
            <Field label="What is live?" wide>
              <textarea
                value={opportunity.summary}
                onChange={(event) =>
                  setOpportunity((current) => ({ ...current, summary: event.target.value }))
                }
                rows={4}
                placeholder="What is the club looking for, and why is this worth tracking?"
              />
            </Field>
          </div>
          <Primary
            busy={busy === 'create_first_opportunity'}
            label="Capture live opportunity"
          />
        </form>
      );
    }

    return (
      <div className={styles.completePanel}>
        <CheckCircle2 size={28} />
        <div>
          <strong>Owner setup complete</strong>
          <p>
            Your workspace now contains the minimum real operating loop: agency
            identity, privacy foundation, player, club relationship and live opportunity.
          </p>
        </div>
      </div>
    );
  }, [
    brand,
    busy,
    launch,
    nextStep,
    opportunity,
    player,
    privacy,
    relationship,
  ]);

  if (!runtime.resolved) return null;

  if (!sessionReady || loading) {
    return (
      <main className={styles.loading} style={theme}>
        <LoaderCircle size={22} className={styles.spin} />
        <strong>Opening your agency workspace</strong>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className={styles.authPage} style={theme}>
        <section className={styles.authBrand}>
          <div className={styles.mark}>
            {initials(runtime.branding.display_name) || 'A'}
          </div>
          <span>{runtime.branding.display_name}</span>
        </section>
        <form className={styles.authCard} onSubmit={signIn}>
          <div className={styles.lock}>
            <LockKeyhole size={17} />
          </div>
          <p className={styles.eyebrow}>OWNER WORKSPACE</p>
          <h1>Continue your agency setup.</h1>
          <p>Sign in with the owner account connected to this workspace.</p>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {error ? <div className={styles.error}>{error}</div> : null}
          <Primary busy={busy === 'sign-in'} label="Open owner workspace" />
        </form>
      </main>
    );
  }

  if (!launch) {
    return (
      <main className={styles.authPage} style={theme}>
        <section className={styles.authCard}>
          <ShieldCheck size={24} />
          <h1>Owner access is not available here.</h1>
          <p>{error || 'This signed-in account is not an active owner of this workspace.'}</p>
          <button type="button" className={styles.secondaryButton} onClick={() => void signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} style={theme}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <div className={styles.mark}>{initials(workspaceName) || 'A'}</div>
          <div>
            <strong>{workspaceName}</strong>
            <span>{launch.branding.portal_name || 'Owner workspace'}</span>
          </div>
        </div>
        <button type="button" className={styles.signOut} onClick={() => void signOut()}>
          <LogOut size={14} />
          Sign out
        </button>
      </header>

      <div className={styles.shell}>
        <aside className={styles.rail}>
          <div className={styles.progressHeader}>
            <p className={styles.eyebrow}>OWNER LAUNCH</p>
            <strong>{completed}/{total} ready</strong>
          </div>
          <div className={styles.progressTrack}>
            <i style={{ width: `${progress}%` }} />
          </div>

          <div className={styles.steps}>
            {(launch.owner_setup?.steps || []).map((step, index) => (
              <div
                key={step.key}
                className={`${styles.step} ${step.complete ? styles.stepComplete : ''} ${
                  step.key === nextStep ? styles.stepCurrent : ''
                }`}
              >
                <span>{step.complete ? <Check size={12} /> : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>
                    {step.complete
                      ? 'Evidence saved'
                      : step.key === nextStep
                        ? 'Do this next'
                        : 'Comes next'}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.platformState}>
            <Sparkles size={15} />
            <div>
              <strong>Workspace address</strong>
              <span>
                {launch.platform_managed?.workspace_address_ready
                  ? launch.platform_managed.workspace_hostname
                  : 'Being connected by the platform team'}
              </span>
            </div>
          </div>
        </aside>

        <section className={styles.main}>
          <div className={styles.hero}>
            <p className={styles.eyebrow}>{stepCopy.eyebrow}</p>
            <h1>{stepCopy.title}</h1>
            <p>{stepCopy.copy}</p>
          </div>

          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          <section className={styles.workCard}>{activeForm}</section>

          {launch.activation?.first_value_ready ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => window.location.assign('/agency')}
            >
              <ArrowRight size={15} />
              Open operating workspace
            </button>
          ) : null}

          <div className={styles.valueStrip}>
            <div>
              <span>Working value</span>
              <strong>
                {launch.activation?.first_value_ready ? 'Reached' : 'Building'}
              </strong>
            </div>
            <div>
              <span>Launch readiness</span>
              <strong>
                {launch.platform_managed?.launch_ready ? 'Ready' : 'In progress'}
              </strong>
            </div>
            <div>
              <span>Plan</span>
              <strong>{String(launch.plan_key || 'Agency').toUpperCase()}</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.wide : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Primary({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" className={styles.primaryButton} disabled={busy}>
      {busy ? <LoaderCircle size={15} className={styles.spin} /> : <ArrowRight size={15} />}
      {busy ? 'Saving...' : label}
    </button>
  );
}
