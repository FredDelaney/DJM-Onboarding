'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  ShieldCheck,
} from 'lucide-react';

import Brand from '@/components/Brand';
import {useTenantRuntime} from '@/components/TenantRuntimeProvider';
import {awaitOnboardingRequest,ONBOARDING_PLAYER_COLUMNS,onboardingSaveError} from '@/lib/player-onboarding';
import {
  localDateISO,
  supabase,
} from '@/lib/supabase';
import {
  validateOnboardingStep,
} from '@/lib/validation';

const steps = [
  'Check you',
  'Football now',
  'What matters next',
  'Proof & media',
];

export default function Onboarding() {
  const router = useRouter();
  const runtime = useTenantRuntime();
  const lifecycle = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);

  const [player, setPlayer] =
    useState<any>(null);
  const [priv, setPriv] =
    useState<any>({});
  const [step, setStep] =
    useState(0);
  const [busy, setBusy] =
    useState(false);
  const [video, setVideo] =
    useState('');
  const [loaded, setLoaded] =
    useState(false);
  const [error, setError] =
    useState('');
  const [complete, setComplete] =
    useState(false);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let userId = '';
    setLoaded(false);
    setPlayer(null);
    setPriv({});
    setVideo('');
    setStep(0);
    setError('');
    setLoadError('');
    setComplete(false);
    setNeedsReload(false);
    setBusy(false);
    saving.current = false;
    const {data: {subscription}} = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && userId && session?.user.id !== userId)) {
        controller.abort();
        setPlayer(null);
        router.replace('/sign-in');
      }
    });
    void (async () => {
      try {
        const auth = await awaitOnboardingRequest(supabase.auth.getUser(), controller.signal);
        if (auth.error) {
          if (auth.error.name === 'AuthSessionMissingError' || [401,403].includes(auth.error.status || 0)) {
            router.replace('/sign-in');
            return;
          }
          throw auth.error;
        }
        if (!auth.data.user) {
          router.replace('/sign-in');
          return;
        }
        userId = auth.data.user.id;
        let query = supabase.from('players').select(ONBOARDING_PLAYER_COLUMNS)
          .eq('user_id', userId).is('archived_at', null).neq('football_status', 'retired');
        if (runtime.tenant_id) query = query.eq('tenant_id', runtime.tenant_id);
        const records = await awaitOnboardingRequest(query.limit(2).abortSignal(controller.signal), controller.signal);
        if (records.error) throw records.error;
        if ((records.data || []).length > 1) {
          router.replace('/player-workspaces');
          return;
        }
        const currentPlayer = records.data?.[0];
        if (!currentPlayer) return;
        if (['submitted', 'verified', 'complete'].includes(currentPlayer.onboarding_status)) {
          router.replace('/home');
          return;
        }
        const [privateInfo, onboarding] = await awaitOnboardingRequest(Promise.all([
          supabase.from('player_private')
            .select('phone,whatsapp,residence_country,passports_held,work_rights,market_preferences,relocation_preferences,preferred_move_timing,salary_expectation,travel_availability,updated_at')
            .eq('player_id', currentPlayer.id).abortSignal(controller.signal).maybeSingle(),
          supabase.from('player_onboarding').select('current_step,draft,draft_state')
            .eq('player_id', currentPlayer.id).abortSignal(controller.signal).maybeSingle(),
        ]), controller.signal);
        if (privateInfo.error) throw privateInfo.error;
        if (onboarding.error) throw onboarding.error;
        if (controller.signal.aborted) return;
        setPlayer(currentPlayer);
        setPriv(privateInfo.data || {});
        const savedStep = Number(onboarding.data?.current_step || 1);
        setStep(Number.isFinite(savedStep) ? Math.min(3, Math.max(0, savedStep - 1)) : 0);
        const savedVideo = onboarding.data?.draft?.video_url ?? onboarding.data?.draft_state?.video_url;
        setVideo(typeof savedVideo === 'string' ? savedVideo : '');
      } catch {
        if (!controller.signal.aborted) {
          setLoadError('We couldn’t load your saved setup. Nothing has been changed. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => {
      controller.abort();
      subscription.unsubscribe();
    };
  }, [router, runtime.tenant_id, retry]);

  useEffect(() => {
    if (!complete) return;
    const timer = window.setTimeout(() => router.replace('/home'), 850);
    return () => window.clearTimeout(timer);
  }, [complete, router]);

  const patchPlayer = (
    key: string,
    value: any,
  ) => {
    setPlayer((current: any) => ({
      ...current,
      [key]: value,
    }));
    setError('');
  };

  const patchPriv = (
    key: string,
    value: any,
  ) => {
    setPriv((current: any) => ({
      ...current,
      [key]: value,
    }));
    setError('');
  };

  const save = async (
    nextStep: number,
    finishing = false,
  ) => {
    const controller = lifecycle.current;
    if (!player || !controller || controller.signal.aborted || saving.current || needsReload ||
        (runtime.tenant_id && player.tenant_id !== runtime.tenant_id)) return false;
    saving.current = true;

    setBusy(true);
    setError('');

    try {
      const playerPayload: any = {
        first_name:
          player.first_name?.trim() || null,
        last_name:
          player.last_name?.trim() || null,
        preferred_name:
          player.preferred_name?.trim() || null,
        date_of_birth:
          player.date_of_birth || null,

        nationalities: String(
          player.nationalitiesText ??
            (player.nationalities || []).join(', '),
        )
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean),

        height_cm: player.height_cm
          ? Number(player.height_cm)
          : null,
        preferred_foot:
          player.preferred_foot || null,
        primary_position:
          player.primary_position?.trim() || null,

        secondary_positions: String(
          player.secondaryText ??
            (player.secondary_positions || []).join(', '),
        )
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean),

        current_club:
          player.current_club?.trim() || null,
        current_league:
          player.current_league?.trim() || null,
        current_country:
          player.current_country?.trim() || null,
        contract_status:
          player.contract_status?.trim() || null,
        contract_expiry:
          player.contract_expiry || null,

        transfermarkt_url:
          player.transfermarkt_url?.trim() || null,
        wyscout_url:
          player.wyscout_url?.trim() || null,
        stats_url:
          player.stats_url?.trim() || null,
        instagram_url:
          player.instagram_url?.trim() || null,

      };

      const privatePayload: any = {
        phone:
          priv.phone?.trim() || null,
        whatsapp:
          priv.whatsapp?.trim() || null,
        residence_country:
          priv.residence_country?.trim() || null,

        passports_held: String(
          priv.passportsText ??
            (priv.passports_held || []).join(', '),
        )
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean),

        work_rights:
          priv.work_rights?.trim() || null,
        market_preferences:
          priv.market_preferences?.trim() || null,
        relocation_preferences:
          priv.relocation_preferences?.trim() || null,
        preferred_move_timing:
          priv.preferred_move_timing?.trim() || null,
        salary_expectation:
          priv.salary_expectation?.trim() || null,
        travel_availability:
          priv.travel_availability?.trim() || null,
      };

      const result = await awaitOnboardingRequest(supabase.rpc('player_save_onboarding', {
        p_player_id: player.id,
        p_tenant_id: player.tenant_id,
        p_profile: playerPayload,
        p_private: privatePayload,
        p_next_step: finishing ? 4 : nextStep + 1,
        p_video_url: video.trim() || null,
        p_finishing: finishing,
        p_expected_updated_at: player.updated_at,
        p_expected_private_updated_at: priv.updated_at || null,
      }).abortSignal(controller.signal), controller.signal);
      if (controller.signal.aborted) return false;
      if (result.error) throw result.error;
      if (!result.data?.saved || !result.data?.updated_at) throw new Error('onboarding_save_unconfirmed');
      setPlayer((current: any) => ({...current, updated_at: result.data.updated_at}));
      setPriv((current: any) => ({...current, updated_at: result.data.private_updated_at || null}));
      if (result.data.completed) setComplete(true);
      return true;
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(onboardingSaveError(caught));
        const message = caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : '';
        setNeedsReload(message.includes('onboarding_changed') || message.includes('onboarding_timeout'));
      }
      return false;
    } finally {
      if (lifecycle.current === controller && !controller.signal.aborted) {
        saving.current = false;
        setBusy(false);
      }
    }
  };

  const goNext = async () => {
    if (saving.current || needsReload) return;
    const validation =
      validateOnboardingStep(
        step,
        player,
        priv,
        video,
      );

    if (validation) {
      setError(validation);
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      return;
    }

    if (step === 3) {
      const saved = await save(
        3,
        true,
      );

      if (saved) {
        setComplete(true);

      }
      return;
    }

    const next = step + 1;
    const saved = await save(next);

    if (saved) {
      setStep(next);
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  const goBack = async () => {
    if (step === 0 || busy) return;

    const previous = step - 1;
    const saved = await save(previous);
    if (!saved) return;
    setStep(previous);
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!loaded) {
    return (
      <div className="center" role="status" aria-label="Loading your saved setup">
        <div className="loader" />
      </div>
    );
  }

  if (loadError) {
    return (
      <main className="center">
        <section className="card pad-lg narrow" aria-labelledby="onboarding-load-title">
          <h1 id="onboarding-load-title">Your setup couldn’t load.</h1>
          <p role="alert">{loadError}</p>
          <button type="button" className="btn btn-navy" onClick={() => setRetry(value => value + 1)}>Try again</button>
          <a className="btn btn-quiet" href="/sign-in">Back to sign in</a>
        </section>
      </main>
    );
  }

  if (!player) {
    return (
      <div className="center">
        <div className="card pad-lg">
          <h2>
            We couldn’t find your invited player record.
          </h2>
          <p className="muted">
            Contact your agency and we’ll fix the invitation.
          </p>
          <button type="button" className="btn btn-navy" onClick={() => setRetry(value => value + 1)}>Check again</button>
          <a className="btn btn-quiet" href="/player-workspaces">Choose a workspace</a>
          <a className="btn btn-quiet" href="/sign-in">Back to sign in</a>
        </div>
      </div>
    );
  }

  if (complete) {
    return (
      <main className="onboarding-complete-premium">
        <Brand light />
        <div className="onboarding-complete-mark">
          <Check size={29} />
        </div>
        <div className="section-kicker">
          PLAYER WORKSPACE
        </div>
        <h1>You’re in.</h1>
        <p>
          Your private career space is ready.
        </p>
      </main>
    );
  }

  const today = localDateISO();

  const intro = [
    {
      title:
        'We’ve already started your profile.',
      copy:
        'Check what your agency already knows. Correct anything that is wrong and add only what is missing.',
    },
    {
      title:
        'Check your football now.',
      copy:
        'Your current playing situation. If your agency has already filled something in, just confirm it looks right.',
    },
    {
      title:
        'Tell us what matters next.',
      copy:
        'This stays private. Skip anything you do not know or do not want to set yet.',
    },
    {
      title:
        'Add what we can’t create for you.',
      copy:
        'Useful source links and current footage help your agency verify your profile. They are optional.',
    },
  ][step];

  return (
    <main className="onboarding-premium-root">
      <div className="narrow onboarding-premium-topbar">
        <Brand />
        <span>
          Private player setup
        </span>
      </div>

      <div className="narrow onboarding-premium-body">
        {error && (
          <div
            className="check-alert"
            role="alert"
          >
            {error}
            {needsReload && <button type="button" className="btn btn-quiet" onClick={() => setRetry(value => value + 1)}>Reload saved details</button>}
          </div>
        )}

        <div className="onboarding-progress-premium">
          {steps.map((label, index) => (
            <div
              key={label}
              className={
                index <= step
                  ? 'active'
                  : ''
              }
            >
              <span />
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="onboarding-premium-intro">
          <div className="section-kicker">
            STEP {step + 1} OF 4
          </div>
          <h1>{intro.title}</h1>
          <p>{intro.copy}</p>
        </div>

        {step === 0 && (
          <section className="onboarding-review-card">
            <div className="onboarding-review-note">
              <ShieldCheck size={18} />
              <div>
                <strong>
                  Review, don’t rebuild.
                </strong>
                <span>
                  We have already created your agency player record. Most fields below are optional.
                </span>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label className="label" htmlFor="onboarding-field-1">
                  First name
                </label>
                <input id="onboarding-field-1"
                  className="input"
                  autoComplete="given-name"
                  value={
                    player.first_name || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'first_name',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-2">
                  Last name
                </label>
                <input id="onboarding-field-2"
                  className="input"
                  autoComplete="family-name"
                  value={
                    player.last_name || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'last_name',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-3">
                  Known as
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-3"
                  className="input"
                  value={
                    player.preferred_name || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'preferred_name',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-4">
                  Date of birth
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-4"
                  type="date"
                  max={today}
                  className="input"
                  value={
                    player.date_of_birth || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'date_of_birth',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-5">
                  Nationality / nationalities
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-5"
                  className="input"
                  value={
                    player.nationalitiesText ??
                    (
                      player.nationalities || []
                    ).join(', ')
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'nationalitiesText',
                      event.target.value,
                    )
                  }
                  placeholder="New Zealand, Ireland"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-6">
                  Passports held
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-6"
                  className="input"
                  value={
                    priv.passportsText ??
                    (
                      priv.passports_held || []
                    ).join(', ')
                  }
                  onChange={(event) =>
                    patchPriv(
                      'passportsText',
                      event.target.value,
                    )
                  }
                  placeholder="NZ, UK, Ireland"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-7">
                  Phone
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-7"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="input"
                  value={priv.phone || ''}
                  onChange={(event) =>
                    patchPriv(
                      'phone',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-8">
                  Country you live in
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-8"
                  className="input"
                  autoComplete="country-name"
                  value={
                    priv.residence_country || ''
                  }
                  onChange={(event) =>
                    patchPriv(
                      'residence_country',
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onboarding-review-card">
            <div className="grid2">
              <div className="field">
                <label className="label" htmlFor="onboarding-field-9">
                  Primary position
                </label>
                <input id="onboarding-field-9"
                  className="input"
                  value={
                    player.primary_position || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'primary_position',
                      event.target.value,
                    )
                  }
                  placeholder="Centre-back"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-10">
                  Other positions
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-10"
                  className="input"
                  value={
                    player.secondaryText ??
                    (
                      player.secondary_positions || []
                    ).join(', ')
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'secondaryText',
                      event.target.value,
                    )
                  }
                  placeholder="Right-back"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-11">
                  Preferred foot
                </label>
                <select id="onboarding-field-11"
                  className="select"
                  value={
                    player.preferred_foot || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'preferred_foot',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Choose
                  </option>
                  <option value="Right">
                    Right
                  </option>
                  <option value="Left">
                    Left
                  </option>
                  <option value="Both">
                    Both
                  </option>
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-12">
                  Height cm
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-12"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={140}
                  max={230}
                  value={
                    player.height_cm || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'height_cm',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-13">
                  Current club
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-13"
                  className="input"
                  value={
                    player.current_club || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'current_club',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-14">
                  League
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-14"
                  className="input"
                  value={
                    player.current_league || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'current_league',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-15">
                  Club country
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-15"
                  className="input"
                  value={
                    player.current_country || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'current_country',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-16">
                  Contract status
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-16"
                  className="input"
                  value={
                    player.contract_status || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'contract_status',
                      event.target.value,
                    )
                  }
                  placeholder="Under contract / Free agent"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-17">
                  Contract expiry
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-17"
                  className="input"
                  type="date"
                  value={
                    player.contract_expiry || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'contract_expiry',
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="onboarding-review-card">
            <div className="onboarding-private-banner">
              <ShieldCheck size={18} />
              <div>
                <strong>Private to your agency.</strong>
                <span>
                  These answers help your agents understand what makes sense for you. Clubs do not automatically see them.
                </span>
              </div>
            </div>

            <div className="stack onboarding-textarea-stack">
              <div className="field">
                <label className="label" htmlFor="onboarding-field-18">
                  Markets you would consider
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <textarea id="onboarding-field-18"
                  className="textarea"
                  value={
                    priv.market_preferences || ''
                  }
                  onChange={(event) =>
                    patchPriv(
                      'market_preferences',
                      event.target.value,
                    )
                  }
                  placeholder="Leagues, countries or regions that interest you"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-19">
                  Relocation preferences
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <textarea id="onboarding-field-19"
                  className="textarea"
                  value={
                    priv.relocation_preferences || ''
                  }
                  onChange={(event) =>
                    patchPriv(
                      'relocation_preferences',
                      event.target.value,
                    )
                  }
                  placeholder="Anything that matters for you or your family"
                />
              </div>

              <div className="grid2">
                <div className="field">
                  <label className="label" htmlFor="onboarding-field-20">
                    Move timing
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input id="onboarding-field-20"
                    className="input"
                    value={
                      priv.preferred_move_timing || ''
                    }
                    onChange={(event) =>
                      patchPriv(
                        'preferred_move_timing',
                        event.target.value,
                      )
                    }
                    placeholder="Now / January / Summer"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="onboarding-field-21">
                    Salary expectation
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input id="onboarding-field-21"
                    className="input"
                    value={
                      priv.salary_expectation || ''
                    }
                    onChange={(event) =>
                      patchPriv(
                        'salary_expectation',
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="onboarding-field-22">
                    Travel availability
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input id="onboarding-field-22"
                    className="input"
                    value={
                      priv.travel_availability || ''
                    }
                    onChange={(event) =>
                      patchPriv(
                        'travel_availability',
                        event.target.value,
                      )
                    }
                    placeholder="Available immediately"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="onboarding-field-23">
                    Work rights
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input id="onboarding-field-23"
                    className="input"
                    value={
                      priv.work_rights || ''
                    }
                    onChange={(event) =>
                      patchPriv(
                        'work_rights',
                        event.target.value,
                      )
                    }
                    placeholder="EU / UK / Australia etc."
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding-review-card">
            <div className="onboarding-source-intro">
              <Link2 size={19} />
              <div>
                <strong>
                  Only add what you have handy.
                </strong>
                <span>
                  Your agency can verify and improve your presentation after you join. You do not need every link to finish.
                </span>
              </div>
            </div>

            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="onboarding-field-24">
                  Transfermarkt
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-24"
                  className="input"
                  inputMode="url"
                  value={
                    player.transfermarkt_url || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'transfermarkt_url',
                      event.target.value,
                    )
                  }
                  placeholder="https://…"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-25">
                  Wyscout
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-25"
                  className="input"
                  inputMode="url"
                  value={
                    player.wyscout_url || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'wyscout_url',
                      event.target.value,
                    )
                  }
                  placeholder="https://…"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-26">
                  Other stats profile
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-26"
                  className="input"
                  inputMode="url"
                  value={
                    player.stats_url || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'stats_url',
                      event.target.value,
                    )
                  }
                  placeholder="FotMob, league profile, Soccerway…"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-27">
                  Instagram
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-27"
                  className="input"
                  inputMode="url"
                  value={
                    player.instagram_url || ''
                  }
                  onChange={(event) =>
                    patchPlayer(
                      'instagram_url',
                      event.target.value,
                    )
                  }
                  placeholder="https://…"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="onboarding-field-28">
                  Current highlight video
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input id="onboarding-field-28"
                  className="input"
                  inputMode="url"
                  value={video}
                  onChange={(event) =>
                    setVideo(event.target.value)
                  }
                  placeholder="YouTube, Vimeo, Google Drive…"
                />
              </div>
            </div>
          </section>
        )}

        <div className="onboarding-premium-actions">
          {step > 0 ? (
            <button
              className="btn btn-quiet"
              onClick={goBack}
              disabled={busy || needsReload}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <span />
          )}

          <button
            className="btn btn-navy"
            onClick={goNext}
            disabled={busy || needsReload}
          >
            {busy
              ? 'Saving…'
              : step === 3
                ? 'Finish setup'
                : 'Looks right'}
            {step === 3 ? (
              <Check size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>

        <p className="onboarding-skip-note">
          You can change anything later from Profile.
        </p>
      </div>
    </main>
  );
}