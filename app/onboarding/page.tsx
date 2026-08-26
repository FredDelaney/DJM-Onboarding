'use client';

import { useEffect, useState } from 'react';
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
import { validateOnboardingStep } from '@/lib/validation';

const steps = [
  'You',
  'Football now',
  'What you want',
  'Proof & media',
  'Done',
];

export default function Onboarding() {
  const router = useRouter();

  const [player, setPlayer] = useState<any>(null);
  const [priv, setPriv] = useState<any>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/sign-in');
        return;
      }

      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('user_id', user.id)
        .limit(1);

      const currentPlayer = players?.[0];

      if (!currentPlayer) {
        setLoaded(true);
        return;
      }

      setPlayer(currentPlayer);

      const [{ data: privateInfo }, { data: onboarding }] =
        await Promise.all([
          supabase
            .from('player_private')
            .select('*')
            .eq('player_id', currentPlayer.id)
            .maybeSingle(),

          supabase
            .from('player_onboarding')
            .select('*')
            .eq('player_id', currentPlayer.id)
            .maybeSingle(),
        ]);

      setPriv(privateInfo || {});

      if (onboarding?.current_step) {
        setStep(
          Math.min(
            3,
            Math.max(0, onboarding.current_step - 1),
          ),
        );
      }

      setLoaded(true);
    })();
  }, [router]);

  const patchPlayer = (key: string, value: any) => {
    setPlayer((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const patchPriv = (key: string, value: any) => {
    setPriv((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const save = async (next?: number) => {
    if (!player) {
      return false;
    }

    setBusy(true);
    setError('');

    try {
      const playerPayload: any = {
        first_name: player.first_name?.trim() || null,
        last_name: player.last_name?.trim() || null,
        preferred_name: player.preferred_name?.trim() || null,
        date_of_birth: player.date_of_birth || null,

        nationalities: String(
          player.nationalitiesText ??
            (player.nationalities || []).join(', '),
        )
          .split(',')
          .map((value: string) => value.trim())
          .filter(Boolean),

        height_cm: player.height_cm
          ? Number(player.height_cm)
          : null,

        preferred_foot: player.preferred_foot || null,
        primary_position:
          player.primary_position?.trim() || null,

        secondary_positions: String(
          player.secondaryText ??
            (player.secondary_positions || []).join(', '),
        )
          .split(',')
          .map((value: string) => value.trim())
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

        onboarding_status:
          next === 4 ? 'submitted' : 'in_progress',
      };

      const privatePayload: any = {
        phone: priv.phone?.trim() || null,
        whatsapp: priv.whatsapp?.trim() || null,

        residence_country:
          priv.residence_country?.trim() || null,

        passports_held: String(
          priv.passportsText ??
            (priv.passports_held || []).join(', '),
        )
          .split(',')
          .map((value: string) => value.trim())
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
        current_step: (next ?? step) + 1,
        draft: {
          step: next ?? step,
        },
      };

      if (next === 4) {
        const now = new Date().toISOString();

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

      if (step === 3 && video.trim()) {
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
          const { error: videoError } = await supabase
            .from('player_videos')
            .insert({
              player_id: player.id,
              title: 'Player highlight video',
              url: cleanVideo,
              video_type: 'highlight',
              featured: true,
            });

          if (videoError) {
            throw videoError;
          }
        }
      }

      if (next !== undefined) {
        setStep(next);
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

  const go = async (next: number) => {
    const validation = validateOnboardingStep(
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

    const saved = await save(next);

    if (saved && next === 4) {
      setTimeout(() => {
        router.replace('/home');
      }, 500);
    }
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

const today = localDateISO();

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#fff',
      }}
    >
      <div className="narrow topbar">
        <Brand />
      </div>

      <div
        className="narrow"
        style={{
          padding: '22px 0 80px',
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: 14,
             background: '#fff9dd',
color: '#5b5100',
              fontSize: 14,
              fontWeight: 650,
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="row"
          style={{
            gap: 6,
            marginBottom: 34,
          }}
        >
          {steps.map((label, index) => (
            <div
              key={label}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 99,
                background:
                  index <= step
                    ? 'var(--navy)'
                    : '#e8e9eb',
              }}
            />
          ))}
        </div>

        {step < 4 && (
          <>
            <div className="caps muted">
              STEP {step + 1} OF 4
            </div>

            <h1 className="page-title">
              {step === 0
                ? 'Start with you.'
                : step === 1
                  ? 'Where are you now?'
                  : step === 2
                    ? 'What do you want next?'
                    : 'Give DJM the proof.'}
            </h1>

            <p
              className="page-intro"
              style={{
                marginBottom: 32,
              }}
            >
              {step === 0
                ? 'Just the basics. You can refine anything later.'
                : step === 1
                  ? 'Your current football situation, nothing complicated.'
                  : step === 2
                    ? 'This stays private and helps DJM target realistic opportunities.'
                    : 'Source links and footage help DJM verify and present you properly.'}
            </p>
          </>
        )}

        {step === 0 && (
          <div className="card pad-lg">
            <div className="grid2">
              <div className="field">
                <label className="label">
                  First name
                </label>

                <input
                  className="input"
                  autoComplete="given-name"
                  value={player.first_name || ''}
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
                  value={player.last_name || ''}
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
                </label>

                <input
                  className="input"
                  value={player.preferred_name || ''}
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
                </label>

                <input
                  type="date"
                  max={today}
                  className="input"
                  value={player.date_of_birth || ''}
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
                </label>

                <input
                  className="input"
                  value={
                    player.nationalitiesText ??
                    (player.nationalities || []).join(
                      ', ',
                    )
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
                </label>

                <input
                  className="input"
                  value={
                    priv.passportsText ??
                    (priv.passports_held || []).join(
                      ', ',
                    )
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
          </div>
        )}

        {step === 1 && (
          <div className="card pad-lg">
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
                />
              </div>

              <div className="field">
                <label className="label">
                  Other positions
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
                    Select
                  </option>

                  <option>
                    Right
                  </option>

                  <option>
                    Left
                  </option>

                  <option>
                    Both
                  </option>
                </select>
              </div>

              <div className="field">
                <label className="label">
                  Height (cm)
                </label>

                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={140}
                  max={230}
                  step={1}
                  value={player.height_cm || ''}
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
                  League / competition
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
                  Current country
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
                  placeholder="Under contract / free agent"
                />
              </div>

              <div className="field">
                <label className="label">
                  Contract expiry
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
          </div>
        )}

        {step === 2 && (
          <div className="card pad-lg">
            <div className="field">
              <label className="label">
                Markets / countries you would
                seriously consider
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
                placeholder="Where would you genuinely move?"
              />
            </div>

            <div
              className="field"
              style={{
                marginTop: 16,
              }}
            >
              <label className="label">
                Ideal move timing
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
                placeholder="Now / January / summer"
              />
            </div>

            <div
              className="field"
              style={{
                marginTop: 16,
              }}
            >
              <label className="label">
                Work rights / visas
              </label>

              <input
                className="input"
                value={priv.work_rights || ''}
                onChange={(event) =>
                  patchPriv(
                    'work_rights',
                    event.target.value,
                  )
                }
                placeholder="EU, UK, US visa…"
              />
            </div>

            <div
              className="field"
              style={{
                marginTop: 16,
              }}
            >
              <label className="label">
                Any relocation constraints?
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
                placeholder="Optional"
              />
            </div>

            <div
              className="field"
              style={{
                marginTop: 16,
              }}
            >
              <label className="label">
                Salary expectation
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
                placeholder="Optional and private to DJM"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card pad-lg">
            <div className="row">
              <Link2 size={20} />
              <strong>
                Source profiles
              </strong>
            </div>

            <div
              className="stack"
              style={{
                marginTop: 20,
              }}
            >
              <div className="field">
                <label className="label">
                  Transfermarkt
                </label>

                <input
                  type="url"
                  inputMode="url"
                  className="input"
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
                </label>

                <input
                  type="url"
                  inputMode="url"
                  className="input"
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
                  Stats profile
                </label>

                <input
                  type="url"
                  inputMode="url"
                  className="input"
                  value={player.stats_url || ''}
                  onChange={(event) =>
                    patchPlayer(
                      'stats_url',
                      event.target.value,
                    )
                  }
                  placeholder="https://…"
                />
              </div>

              <div className="field">
                <label className="label">
                  Best highlight / match video
                </label>

                <input
                  type="url"
                  inputMode="url"
                  className="input"
                  value={video}
                  onChange={(event) =>
                    setVideo(event.target.value)
                  }
                  placeholder="YouTube, Vimeo, Wyscout…"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div
            style={{
              textAlign: 'center',
              padding: '50px 0',
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: '#e9f7ef',
                color: '#18794e',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Check size={30} />
            </div>

            <h1 className="page-title">
              You’re in.
            </h1>

            <p
              className="page-intro"
              style={{
                margin: '0 auto',
                maxWidth: 520,
              }}
            >
              Your DJM career space is ready. Keep
              it current, check in each week and
              use your Inbox whenever DJM needs
              something from you.
            </p>

            <div
              className="card pad"
              style={{
                margin: '28px auto 0',
                maxWidth: 480,
                textAlign: 'left',
              }}
            >
              <div className="row">
                <ShieldCheck size={19} />
                <strong>
                  Remember
                </strong>
              </div>

              <p
                className="small muted"
                style={{
                  lineHeight: 1.55,
                  marginBottom: 0,
                }}
              >
                Private information stays between
                you and DJM. Your club-facing
                profile is a separate, reviewed
                version.
              </p>
            </div>
          </div>
        )}

        <div
          className="row-between"
          style={{
            marginTop: 26,
          }}
        >
          {step > 0 && step < 4 ? (
            <button
              className="btn btn-quiet"
              onClick={() => {
                setError('');
                setStep(step - 1);
              }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              className="btn btn-navy"
              onClick={() => go(step + 1)}
              disabled={busy}
            >
              {busy
                ? 'Saving…'
                : 'Continue'}

              <ArrowRight size={16} />
            </button>
          ) : step === 3 ? (
            <button
              className="btn btn-navy"
              onClick={() => go(4)}
              disabled={busy}
            >
              {busy
                ? 'Saving…'
                : 'Finish setup'}

              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="btn btn-navy"
              onClick={() =>
                router.replace('/home')
              }
            >
              Open DJM Player
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
