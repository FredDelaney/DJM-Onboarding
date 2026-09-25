'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  ContactRound,
  Plus,
  Target,
  UserPlus,
  X,
} from 'lucide-react';

import {
  useTenantRuntime,
} from '@/components/TenantRuntimeProvider';
import {
  friendlyError,
  platformInvoke,
} from '@/lib/platform-client';

type Mode =
  | 'need'
  | 'contact'
  | 'player';

type ClubOption = {
  organisation_id: string;
  name: string;
  country?: string | null;
};

export default function QuickCapture() {
  const runtime = useTenantRuntime();

  const tenantId =
    runtime.tenant_id || '';

  const [open, setOpen] =
    useState(false);

  const [mode, setMode] =
    useState<Mode>('need');

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [clubs, setClubs] =
    useState<ClubOption[]>([]);

  const [clubName, setClubName] =
    useState('');

  const [needPosition, setNeedPosition] =
    useState('');

  const [needTitle, setNeedTitle] =
    useState('');

  const [needNotes, setNeedNotes] =
    useState('');

  const [contactName, setContactName] =
    useState('');

  const [contactRole, setContactRole] =
    useState('');

  const [contactNotes, setContactNotes] =
    useState('');

  const [firstName, setFirstName] =
    useState('');

  const [lastName, setLastName] =
    useState('');

  const [
    playerPosition,
    setPlayerPosition,
  ] = useState('');

  const [
    playerClub,
    setPlayerClub,
  ] = useState('');

  const [
    playerCountry,
    setPlayerCountry,
  ] = useState('');

  useEffect(() => {
    if (
      !open ||
      !tenantId ||
      clubs.length
    ) {
      return;
    }

    void platformInvoke<any>(
      'agency-os',
      {
        action: 'create_options',
        tenant_id: tenantId,
      },
    )
      .then((result) => {
        setClubs(
          result?.options?.clubs ||
            [],
        );
      })
      .catch(() => {
        setClubs([]);
      });
  }, [
    open,
    tenantId,
    clubs.length,
  ]);

  const reset = () => {
    setMessage('');
    setError('');
    setClubName('');
    setNeedPosition('');
    setNeedTitle('');
    setNeedNotes('');
    setContactName('');
    setContactRole('');
    setContactNotes('');
    setFirstName('');
    setLastName('');
    setPlayerPosition('');
    setPlayerClub('');
    setPlayerCountry('');
  };

  const close = () => {
    reset();
    setOpen(false);
    setMode('need');
  };

  const selectedClub =
    clubs.find(
      (club) =>
        club.name === clubName,
    ) || null;

  const createNeed = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !tenantId ||
      !clubName.trim() ||
      !needPosition.trim() ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await platformInvoke(
        'agency-os',
        {
          action:
            'create_club_need',
          tenant_id: tenantId,
          club_name:
            clubName.trim(),
          country:
            selectedClub?.country ||
            null,
          position:
            needPosition.trim(),
          title:
            needTitle.trim() ||
            null,
          notes:
            needNotes.trim() ||
            null,
        },
      );

      setMessage(
        'Club need created in this agency workspace.',
      );

      setNeedPosition('');
      setNeedTitle('');
      setNeedNotes('');
    } catch (createError) {
      setError(
        friendlyError(createError),
      );
    } finally {
      setBusy(false);
    }
  };

  const createContact = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !tenantId ||
      !contactName.trim() ||
      !clubName.trim() ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await platformInvoke(
        'agency-os',
        {
          action: 'create_contact',
          tenant_id: tenantId,
          contact_name:
            contactName.trim(),
          club_name:
            clubName.trim(),
          contact_role:
            contactRole.trim() ||
            null,
          country:
            selectedClub?.country ||
            null,
          notes:
            contactNotes.trim() ||
            null,
        },
      );

      setMessage(
        'Contact created in this agency workspace.',
      );

      setContactName('');
      setContactRole('');
      setContactNotes('');
    } catch (createError) {
      setError(
        friendlyError(createError),
      );
    } finally {
      setBusy(false);
    }
  };

  const createPlayer = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !tenantId ||
      !firstName.trim() ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await platformInvoke(
        'agency-os',
        {
          action: 'create_player',
          tenant_id: tenantId,
          first_name:
            firstName.trim(),
          last_name:
            lastName.trim() ||
            null,
          primary_position:
            playerPosition.trim() ||
            null,
          current_club:
            playerClub.trim() ||
            null,
          current_country:
            playerCountry.trim() ||
            null,
        },
      );

      setMessage(
        'Player record created in this agency workspace.',
      );

      setFirstName('');
      setLastName('');
      setPlayerPosition('');
      setPlayerClub('');
      setPlayerCountry('');
    } catch (createError) {
      setError(
        friendlyError(createError),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="djm-os-capture-trigger"
        onClick={() =>
          setOpen(true)
        }
        aria-label="Add to ReDream"
      >
        <Plus size={16} />
        <span>Add</span>
      </button>

      {open ? (
        <div
          className="djm-os-search-overlay"
          onMouseDown={close}
        >
          <div
            className="djm-os-capture-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="djm-os-capture-head">
              <div>
                <strong>
                  Add to ReDream
                </strong>
                <p>
                  Create structured
                  agency records. Use
                  ReDream AI for messages,
                  notes, screenshots and
                  voice capture.
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            <div className="djm-os-capture-body">
              <div
                className="djm-os-button-row"
                style={{
                  flexWrap: 'wrap',
                }}
              >
                <ModeButton
                  active={
                    mode === 'need'
                  }
                  onClick={() => {
                    setMode('need');
                    setMessage('');
                    setError('');
                  }}
                  icon={
                    <Target
                      size={15}
                    />
                  }
                  label="Club need"
                />

                <ModeButton
                  active={
                    mode === 'contact'
                  }
                  onClick={() => {
                    setMode(
                      'contact',
                    );
                    setMessage('');
                    setError('');
                  }}
                  icon={
                    <ContactRound
                      size={15}
                    />
                  }
                  label="Contact"
                />

                <ModeButton
                  active={
                    mode === 'player'
                  }
                  onClick={() => {
                    setMode('player');
                    setMessage('');
                    setError('');
                  }}
                  icon={
                    <UserPlus
                      size={15}
                    />
                  }
                  label="Player"
                />
              </div>

              {mode === 'need' ? (
                <form
                  className="djm-os-form"
                  onSubmit={
                    createNeed
                  }
                >
                  <label>
                    Club
                    <input
                      list="redream-clubs"
                      autoFocus
                      required
                      value={
                        clubName
                      }
                      onChange={(
                        event,
                      ) =>
                        setClubName(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Club name"
                    />
                  </label>

                  <div className="djm-os-form-grid">
                    <label>
                      Position
                      <input
                        required
                        value={
                          needPosition
                        }
                        onChange={(
                          event,
                        ) =>
                          setNeedPosition(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="e.g. left-footed CB"
                      />
                    </label>

                    <label>
                      Title
                      <input
                        value={
                          needTitle
                        }
                        onChange={(
                          event,
                        ) =>
                          setNeedTitle(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Optional short title"
                      />
                    </label>
                  </div>

                  <label>
                    Notes
                    <textarea
                      rows={4}
                      value={
                        needNotes
                      }
                      onChange={(
                        event,
                      ) =>
                        setNeedNotes(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="Budget, age, style, registration or other known constraints"
                    />
                  </label>

                  <button
                    className="djm-os-primary-button"
                    type="submit"
                    disabled={busy}
                  >
                    <Target
                      size={15}
                    />
                    {busy
                      ? 'Creating...'
                      : 'Create club need'}
                  </button>
                </form>
              ) : null}

              {mode ===
              'contact' ? (
                <form
                  className="djm-os-form"
                  onSubmit={
                    createContact
                  }
                >
                  <label>
                    Contact name
                    <input
                      autoFocus
                      required
                      value={
                        contactName
                      }
                      onChange={(
                        event,
                      ) =>
                        setContactName(
                          event
                            .target
                            .value,
                        )
                      }
                    />
                  </label>

                  <div className="djm-os-form-grid">
                    <label>
                      Club
                      <input
                        list="redream-clubs"
                        required
                        value={
                          clubName
                        }
                        onChange={(
                          event,
                        ) =>
                          setClubName(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Club name"
                      />
                    </label>

                    <label>
                      Role
                      <input
                        value={
                          contactRole
                        }
                        onChange={(
                          event,
                        ) =>
                          setContactRole(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Sporting Director, Head Coach..."
                      />
                    </label>
                  </div>

                  <label>
                    Notes
                    <textarea
                      rows={4}
                      value={
                        contactNotes
                      }
                      onChange={(
                        event,
                      ) =>
                        setContactNotes(
                          event
                            .target
                            .value,
                        )
                      }
                    />
                  </label>

                  <button
                    className="djm-os-primary-button"
                    type="submit"
                    disabled={busy}
                  >
                    <ContactRound
                      size={15}
                    />
                    {busy
                      ? 'Creating...'
                      : 'Create contact'}
                  </button>
                </form>
              ) : null}

              {mode ===
              'player' ? (
                <form
                  className="djm-os-form"
                  onSubmit={
                    createPlayer
                  }
                >
                  <div className="djm-os-form-grid">
                    <label>
                      First name
                      <input
                        autoFocus
                        required
                        value={
                          firstName
                        }
                        onChange={(
                          event,
                        ) =>
                          setFirstName(
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Last name
                      <input
                        value={
                          lastName
                        }
                        onChange={(
                          event,
                        ) =>
                          setLastName(
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Position
                      <input
                        value={
                          playerPosition
                        }
                        onChange={(
                          event,
                        ) =>
                          setPlayerPosition(
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Current club
                      <input
                        value={
                          playerClub
                        }
                        onChange={(
                          event,
                        ) =>
                          setPlayerClub(
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Country
                      <input
                        value={
                          playerCountry
                        }
                        onChange={(
                          event,
                        ) =>
                          setPlayerCountry(
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      lineHeight: 1.5,
                    }}
                  >
                    This creates a player
                    record inside the
                    current agency only.
                  </p>

                  <button
                    className="djm-os-primary-button"
                    type="submit"
                    disabled={busy}
                  >
                    <UserPlus
                      size={15}
                    />
                    {busy
                      ? 'Creating...'
                      : 'Create player'}
                  </button>
                </form>
              ) : null}

              <datalist id="redream-clubs">
                {clubs.map(
                  (club) => (
                    <option
                      key={
                        club.organisation_id
                      }
                      value={
                        club.name
                      }
                    />
                  ),
                )}
              </datalist>

              {error ? (
                <div className="djm-os-capture-status">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="djm-os-capture-status">
                  {message}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? 'djm-os-primary-button'
          : 'djm-os-secondary-button'
      }
      onClick={onClick}
      style={{
        minHeight: 36,
      }}
    >
      {icon} {label}
    </button>
  );
}
