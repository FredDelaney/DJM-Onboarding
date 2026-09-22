'use client';

import {
  Building2,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  Mail,
  MessageCircleMore,
  Phone,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';
import { whatsappHref } from '@/lib/research-links';

import styles from './AgencyContactIntelligenceDrawer.module.css';

type Rpc = <T = any>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type Props = {
  contact: any;
  rpc: Rpc;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onOpenClub: (clubName: string) => void;
};

const clean = (value: unknown) =>
  String(value || '').trim();

const transfermarktSearch = (
  name: string,
  clubName: string,
) => {
  const query = [name, clubName]
    .filter(Boolean)
    .join(' ');

  return (
    'https://www.transfermarkt.com/' +
    'schnellsuche/ergebnis/schnellsuche' +
    `?query=${encodeURIComponent(query)}`
  );
};

const verificationLabel = (
  value: unknown,
) => {
  const state = clean(value);

  if (state === 'recently_verified') {
    return 'Recently verified';
  }

  if (state === 'verification_due') {
    return 'Verification due';
  }

  if (state === 'not_verified') {
    return 'Not verified';
  }

  if (state === 'not_recorded') {
    return 'Employment not recorded';
  }

  return 'Verification unknown';
};

export default function AgencyContactIntelligenceDrawer({
  contact,
  rpc,
  onClose,
  onRefresh,
  onOpenClub,
}: Props) {
  const [detail, setDetail] =
    useState<any>(null);

  const [busy, setBusy] =
    useState(true);

  const [saving, setSaving] =
    useState('');

  const [error, setError] =
    useState('');

  const [editingReach, setEditingReach] =
    useState(false);

  const [editingProfiles, setEditingProfiles] =
    useState(false);

  const [markReachVerified, setMarkReachVerified] =
    useState(false);

  const [markProfilesVerified, setMarkProfilesVerified] =
    useState(false);

  const [email, setEmail] =
    useState('');

  const [whatsapp, setWhatsapp] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [transfermarkt, setTransfermarkt] =
    useState('');

  const [linkedin, setLinkedin] =
    useState('');

  const emailInputRef =
    useRef<HTMLInputElement>(null);

  const whatsappInputRef =
    useRef<HTMLInputElement>(null);

  const phoneInputRef =
    useRef<HTMLInputElement>(null);

  const openReachEditor = (
    field: 'email' | 'whatsapp' | 'phone',
  ) => {
    setEditingReach(true);
    setError('');

    window.requestAnimationFrame(() => {
      const target =
        field === 'email'
          ? emailInputRef
          : field === 'whatsapp'
            ? whatsappInputRef
            : phoneInputRef;

      target.current?.focus();
    });
  };

  const load = useCallback(async () => {
    const personId = clean(
      contact?.person_id,
    );

    if (!personId) return;

    setBusy(true);
    setError('');

    try {
      const result = await rpc<any>(
        'redream_relationship_contact',
        {
          p_person_id: personId,
        },
      );

      setDetail(result);

      setEmail(
        clean(
          result?.reach?.email?.value,
        ),
      );

      setWhatsapp(
        clean(
          result?.reach?.whatsapp?.value,
        ),
      );

      setPhone(
        clean(
          result?.reach?.phone?.value,
        ),
      );

      setTransfermarkt(
        clean(
          result?.external_profiles
            ?.transfermarkt?.url,
        ),
      );

      setLinkedin(
        clean(
          result?.external_profiles
            ?.linkedin_url ||
          result?.person?.linkedin_url,
        ),
      );
    } catch (loadError) {
      setError(
        friendlyError(loadError),
      );
    } finally {
      setBusy(false);
    }
  }, [contact?.person_id, rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryPerson =
    contact?.person || {};

  const summaryEmployment =
    contact?.employment || {};

  const summaryRelationship =
    contact?.relationship || {};

  const summaryActivity =
    contact?.activity || {};

  const summaryClubContext =
    contact?.club_context || {};

  const summaryWork =
    contact?.work || {};

  const person =
    detail?.person ||
    summaryPerson;

  const employment =
    detail?.employment ||
    summaryEmployment;

  const reach =
    detail?.reach || {};

  const profiles =
    detail?.external_profiles || {};

  const name =
    clean(person?.full_name) ||
    'Club contact';

  const clubName =
    clean(
      employment?.organisation_name,
    ) ||
    clean(
      summaryEmployment?.organisation_name,
    ) ||
    'Club not recorded';

  const role =
    clean(employment?.role_title) ||
    clean(summaryEmployment?.role_title) ||
    'Club contact';

  const whatsappLink =
    whatsappHref(
      reach?.whatsapp?.value,
    );

  const emailValue =
    clean(reach?.email?.value);

  const phoneValue =
    clean(reach?.phone?.value);

  const transfermarktUrl =
    clean(
      profiles?.transfermarkt?.url,
    );

  const linkedinUrl =
    clean(
      profiles?.linkedin_url ||
      person?.linkedin_url,
    );

  const transfermarktHref =
    transfermarktUrl ||
    transfermarktSearch(
      name,
      clubName === 'Club not recorded'
        ? ''
        : clubName,
    );

  const verificationState =
    clean(
      employment?.verification_state,
    );

  const verificationDate =
    employment?.last_verified_at
      ? relativeDate(
          employment.last_verified_at,
        )
      : '';

  const saveReach = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (saving) return;

    const personId =
      clean(contact?.person_id);

    if (!personId) return;

    const values = [
      ['email', email],
      ['whatsapp', whatsapp],
      ['phone', phone],
    ].filter(
      ([, value]) =>
        clean(value),
    );

    if (!values.length) {
      setError(
        'Add at least one contact detail.',
      );
      return;
    }

    setSaving('reach');
    setError('');

    try {
      let latest = detail;

      for (const [
        channel,
        value,
      ] of values) {
        latest =
          await rpc<any>(
            'redream_relationship_save_contact_method',
            {
              p_person_id:
                personId,

              p_channel:
                channel,

              p_value:
                clean(value),

              p_is_primary:
                true,

              p_mark_verified:
                markReachVerified,
            },
          );
      }

      setDetail(latest);
      setEditingReach(false);
      setMarkReachVerified(false);

      await onRefresh();
    } catch (saveError) {
      setError(
        friendlyError(saveError),
      );
    } finally {
      setSaving('');
    }
  };

  const saveProfiles = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (saving) return;

    const personId =
      clean(contact?.person_id);

    if (!personId) return;

    const values = [
      [
        'transfermarkt',
        transfermarkt,
      ],
      [
        'linkedin',
        linkedin,
      ],
    ].filter(
      ([, value]) =>
        clean(value),
    );

    if (!values.length) {
      setError(
        'Add at least one external profile.',
      );
      return;
    }

    setSaving('profiles');
    setError('');

    try {
      let latest = detail;

      for (const [
        provider,
        value,
      ] of values) {
        latest =
          await rpc<any>(
            'redream_relationship_save_external_profile',
            {
              p_person_id:
                personId,

              p_provider:
                provider,

              p_profile_url:
                clean(value),

              p_external_id:
                null,

              p_mark_verified:
                markProfilesVerified,
            },
          );
      }

      setDetail(latest);
      setEditingProfiles(false);
      setMarkProfilesVerified(false);

      await onRefresh();
    } catch (saveError) {
      setError(
        friendlyError(saveError),
      );
    } finally {
      setSaving('');
    }
  };

  const confirmEmployment =
    async () => {
      if (saving) return;

      const personId =
        clean(contact?.person_id);

      const employmentId =
        clean(
          employment?.employment_id,
        );

      if (
        !personId ||
        !employmentId
      ) {
        setError(
          'There is no current employment record to verify.',
        );
        return;
      }

      setSaving('employment');
      setError('');

      try {
        const result =
          await rpc<any>(
            'redream_relationship_confirm_employment',
            {
              p_person_id:
                personId,

              p_employment_id:
                employmentId,

              p_source_provider:
                transfermarktUrl
                  ? 'transfermarkt'
                  : null,

              p_source_url:
                transfermarktUrl ||
                null,
            },
          );

        setDetail(result);

        await onRefresh();
      } catch (saveError) {
        setError(
          friendlyError(saveError),
        );
      } finally {
        setSaving('');
      }
    };

  const activeDeals =
    Number(
      summaryClubContext
        ?.active_deals || 0,
    );

  const activeNeeds =
    Number(
      summaryClubContext
        ?.active_needs || 0,
    );

  const confirmedNeeds =
    Number(
      summaryClubContext
        ?.confirmed_needs || 0,
    );

  const openTasks =
    Number(
      summaryWork?.open_tasks || 0,
    );

  const quickActions =
    useMemo(
      () => [
        whatsappLink
          ? {
              key: 'whatsapp',
              label: 'WhatsApp',
              href: whatsappLink,
              icon: MessageCircleMore,
              external: true,
            }
          : null,

        emailValue
          ? {
              key: 'email',
              label: 'Email',
              href:
                `mailto:${emailValue}`,
              icon: Mail,
              external: false,
            }
          : null,

        phoneValue
          ? {
              key: 'phone',
              label: 'Call',
              href:
                `tel:${phoneValue}`,
              icon: Phone,
              external: false,
            }
          : null,
      ].filter(Boolean) as Array<{
        key: string;
        label: string;
        href: string;
        icon: typeof Mail;
        external: boolean;
      }>,
      [
        emailValue,
        phoneValue,
        whatsappLink,
      ],
    );

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        aria-label={`Contact intelligence for ${name}`}
      >
        <header
          className={
            styles.header
          }
        >
          <div
            className={
              styles.headerIdentity
            }
          >
            <div
              className={
                styles.avatar
              }
            >
              <UserRound
                size={20}
              />
            </div>

            <div>
              <p
                className={
                  styles.eyebrow
                }
              >
                CONTACT INTELLIGENCE
              </p>

              <h2>{name}</h2>

              <p>
                {[role, clubName]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <button
            type="button"
            className={
              styles.close
            }
            onClick={onClose}
            aria-label="Close contact intelligence"
          >
            <X size={17} />
          </button>
        </header>

        {busy ? (
          <div
            className={
              styles.loading
            }
          >
            <LoaderCircle
              size={20}
              className={
                styles.spin
              }
            />
            Loading relationship context
          </div>
        ) : null}

        {error ? (
          <div
            className={
              styles.error
            }
          >
            {error}
          </div>
        ) : null}

        {!busy ? (
          <div
            className={
              styles.body
            }
          >
            <section
              className={
                styles.hero
              }
            >
              <div
                className={
                  styles.heroTop
                }
              >
                <div>
                  <span>
                    CURRENT RELATIONSHIP
                  </span>

                  <strong>
                    {clean(
                      summaryRelationship
                        ?.route_state,
                    )
                      .replaceAll(
                        '_',
                        ' ',
                      ) ||
                      'Not recorded'}
                  </strong>
                </div>

                <div>
                  <span>
                    AGENCY OWNER
                  </span>

                  <strong>
                    {clean(
                      summaryRelationship
                        ?.owner_name,
                    ) ||
                      'Not assigned'}
                  </strong>
                </div>
              </div>

              <div
                className={
                  styles.heroMeta
                }
              >
                <span>
                  Direct route{' '}
                  {Number(
                    summaryRelationship
                      ?.route_score ||
                      0,
                  )}
                </span>

                <span>
                  {summaryActivity
                    ?.last_interaction_at
                    ? `Last interaction ${relativeDate(
                        summaryActivity
                          .last_interaction_at,
                      )}`
                    : 'No interaction recorded'}
                </span>
              </div>
            </section>

            <section
              className={
                styles.section
              }
            >
              <div
                className={
                  styles.sectionHead
                }
              >
                <div>
                  <span>REACH</span>
                  <h3>
                    Contact now
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setEditingReach(
                      (value) =>
                        !value,
                    )
                  }
                >
                  {editingReach
                    ? 'Cancel'
                    : 'Edit details'}
                </button>
              </div>

              {quickActions.length ? (
                <div
                  className={
                    styles.quickActions
                  }
                >
                  {quickActions.map(
                    (action) => {
                      const Icon =
                        action.icon;

                      return (
                        <a
                          key={
                            action.key
                          }
                          href={
                            action.href
                          }
                          target={
                            action.external
                              ? '_blank'
                              : undefined
                          }
                          rel={
                            action.external
                              ? 'noreferrer'
                              : undefined
                          }
                        >
                          <Icon
                            size={16}
                          />
                          {
                            action.label
                          }
                        </a>
                      );
                    },
                  )}
                </div>
              ) : (
                <p
                  className={
                    styles.empty
                  }
                >
                  No direct contact
                  details are recorded
                  yet.
                </p>
              )}

              <div
                className={
                  styles.reachList
                }
              >
                <ContactLine
                  label="Email"
                  value={
                    emailValue ||
                    'Add email'
                  }
                  verified={
                    Boolean(
                      reach?.email
                        ?.is_verified,
                    )
                  }
                  onActivate={() =>
                    openReachEditor(
                      'email',
                    )
                  }
                />

                <ContactLine
                  label="WhatsApp"
                  value={
                    clean(
                      reach
                        ?.whatsapp
                        ?.value,
                    ) ||
                    'Add WhatsApp'
                  }
                  verified={
                    Boolean(
                      reach
                        ?.whatsapp
                        ?.is_verified,
                    )
                  }
                  onActivate={() =>
                    openReachEditor(
                      'whatsapp',
                    )
                  }
                />

                <ContactLine
                  label="Phone"
                  value={
                    phoneValue ||
                    'Add phone'
                  }
                  verified={
                    Boolean(
                      reach?.phone
                        ?.is_verified,
                    )
                  }
                  onActivate={() =>
                    openReachEditor(
                      'phone',
                    )
                  }
                />
              </div>

              {editingReach ? (
                <form
                  className={
                    styles.form
                  }
                  onSubmit={
                    saveReach
                  }
                >
                  <label>
                    Email
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={email}
                      onChange={(
                        event,
                      ) =>
                        setEmail(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="name@club.com"
                    />
                  </label>

                  <label>
                    WhatsApp
                    <input
                      ref={whatsappInputRef}
                      value={
                        whatsapp
                      }
                      onChange={(
                        event,
                      ) =>
                        setWhatsapp(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="+39..."
                    />
                  </label>

                  <label>
                    Phone
                    <input
                      ref={phoneInputRef}
                      value={phone}
                      onChange={(
                        event,
                      ) =>
                        setPhone(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="+39..."
                    />
                  </label>

                  <label
                    className={
                      styles.checkbox
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        markReachVerified
                      }
                      onChange={(
                        event,
                      ) =>
                        setMarkReachVerified(
                          event
                            .target
                            .checked,
                        )
                      }
                    />

                    I checked these
                    details
                  </label>

                  <button
                    type="submit"
                    className={
                      styles.primary
                    }
                    disabled={
                      Boolean(
                        saving,
                      )
                    }
                  >
                    {saving ===
                    'reach' ? (
                      <LoaderCircle
                        size={15}
                        className={
                          styles.spin
                        }
                      />
                    ) : (
                      <CheckCircle2
                        size={15}
                      />
                    )}

                    Save contact
                    details
                  </button>
                </form>
              ) : null}
            </section>

            <section
              className={
                styles.section
              }
            >
              <div
                className={
                  styles.sectionHead
                }
              >
                <div>
                  <span>
                    CURRENT EMPLOYMENT
                  </span>
                  <h3>
                    {clubName}
                  </h3>
                </div>

                <span
                  className={
                    verificationState ===
                    'verification_due'
                      ? styles.statusWarning
                      : styles.status
                  }
                >
                  <ShieldCheck
                    size={13}
                  />

                  {verificationLabel(
                    verificationState,
                  )}
                </span>
              </div>

              <div
                className={
                  styles.employment
                }
              >
                <div>
                  <span>ROLE</span>
                  <strong>
                    {role}
                  </strong>
                </div>

                <div>
                  <span>
                    LOCATION
                  </span>
                  <strong>
                    {[
                      employment
                        ?.organisation_city,
                      employment
                        ?.organisation_country,
                    ]
                      .filter(
                        Boolean,
                      )
                      .join(', ') ||
                      'Not recorded'}
                  </strong>
                </div>

                <div>
                  <span>
                    LAST CHECKED
                  </span>
                  <strong>
                    {verificationDate ||
                      'Never'}
                  </strong>
                </div>
              </div>

              <div
                className={
                  styles.profileActions
                }
              >
                <a
                  href={
                    transfermarktHref
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink
                    size={14}
                  />

                  {transfermarktUrl
                    ? 'Transfermarkt'
                    : 'Find on Transfermarkt'}
                </a>

                {linkedinUrl ? (
                  <a
                    href={
                      linkedinUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink
                      size={14}
                    />
                    LinkedIn
                  </a>
                ) : null}
              </div>

              {employment
                ?.employment_id ? (
                <button
                  type="button"
                  className={
                    styles.verifyButton
                  }
                  disabled={
                    Boolean(
                      saving,
                    )
                  }
                  onClick={() =>
                    void confirmEmployment()
                  }
                >
                  {saving ===
                  'employment' ? (
                    <LoaderCircle
                      size={15}
                      className={
                        styles.spin
                      }
                    />
                  ) : (
                    <CheckCircle2
                      size={15}
                    />
                  )}

                  Confirm still at{' '}
                  {clubName}
                </button>
              ) : null}

              <p
                className={
                  styles.truth
                }
              >
                External profiles are
                evidence only. ReDream
                never changes someone's
                club or role without
                human confirmation.
              </p>
            </section>

            <section
              className={
                styles.section
              }
            >
              <div
                className={
                  styles.sectionHead
                }
              >
                <div>
                  <span>
                    IDENTITY SOURCES
                  </span>
                  <h3>
                    Research profiles
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setEditingProfiles(
                      (value) =>
                        !value,
                    )
                  }
                >
                  {editingProfiles
                    ? 'Cancel'
                    : 'Edit profiles'}
                </button>
              </div>

              <ProfileLine
                label="Transfermarkt"
                value={
                  transfermarktUrl
                    ? 'Profile saved'
                    : 'Profile not saved'
                }
                verified={
                  Boolean(
                    profiles
                      ?.transfermarkt
                      ?.is_verified,
                  )
                }
              />

              <ProfileLine
                label="LinkedIn"
                value={
                  linkedinUrl
                    ? 'Profile saved'
                    : 'Profile not saved'
                }
                verified={
                  Boolean(
                    Array.isArray(
                      profiles?.all,
                    ) &&
                      profiles.all.some(
                        (
                          item: any,
                        ) =>
                          item.provider ===
                            'linkedin' &&
                          item.is_verified,
                      )
                  )
                }
              />

              {editingProfiles ? (
                <form
                  className={
                    styles.form
                  }
                  onSubmit={
                    saveProfiles
                  }
                >
                  <label>
                    Transfermarkt
                    profile
                    <input
                      type="url"
                      value={
                        transfermarkt
                      }
                      onChange={(
                        event,
                      ) =>
                        setTransfermarkt(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="https://www.transfermarkt.com/..."
                    />
                  </label>

                  <label>
                    LinkedIn profile
                    <input
                      type="url"
                      value={
                        linkedin
                      }
                      onChange={(
                        event,
                      ) =>
                        setLinkedin(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="https://www.linkedin.com/in/..."
                    />
                  </label>

                  <label
                    className={
                      styles.checkbox
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        markProfilesVerified
                      }
                      onChange={(
                        event,
                      ) =>
                        setMarkProfilesVerified(
                          event
                            .target
                            .checked,
                        )
                      }
                    />

                    I checked these
                    profiles
                  </label>

                  <button
                    type="submit"
                    className={
                      styles.primary
                    }
                    disabled={
                      Boolean(
                        saving,
                      )
                    }
                  >
                    {saving ===
                    'profiles' ? (
                      <LoaderCircle
                        size={15}
                        className={
                          styles.spin
                        }
                      />
                    ) : (
                      <CheckCircle2
                        size={15}
                      />
                    )}

                    Save profiles
                  </button>
                </form>
              ) : null}
            </section>

            <section
              className={
                styles.section
              }
            >
              <div
                className={
                  styles.sectionHead
                }
              >
                <div>
                  <span>
                    WHY THIS PERSON
                  </span>
                  <h3>
                    Live agency context
                  </h3>
                </div>
              </div>

              <div
                className={
                  styles.contextGrid
                }
              >
                <ContextMetric
                  value={
                    activeDeals
                  }
                  label={
                    activeDeals === 1
                      ? 'Live deal'
                      : 'Live deals'
                  }
                />

                <ContextMetric
                  value={
                    confirmedNeeds
                  }
                  label="Confirmed needs"
                />

                <ContextMetric
                  value={
                    activeNeeds
                  }
                  label="Active needs"
                />

                <ContextMetric
                  value={
                    openTasks
                  }
                  label="Open follow-up"
                />
              </div>

              <button
                type="button"
                className={
                  styles.clubButton
                }
                onClick={() =>
                  onOpenClub(
                    clubName,
                  )
                }
              >
                <Building2
                  size={15}
                />
                Open club context
              </button>
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ContactLine({
  label,
  value,
  verified,
  onActivate,
}: {
  label: string;
  value: string;
  verified: boolean;
  onActivate: () => void;
}) {
  const missing =
    value.startsWith('Add ');

  return (
    <button
      type="button"
      className={`${styles.contactLine} ${styles.contactLineButton}`}
      onClick={onActivate}
      aria-label={
        missing
          ? value
          : `Edit ${label}`
      }
    >
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <small>
        {missing
          ? 'Add'
          : verified
            ? 'Verified'
            : 'Not verified'}
      </small>
    </button>
  );
}

function ProfileLine({
  label,
  value,
  verified,
}: {
  label: string;
  value: string;
  verified: boolean;
}) {
  return (
    <div
      className={
        styles.contactLine
      }
    >
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <small>
        {verified
          ? 'Verified'
          : 'Evidence'}
      </small>
    </div>
  );
}

function ContextMetric({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
