'use client';

import {
  useEffect,
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
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/sign-in');
        return;
      }

      const { data: players } =
        await supabase
          .from('players')
          .select('*')
          .eq('user_id', user.id)
          .limit(1);

      const currentPlayer =
        players?.[0];

      if (!currentPlayer) {
        setLoaded(true);
        return;
      }

      if (
        currentPlayer.onboarding_status ===
        'submitted'
      ) {
        router.replace('/home');
        return;
      }

      setPlayer(currentPlayer);

      const [
        { data: privateInfo },
        { data: onboarding },
      ] = await Promise.all([
        supabase
          .from('player_private')
          .select('*')
          .eq(
            'player_id',
            currentPlayer.id,
          )
          .maybeSingle(),

        supabase
          .from('player_onboarding')
          .select('*')
          .eq(
            'player_id',
            currentPlayer.id,
          )
          .maybeSingle(),
      ]);

      setPriv(privateInfo || {});

      if (onboarding?.current_step) {
        setStep(
          Math.min(
            3,
            Math.max(
              0,
              onboarding.current_step - 1,
            ),
          ),
        );
      }

      setLoaded(true);
    })();
  }, [router]);

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
    if (!player) return false;

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

        onboarding_status: finishing
          ? 'submitted'
          : 'in_progress',
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

      const onboardingPayload: any = {
        player_id: player.id,
        current_step: finishing
          ? 4
          : nextStep + 1,
        draft: {
          step: finishing
            ? 3
            : nextStep,
        },
      };

      if (finishing) {
        const now =
          new Date().toISOString();
        onboardingPayload.completed_at = now;
        onboardingPayload.submitted_at = now;
      }

      const results = await Promise.all([
        supabase
          .from('players')
          .update(playerPayload)
          .eq('id', player.id),

        supabase
          .from('player_private')
          .upsert({
            player_id: player.id,
            ...privatePayload,
          }),

        supabase
          .from('player_onboarding')
          .upsert(onboardingPayload),
      ]);

      const failed = results.find(
        (result: any) => result.error,
      );

      if (failed?.error) {
        throw failed.error;
      }

      if (finishing && video.trim()) {
        const cleanVideo = video.trim();

        const {
          data: existing,
          error: lookupError,
        } = await supabase
          .from('player_videos')
          .select('id')
          .eq('player_id', player.id)
          .eq('url', cleanVideo)
          .maybeSingle();

        if (lookupError) {
          throw lookupError;
        }

        if (!existing) {
          const { error: videoError } =
            await supabase
              .from('player_videos')
              .insert({
                player_id: player.id,
                title:
                  'Player highlight video',
                url: cleanVideo,
                video_type: 'highlight',
                featured: true,
              });

          if (videoError) {
            throw videoError;
          }
        }
      }

      return true;
    } catch (caught: any) {
      setError(
        caught?.message ||
          'We couldn’t save that. Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const goNext = async () => {
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
        setTimeout(() => {
          router.replace('/home');
        }, 850);
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
    await save(previous);
    setStep(previous);
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!loaded) {
    return (
      <div className="center">
        <div className="loader" />
      </div>
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
            Contact DJM and we’ll fix the invitation.
          </p>
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
          DJM PLAYER
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
        'Check what DJM already knows. Correct anything that is wrong and add only what is missing.',
    },
    {
      title:
        'Check your football now.',
      copy:
        'Your current playing situation. If DJM has already filled something in, just confirm it looks right.',
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
        'Useful source links and current footage help DJM verify your profile. They are optional.',
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
                  We have already created your DJM player record. Most fields below are optional.
                </span>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label className="label">
                  First name
                </label>
                <input
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
                <label className="label">
                  Last name
                </label>
                <input
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
                <label className="label">
                  Known as
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Date of birth
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Nationality / nationalities
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Passports held
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Phone
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Country you live in
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Primary position
                </label>
                <input
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
                <label className="label">
                  Other positions
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Preferred foot
                </label>
                <select
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
                <label className="label">
                  Height cm
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Current club
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  League
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Club country
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Contract status
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Contract expiry
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <strong>Private to DJM.</strong>
                <span>
                  These answers help your agents understand what makes sense for you. Clubs do not automatically see them.
                </span>
              </div>
            </div>

            <div className="stack onboarding-textarea-stack">
              <div className="field">
                <label className="label">
                  Markets you would consider
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <textarea
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
                <label className="label">
                  Relocation preferences
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <textarea
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
                  <label className="label">
                    Move timing
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input
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
                  <label className="label">
                    Salary expectation
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input
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
                  <label className="label">
                    Travel availability
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input
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
                  <label className="label">
                    Work rights
                    <span className="muted">
                      {' '}optional
                    </span>
                  </label>
                  <input
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
                  DJM can verify and improve your presentation after you join. You do not need every link to finish.
                </span>
              </div>
            </div>

            <div className="stack">
              <div className="field">
                <label className="label">
                  Transfermarkt
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Wyscout
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Other stats profile
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Instagram
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
                <label className="label">
                  Current highlight video
                  <span className="muted">
                    {' '}optional
                  </span>
                </label>
                <input
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
              disabled={busy}
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
            disabled={busy}
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
