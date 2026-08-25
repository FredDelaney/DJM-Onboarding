'use client';

import {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  LockKeyhole,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Video,
  X,
} from 'lucide-react';

import {
  LoadingScreen,
  PlayerShell,
  usePlayerContext,
} from '@/components/PlayerShell';

import AppExperience from '@/components/AppExperience';

import {
  publicFile,
  supabase,
} from '@/lib/supabase';

import {
  isFutureDate,
  isHttpUrl,
} from '@/lib/validation';

type Editor =
  | 'football'
  | 'career'
  | 'media'
  | 'sources'
  | null;

const txt = (value: any) =>
  value ?? '';

const arr = (value: any) =>
  Array.isArray(value)
    ? value.join(', ')
    : '';

const present = (value: any) =>
  !!String(value || '').trim();

const shortList = (
  value: any,
  fallback: string,
) => {
  if (
    Array.isArray(value) &&
    value.length
  ) {
    return value
      .filter(Boolean)
      .join(' · ');
  }

  return present(value)
    ? String(value)
    : fallback;
};

export default function Profile() {
  const ctx = usePlayerContext();

  const [p, setP] =
    useState<any>({});

  const [pr, setPr] =
    useState<any>({});

  const [videos, setVideos] =
    useState<any[]>([]);

  const [videoUrl, setVideoUrl] =
    useState('');

  const [documentCount, setDocumentCount] =
    useState(0);

  const [editor, setEditor] =
    useState<Editor>(null);

  const [busy, setBusy] =
    useState(false);

  const [dirty, setDirty] =
    useState(false);

  const [toast, setToast] =
    useState('');

  const [error, setError] =
    useState('');

  useEffect(() => {
    if (!ctx.player) {
      return;
    }

    setP({
      ...ctx.player,
    });

    setDirty(false);

    Promise.all([
      supabase
        .from('player_videos')
        .select('*')
        .eq('player_id', ctx.player.id)
        .order('featured', {
          ascending: false,
        })
        .order('sort_order'),

      supabase
        .from('player_documents')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('player_id', ctx.player.id),
    ]).then(
      ([videosResult, docsResult]) => {
        setVideos(
          videosResult.data || [],
        );

        setDocumentCount(
          docsResult.count || 0,
        );
      },
    );
  }, [ctx.player?.id]);

  useEffect(() => {
    if (!ctx.privateInfo) {
      return;
    }

    setPr({
      ...ctx.privateInfo,
    });
  }, [
    ctx.privateInfo?.updated_at,
    ctx.privateInfo?.player_id,
  ]);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.location.hash === '#media'
    ) {
      setEditor('media');
    }
  }, []);

  if (ctx.loading) {
    return <LoadingScreen />;
  }

  if (!ctx.player) {
    return null;
  }

  const updatePlayer = (
    patch: Record<string, any>,
  ) => {
    setP((current: any) => ({
      ...current,
      ...patch,
    }));

    setDirty(true);
    setError('');
  };

  const updatePrivate = (
    patch: Record<string, any>,
  ) => {
    setPr((current: any) => ({
      ...current,
      ...patch,
    }));

    setDirty(true);
    setError('');
  };

  const flash = (message: string) => {
    setToast(message);

    setTimeout(
      () => setToast(''),
      1700,
    );
  };

  const validate = () => {
    if (
      p.date_of_birth &&
      isFutureDate(p.date_of_birth)
    ) {
      return 'Date of birth cannot be in the future.';
    }

    if (
      p.height_cm !== null &&
      p.height_cm !== undefined &&
      String(p.height_cm).trim()
    ) {
      const height =
        Number(p.height_cm);

      if (
        !Number.isFinite(height) ||
        height < 140 ||
        height > 230
      ) {
        return 'Height must be between 140 cm and 230 cm.';
      }
    }

    if (
      pr.phone &&
      String(pr.phone)
        .replace(/\D/g, '')
        .length < 6
    ) {
      return 'Check the phone number. It looks too short.';
    }

    const urls = [
      ['Transfermarkt', p.transfermarkt_url],
      ['Wyscout', p.wyscout_url],
      ['Stats profile', p.stats_url],
      ['Instagram', p.instagram_url],
    ] as const;

    const bad = urls.find(
      ([, value]) =>
        value?.trim() &&
        !isHttpUrl(value),
    );

    if (bad) {
      return `${bad[0]} must be a valid http or https link.`;
    }

    return '';
  };

  const save = async (
    closeAfter = true,
  ) => {
    const validationError =
      validate();

    if (validationError) {
      setError(validationError);
      return false;
    }

    setBusy(true);
    setError('');

    const playerPatch: any = {
      first_name:
        p.first_name || null,

      last_name:
        p.last_name || null,

      preferred_name:
        p.preferred_name || null,

      date_of_birth:
        p.date_of_birth || null,

      nationalities:
        String(
          p.nationalitiesInput ??
            arr(p.nationalities),
        )
          .split(',')
          .map((item: string) =>
            item.trim(),
          )
          .filter(Boolean),

      height_cm:
        p.height_cm
          ? Number(p.height_cm)
          : null,

      preferred_foot:
        p.preferred_foot || null,

      primary_position:
        p.primary_position || null,

      secondary_positions:
        String(
          p.secondaryInput ??
            arr(
              p.secondary_positions,
            ),
        )
          .split(',')
          .map((item: string) =>
            item.trim(),
          )
          .filter(Boolean),

      current_club:
        p.current_club || null,

      current_league:
        p.current_league || null,

      current_country:
        p.current_country || null,

      contract_status:
        p.contract_status || null,

      contract_expiry:
        p.contract_expiry || null,

      transfermarkt_url:
        p.transfermarkt_url || null,

      wyscout_url:
        p.wyscout_url || null,

      stats_url:
        p.stats_url || null,

      instagram_url:
        p.instagram_url || null,
    };

    const privatePatch: any = {
      phone:
        pr.phone || null,

      personal_email:
        pr.personal_email || null,

      whatsapp:
        pr.whatsapp || null,

      residence_country:
        pr.residence_country || null,

      passports_held:
        String(
          pr.passportsInput ??
            arr(pr.passports_held),
        )
          .split(',')
          .map((item: string) =>
            item.trim(),
          )
          .filter(Boolean),

      work_rights:
        pr.work_rights || null,

      market_preferences:
        pr.market_preferences || null,

      relocation_preferences:
        pr.relocation_preferences || null,

      preferred_move_timing:
        pr.preferred_move_timing || null,

      salary_expectation:
        pr.salary_expectation || null,

      travel_availability:
        pr.travel_availability || null,
    };

    const results =
      await Promise.all([
        supabase
          .from('players')
          .update(playerPatch)
          .eq('id', ctx.player.id),

        supabase
          .from('player_private')
          .upsert({
            player_id:
              ctx.player.id,
            ...privatePatch,
          }),
      ]);

    const failed =
      results.find(
        (result: any) =>
          result.error,
      );

    if (failed?.error) {
      setError(
        'We couldn’t save your changes. Please try again.',
      );

      setBusy(false);
      return false;
    }

    await ctx.refresh();

    setDirty(false);
    setBusy(false);

    if (closeAfter) {
      setEditor(null);
    }

    flash('Saved');
    return true;
  };

  const addVideo = async () => {
    const url =
      videoUrl.trim();

    if (!url) {
      return;
    }

    if (!isHttpUrl(url)) {
      setError(
        'Video must be a valid http or https link.',
      );
      return;
    }

    setBusy(true);
    setError('');

    const {
      data,
      error: addError,
    } = await supabase
      .from('player_videos')
      .insert({
        player_id:
          ctx.player.id,

        title:
          'Player video',

        url,

        video_type:
          'highlight',

        featured:
          videos.length === 0,

        sort_order:
          videos.length,
      })
      .select('*')
      .single();

    if (addError) {
      setError(
        'We couldn’t add that video.',
      );
      setBusy(false);
      return;
    }

    setVideos((current) => [
      ...current,
      data,
    ]);

    setVideoUrl('');
    setBusy(false);
    flash('Video added');
  };

  const removeVideo = async (
    videoId: string,
  ) => {
    setBusy(true);
    setError('');

    const {
      error: removeError,
    } = await supabase
      .from('player_videos')
      .delete()
      .eq('id', videoId);

    if (removeError) {
      setError(
        'We couldn’t remove that video.',
      );
      setBusy(false);
      return;
    }

    setVideos((current) =>
      current.filter(
        (video) =>
          video.id !== videoId,
      ),
    );

    setBusy(false);
    flash('Video removed');
  };

  const uploadPhoto = async (
    event: any,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy(true);
    setError('');

    const ext =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase() || 'jpg';

    const path =
      `${ctx.user.id}/profile-${Date.now()}.${ext}`;

    const {
      error: uploadError,
    } = await supabase
      .storage
      .from('player-public')
      .upload(
        path,
        file,
        {
          upsert: true,
        },
      );

    if (uploadError) {
      setError(
        'We couldn’t upload that photo.',
      );
      setBusy(false);
      return;
    }

    const {
      error: attachError,
    } = await supabase
      .from('players')
      .update({
        profile_photo_path:
          path,
      })
      .eq(
        'id',
        ctx.player.id,
      );

    if (attachError) {
      setError(
        'The photo uploaded but could not be attached to your profile.',
      );
      setBusy(false);
      return;
    }

    await ctx.refresh();

    setBusy(false);
    flash('Photo updated');
  };

  const closeEditor = () => {
    if (busy) {
      return;
    }

    if (dirty) {
      setError(
        'You have unsaved changes. Save them or choose Discard.',
      );
      return;
    }

    setEditor(null);
    setError('');
  };

  const discardChanges = () => {
    if (busy) {
      return;
    }

    setP({
      ...ctx.player,
    });

    setPr({
      ...ctx.privateInfo,
    });

    setDirty(false);
    setError('');
    setEditor(null);
  };

  const photo =
    publicFile(
      'player-public',
      p.profile_photo_path ||
        ctx.player.profile_photo_path,
    );

  const displayName =
    p.preferred_name ||
    p.first_name ||
    'Player';

  const footballSummary =
    [
      p.primary_position,
      p.current_club,
      p.current_country,
    ]
      .filter(Boolean)
      .join(' · ') ||
    'Add your football details';

  const careerSummary =
    [
      pr.preferred_move_timing,
      pr.market_preferences,
    ]
      .filter(Boolean)
      .join(' · ') ||
    'Add your move preferences';

  const sourceCount =
    [
      p.transfermarkt_url,
      p.wyscout_url,
      p.stats_url,
      p.instagram_url,
    ].filter(Boolean).length;

  const completionChecks = [
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.nationalitiesInput ||
      (Array.isArray(p.nationalities)
        ? p.nationalities.length
        : p.nationalities),
    p.primary_position,
    p.preferred_foot,
    p.current_club ||
      p.contract_status,
    p.profile_photo_path,
    pr.phone ||
      pr.whatsapp,
    pr.passportsInput ||
      (Array.isArray(pr.passports_held)
        ? pr.passports_held.length
        : pr.passports_held),
    videos.length,
    sourceCount,
  ];

  const completion = Math.round(
    (
      completionChecks.filter(Boolean)
        .length /
      completionChecks.length
    ) * 100,
  );

  return (
    <PlayerShell
      inboxCount={
        ctx.openRequests.length
      }
    >
      <main className="container player-shell profile-21">
        <header className="profile-21-head">
          <div>
            <div className="section-kicker">
              MY PROFILE
            </div>

            <h1 className="page-title">
              Your career record.
            </h1>

            <p className="page-intro">
              Keep it accurate once. DJM uses the same information when opportunities move quickly.
            </p>
          </div>

          <label className="profile-21-photo">
            {photo ? (
              <img
                src={photo}
                alt=""
              />
            ) : (
              <Camera size={25} />
            )}

            <span>
              <Camera size={13} />
            </span>

            <input
              type="file"
              accept="image/*"
              hidden
              onChange={uploadPhoto}
            />
          </label>
        </header>

        <section className="profile-21-status">
          <div className="profile-21-status-main">
            <div>
              <strong>
                {displayName}
              </strong>

              <span>
                {footballSummary}
              </span>
            </div>

            <span className="profile-21-percent">
              {completion}%
            </span>
          </div>

          <div className="profile-21-progress">
            <span
              style={{
                width: `${completion}%`,
              }}
            />
          </div>

          <div className="profile-21-status-foot">
            <span>
              {p.verification_status ===
              'verified'
                ? 'Reviewed by DJM'
                : p.verification_status ===
                    'reviewing'
                  ? 'DJM review required'
                  : 'Keep your record current'}
            </span>

            <Link href="/cv">
              View dossier
              <ArrowRight size={13} />
            </Link>
          </div>
        </section>

        <section className="profile-21-list">
          <ProfileRow
            icon={<UserRound size={19} />}
            title="Football"
            summary={footballSummary}
            meta={shortList(
              p.nationalitiesInput ??
                p.nationalities,
              'Nationality not added',
            )}
            onClick={() =>
              setEditor('football')
            }
          />

          <ProfileRow
            icon={<ShieldCheck size={19} />}
            title="Career & move preferences"
            summary={careerSummary}
            meta={
              pr.salary_expectation
                ? 'Private to DJM · financial expectations saved'
                : 'Private to DJM'
            }
            onClick={() =>
              setEditor('career')
            }
          />

          <div id="media">
            <ProfileRow
              icon={<Video size={19} />}
              title="Media"
              summary={
                videos.length
                  ? `${videos.length} video${videos.length === 1 ? '' : 's'} saved`
                  : 'Add current player footage'
              }
              meta={
                videos.some(
                  (video) =>
                    video.featured,
                )
                  ? 'Featured footage available to DJM'
                  : 'DJM chooses what clubs see'
              }
              onClick={() =>
                setEditor('media')
              }
            />
          </div>

          <ProfileRow
            icon={<Link2 size={19} />}
            title="Sources"
            summary={
              sourceCount
                ? `${sourceCount} linked profile${sourceCount === 1 ? '' : 's'}`
                : 'Add trusted football profiles'
            }
            meta="Transfermarkt · Wyscout · statistics · Instagram"
            onClick={() =>
              setEditor('sources')
            }
          />

          <Link
            href="/documents"
            className="profile-21-row"
          >
            <div className="profile-21-row-icon">
              <FileText size={19} />
            </div>

            <div className="profile-21-row-copy">
              <strong>
                Documents
              </strong>

              <span>
                {documentCount
                  ? `${documentCount} secure file${documentCount === 1 ? '' : 's'}`
                  : 'Passport, agreements and private files'}
              </span>

              <small>
                Private storage controlled by DJM
              </small>
            </div>

            <ChevronRight size={17} />
          </Link>
        </section>

        <section className="profile-21-private">
          <LockKeyhole size={18} />

          <div>
            <strong>
              Private by default
            </strong>

            <span>
              Salary expectations, passports, personal contact details and move preferences are not automatically shown to clubs.
            </span>
          </div>
        </section>

        <div className="profile-21-experience">
          <AppExperience
            userId={ctx.user.id}
          />
        </div>

        {editor && (
          <div
            className="profile-editor-backdrop"
            onClick={closeEditor}
          >
            <section
              className="profile-editor-sheet"
              onClick={(event) =>
                event.stopPropagation()
              }
              aria-label="Edit profile"
            >
              <div className="profile-editor-handle" />

              <header className="profile-editor-head">
                <div>
                  <div className="section-kicker">
                    MY PROFILE
                  </div>

                  <h2>
                    {editor === 'football'
                      ? 'Football'
                      : editor === 'career'
                        ? 'Career preferences'
                        : editor === 'media'
                          ? 'Media'
                          : 'Sources'}
                  </h2>
                </div>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={closeEditor}
                  disabled={busy}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="profile-editor-body">
                {editor ===
                  'football' && (
                  <FootballEditor
                    p={p}
                    update={
                      updatePlayer
                    }
                  />
                )}

                {editor ===
                  'career' && (
                  <CareerEditor
                    pr={pr}
                    update={
                      updatePrivate
                    }
                  />
                )}

                {editor ===
                  'media' && (
                  <MediaEditor
                    videos={videos}
                    videoUrl={videoUrl}
                    setVideoUrl={
                      setVideoUrl
                    }
                    addVideo={addVideo}
                    removeVideo={
                      removeVideo
                    }
                    busy={busy}
                  />
                )}

                {editor ===
                  'sources' && (
                  <SourcesEditor
                    p={p}
                    update={
                      updatePlayer
                    }
                  />
                )}

                {error && (
                  <div
                    className="profile-editor-message"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
              </div>

              {editor !== 'media' &&
                dirty && (
                <footer className="profile-editor-actions">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={discardChanges}
                    disabled={busy}
                  >
                    Discard
                  </button>

                  <button
                    type="button"
                    className="btn btn-navy"
                    onClick={() =>
                      save(true)
                    }
                    disabled={busy}
                  >
                    <Check size={15} />

                    {busy
                      ? 'Saving…'
                      : 'Save changes'}
                  </button>
                </footer>
              )}
            </section>
          </div>
        )}

        {toast && (
          <div className="toast">
            {toast}
          </div>
        )}
      </main>
    </PlayerShell>
  );
}

function ProfileRow({
  icon,
  title,
  summary,
  meta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="profile-21-row"
      onClick={onClick}
    >
      <div className="profile-21-row-icon">
        {icon}
      </div>

      <div className="profile-21-row-copy">
        <strong>{title}</strong>
        <span>{summary}</span>
        <small>{meta}</small>
      </div>

      <ChevronRight size={17} />
    </button>
  );
}

function FootballEditor({
  p,
  update,
}: {
  p: any;
  update: (
    patch: Record<string, any>,
  ) => void;
}) {
  return (
    <div className="profile-editor-stack">
      <div className="profile-editor-section">
        <div className="section-kicker">
          IDENTITY
        </div>

        <div className="grid2">
          <Field
            label="First name"
            value={txt(p.first_name)}
            onChange={(value) =>
              update({
                first_name: value,
              })
            }
          />

          <Field
            label="Last name"
            value={txt(p.last_name)}
            onChange={(value) =>
              update({
                last_name: value,
              })
            }
          />

          <Field
            label="Known as"
            value={txt(
              p.preferred_name,
            )}
            onChange={(value) =>
              update({
                preferred_name:
                  value,
              })
            }
          />

          <Field
            label="Date of birth"
            type="date"
            value={txt(
              p.date_of_birth,
            )}
            onChange={(value) =>
              update({
                date_of_birth:
                  value,
              })
            }
          />

          <Field
            label="Nationality / nationalities"
            value={
              p.nationalitiesInput ??
              arr(p.nationalities)
            }
            onChange={(value) =>
              update({
                nationalitiesInput:
                  value,
              })
            }
            placeholder="New Zealand, Ireland"
          />

          <Field
            label="Height (cm)"
            inputMode="numeric"
            value={txt(p.height_cm)}
            onChange={(value) =>
              update({
                height_cm: value,
              })
            }
          />
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          PLAYING PROFILE
        </div>

        <div className="grid2">
          <div className="field">
            <label className="label">
              Preferred foot
            </label>

            <select
              className="select"
              value={txt(
                p.preferred_foot,
              )}
              onChange={(event) =>
                update({
                  preferred_foot:
                    event.target.value,
                })
              }
            >
              <option value="">
                Select
              </option>
              <option>Right</option>
              <option>Left</option>
              <option>Both</option>
            </select>
          </div>

          <Field
            label="Primary position"
            value={txt(
              p.primary_position,
            )}
            onChange={(value) =>
              update({
                primary_position:
                  value,
              })
            }
            placeholder="Centre-back"
          />

          <Field
            label="Other positions"
            value={
              p.secondaryInput ??
              arr(
                p.secondary_positions,
              )
            }
            onChange={(value) =>
              update({
                secondaryInput:
                  value,
              })
            }
            placeholder="RB, DM"
          />
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          CURRENT SITUATION
        </div>

        <div className="grid2">
          <Field
            label="Current club"
            value={txt(
              p.current_club,
            )}
            onChange={(value) =>
              update({
                current_club:
                  value,
              })
            }
          />

          <Field
            label="League"
            value={txt(
              p.current_league,
            )}
            onChange={(value) =>
              update({
                current_league:
                  value,
              })
            }
          />

          <Field
            label="Country"
            value={txt(
              p.current_country,
            )}
            onChange={(value) =>
              update({
                current_country:
                  value,
              })
            }
          />

          <Field
            label="Contract status"
            value={txt(
              p.contract_status,
            )}
            onChange={(value) =>
              update({
                contract_status:
                  value,
              })
            }
            placeholder="Under contract / Free agent"
          />

          <Field
            label="Contract expiry"
            type="date"
            value={txt(
              p.contract_expiry,
            )}
            onChange={(value) =>
              update({
                contract_expiry:
                  value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function CareerEditor({
  pr,
  update,
}: {
  pr: any;
  update: (
    patch: Record<string, any>,
  ) => void;
}) {
  return (
    <div className="profile-editor-stack">
      <div className="profile-editor-private-note">
        <LockKeyhole size={17} />

        <div>
          <strong>
            Private to you and DJM
          </strong>

          <span>
            These details help DJM qualify the right opportunities. They are not automatically included in your club dossier.
          </span>
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          CONTACT
        </div>

        <div className="grid2">
          <Field
            label="Email"
            value={txt(
              pr.personal_email,
            )}
            onChange={(value) =>
              update({
                personal_email:
                  value,
              })
            }
          />

          <Field
            label="Phone"
            value={txt(pr.phone)}
            onChange={(value) =>
              update({
                phone: value,
              })
            }
          />

          <Field
            label="WhatsApp"
            value={txt(
              pr.whatsapp,
            )}
            onChange={(value) =>
              update({
                whatsapp: value,
              })
            }
          />

          <Field
            label="Country of residence"
            value={txt(
              pr.residence_country,
            )}
            onChange={(value) =>
              update({
                residence_country:
                  value,
              })
            }
          />
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          MOBILITY
        </div>

        <div className="grid2">
          <Field
            label="Passports held"
            value={
              pr.passportsInput ??
              arr(pr.passports_held)
            }
            onChange={(value) =>
              update({
                passportsInput:
                  value,
              })
            }
            placeholder="NZ, UK, Ireland"
          />

          <Field
            label="Work rights / visas"
            value={txt(
              pr.work_rights,
            )}
            onChange={(value) =>
              update({
                work_rights:
                  value,
              })
            }
            placeholder="EU / UK / other"
          />

          <Field
            label="Ideal move timing"
            value={txt(
              pr.preferred_move_timing,
            )}
            onChange={(value) =>
              update({
                preferred_move_timing:
                  value,
              })
            }
            placeholder="Now / January / summer"
          />

          <Field
            label="Travel availability"
            value={txt(
              pr.travel_availability,
            )}
            onChange={(value) =>
              update({
                travel_availability:
                  value,
              })
            }
            placeholder="Available / notice needed"
          />
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          OPPORTUNITY FIT
        </div>

        <div className="field">
          <label className="label">
            Markets / countries you would seriously consider
          </label>

          <textarea
            className="textarea"
            value={txt(
              pr.market_preferences,
            )}
            onChange={(event) =>
              update({
                market_preferences:
                  event.target.value,
              })
            }
            placeholder="Be realistic. This helps DJM target the right opportunities."
          />
        </div>

        <div className="field">
          <label className="label">
            Relocation preferences or constraints
          </label>

          <textarea
            className="textarea"
            value={txt(
              pr.relocation_preferences,
            )}
            onChange={(event) =>
              update({
                relocation_preferences:
                  event.target.value,
              })
            }
          />
        </div>

        <Field
          label="Salary expectation"
          value={txt(
            pr.salary_expectation,
          )}
          onChange={(value) =>
            update({
              salary_expectation:
                value,
            })
          }
          placeholder="Private to DJM"
        />
      </div>
    </div>
  );
}

function MediaEditor({
  videos,
  videoUrl,
  setVideoUrl,
  addVideo,
  removeVideo,
  busy,
}: {
  videos: any[];
  videoUrl: string;
  setVideoUrl: (
    value: string,
  ) => void;
  addVideo: () => void;
  removeVideo: (
    id: string,
  ) => void;
  busy: boolean;
}) {
  return (
    <div className="profile-editor-stack">
      <div className="profile-editor-section profile-media-add">
        <div className="section-kicker">
          ADD FOOTAGE
        </div>

        <p>
          Add a current highlight or match link. DJM decides which footage belongs in the club-facing dossier.
        </p>

        <div className="profile-media-add-row">
          <input
            className="input"
            value={videoUrl}
            onChange={(event) =>
              setVideoUrl(
                event.target.value,
              )
            }
            placeholder="YouTube, Vimeo, Wyscout…"
          />

          <button
            type="button"
            className="btn btn-navy"
            disabled={
              busy ||
              !videoUrl.trim()
            }
            onClick={addVideo}
          >
            <Plus size={15} />
            Add
          </button>
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="section-kicker">
          SAVED FOOTAGE
        </div>

        {videos.length ? (
          <div className="profile-media-list">
            {videos.map((video) => (
              <div
                className="profile-media-row"
                key={video.id}
              >
                <div className="profile-media-icon">
                  <Play size={16} />
                </div>

                <div className="profile-media-copy">
                  <strong>
                    {video.title ||
                      'Player video'}
                  </strong>

                  <span>
                    {video.video_type ===
                    'full_match'
                      ? 'Full match'
                      : 'Highlight / clip'}
                    {video.featured
                      ? ' · Featured'
                      : ''}
                  </span>
                </div>

                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-btn"
                  aria-label="Open video"
                >
                  <ExternalLink size={15} />
                </a>

                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove video"
                  onClick={() =>
                    removeVideo(
                      video.id,
                    )
                  }
                  disabled={busy}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-media-empty">
            <Play size={18} />
            <strong>
              No footage saved yet.
            </strong>
            <span>
              Add your best current footage so DJM can find it instantly.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesEditor({
  p,
  update,
}: {
  p: any;
  update: (
    patch: Record<string, any>,
  ) => void;
}) {
  return (
    <div className="profile-editor-stack">
      <div className="profile-editor-source-note">
        <ShieldCheck size={17} />

        <div>
          <strong>
            Links, not imports
          </strong>

          <span>
            External profiles give DJM a verification trail. Your dossier statistics are reviewed separately by DJM.
          </span>
        </div>
      </div>

      <div className="profile-editor-section">
        <div className="stack">
          <SourceField
            label="Transfermarkt"
            value={txt(
              p.transfermarkt_url,
            )}
            onChange={(value) =>
              update({
                transfermarkt_url:
                  value,
              })
            }
          />

          <SourceField
            label="Wyscout"
            value={txt(
              p.wyscout_url,
            )}
            onChange={(value) =>
              update({
                wyscout_url:
                  value,
              })
            }
          />

          <SourceField
            label="Statistics profile"
            value={txt(p.stats_url)}
            onChange={(value) =>
              update({
                stats_url: value,
              })
            }
          />

          <SourceField
            label="Instagram"
            value={txt(
              p.instagram_url,
            )}
            onChange={(value) =>
              update({
                instagram_url:
                  value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
}: {
  label: string;
  value: any;
  onChange: (
    value: string,
  ) => void;
  type?: string;
  placeholder?: string;
  inputMode?: any;
}) {
  return (
    <div className="field">
      <label className="label">
        {label}
      </label>

      <input
        className="input"
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder={placeholder}
      />
    </div>
  );
}

function SourceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
}) {
  return (
    <div className="field">
      <div className="profile-source-label">
        <label className="label">
          {label}
        </label>

        {value &&
          isHttpUrl(value) && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
          >
            Open
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      <input
        className="input"
        type="url"
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder="https://…"
      />
    </div>
  );
}
