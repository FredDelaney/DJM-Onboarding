'use client';

import {
  BriefcaseBusiness,
  LoaderCircle,
  Plus,
  Target,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { friendlyError } from '@/lib/platform-client';

import styles from './AgencyCreateDrawer.module.css';

export type AgencyCreateKind =
  | 'player'
  | 'club_need'
  | 'deal'
  | 'contact';

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

type PlayerOption = {
  player_id: string;
  name: string;
  current_club?: string | null;
  primary_position?: string | null;
};

const META: Record<
  AgencyCreateKind,
  {
    eyebrow: string;
    title: string;
    copy: string;
    submit: string;
  }
> = {
  player: {
    eyebrow: 'PLAYERS',
    title: 'Add player',
    copy: 'Add the minimum useful player record now. You can complete the detail later.',
    submit: 'Add player',
  },
  club_need: {
    eyebrow: 'MARKET',
    title: 'Add club need',
    copy: 'Record what a club is actively looking for so the right player routes can be connected.',
    submit: 'Add club need',
  },
  deal: {
    eyebrow: 'DEALS',
    title: 'Add deal',
    copy: 'Start a real deal with the player, club and next action you already know.',
    submit: 'Add deal',
  },
  contact: {
    eyebrow: 'NETWORK',
    title: 'Add contact',
    copy: 'Add a real club contact and connect them to your agency network.',
    submit: 'Add contact',
  },
};

const initialValues = {
  first_name: '',
  last_name: '',
  primary_position: '',
  current_club: '',
  current_country: '',
  contract_expiry: '',
  transfermarkt_url: '',
  club_name: '',
  country: '',
  position: '',
  title: '',
  notes: '',
  expires_on: '',
  contact_name: '',
  contact_role: '',
  player_id: '',
  stage: 'qualifying',
  expected_commission: '',
  currency: 'EUR',
  next_action: '',
  next_action_at: '',
};

export default function AgencyCreateDrawer({
  kind,
  invoke,
  onClose,
  onCreated,
}: {
  kind: AgencyCreateKind;
  invoke: Invoke;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const meta = META[kind];

  const [values, setValues] = useState(initialValues);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(kind === 'deal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (kind !== 'deal') return;

    let active = true;

    void invoke('create_options')
      .then((response) => {
        if (!active) return;

        const rows = Array.isArray(response?.options?.players)
          ? response.options.players
          : [];

        setPlayers(
          rows
            .map((item: any) => ({
              player_id: String(item?.player_id || ''),
              name: String(item?.name || 'Player'),
              current_club: item?.current_club || null,
              primary_position: item?.primary_position || null,
            }))
            .filter((item: PlayerOption) => item.player_id),
        );
      })
      .catch((cause) => {
        if (!active) return;
        setError(friendlyError(cause));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });

    return () => {
      active = false;
    };
  }, [kind]);

  function setValue(key: keyof typeof initialValues, value: string) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');

    try {
      let action = '';
      let body: Record<string, unknown> = {};

      if (kind === 'player') {
        action = 'create_player';
        body = {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim() || null,
          primary_position: values.primary_position.trim(),
          current_club: values.current_club.trim() || null,
          current_country: values.current_country.trim() || null,
          contract_expiry: values.contract_expiry || null,
          transfermarkt_url: values.transfermarkt_url.trim() || null,
        };
      }

      if (kind === 'club_need') {
        action = 'create_club_need';
        body = {
          club_name: values.club_name.trim(),
          country: values.country.trim() || null,
          position: values.position.trim(),
          title: values.title.trim() || null,
          notes: values.notes.trim() || null,
          expires_on: values.expires_on || null,
        };
      }

      if (kind === 'contact') {
        action = 'create_contact';
        body = {
          contact_name: values.contact_name.trim(),
          club_name: values.club_name.trim(),
          contact_role: values.contact_role.trim() || null,
          country: values.country.trim() || null,
          notes: values.notes.trim() || null,
        };
      }

      if (kind === 'deal') {
        action = 'create_deal';

        const commissionText = values.expected_commission.trim();
        const expectedCommission = commissionText
          ? Number(commissionText)
          : null;

        if (
          expectedCommission !== null &&
          (!Number.isFinite(expectedCommission) || expectedCommission < 0)
        ) {
          throw new Error('Expected commission must be zero or more.');
        }

        let nextActionAt: string | null = null;

        if (values.next_action_at) {
          const parsed = new Date(values.next_action_at);

          if (Number.isNaN(parsed.getTime())) {
            throw new Error('Choose a valid next action date and time.');
          }

          nextActionAt = parsed.toISOString();
        }

        body = {
          player_id: values.player_id,
          club_name: values.club_name.trim(),
          country: values.country.trim() || null,
          stage: values.stage,
          expected_commission: expectedCommission,
          currency: values.currency.trim().toUpperCase() || 'EUR',
          next_action: values.next_action.trim() || null,
          next_action_at: nextActionAt,
        };
      }

      await invoke(action, body);
      await onCreated();
      onClose();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (
          event.currentTarget === event.target &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <section
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agency-create-title"
      >
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.icon}>
              {kind === 'player' ? <Users size={18} /> : null}
              {kind === 'club_need' ? <Target size={18} /> : null}
              {kind === 'deal' ? <BriefcaseBusiness size={18} /> : null}
              {kind === 'contact' ? <UserRoundPlus size={18} /> : null}
            </div>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={busy}
              aria-label={`Close ${meta.title}`}
            >
              <X size={17} />
            </button>
          </div>

          <p>{meta.eyebrow}</p>
          <h2 id="agency-create-title">{meta.title}</h2>
          <span>{meta.copy}</span>
        </header>

        <form className={styles.form} onSubmit={submit}>
          {error ? (
            <div className={styles.error}>{error}</div>
          ) : null}

          {kind === 'player' ? (
            <>
              <div className={styles.pair}>
                <Field
                  label="First name"
                  required
                  value={values.first_name}
                  onChange={(value) => setValue('first_name', value)}
                />
                <Field
                  label="Last name"
                  value={values.last_name}
                  onChange={(value) => setValue('last_name', value)}
                />
              </div>

              <Field
                label="Primary position"
                required
                placeholder="e.g. Left winger"
                value={values.primary_position}
                onChange={(value) => setValue('primary_position', value)}
              />

              <div className={styles.pair}>
                <Field
                  label="Current club"
                  value={values.current_club}
                  onChange={(value) => setValue('current_club', value)}
                />
                <Field
                  label="Country"
                  value={values.current_country}
                  onChange={(value) => setValue('current_country', value)}
                />
              </div>

              <div className={styles.pair}>
                <Field
                  label="Contract expiry"
                  type="date"
                  value={values.contract_expiry}
                  onChange={(value) => setValue('contract_expiry', value)}
                />
                <Field
                  label="Transfermarkt URL"
                  type="url"
                  value={values.transfermarkt_url}
                  onChange={(value) => setValue('transfermarkt_url', value)}
                />
              </div>
            </>
          ) : null}

          {kind === 'club_need' ? (
            <>
              <div className={styles.pair}>
                <Field
                  label="Club"
                  required
                  value={values.club_name}
                  onChange={(value) => setValue('club_name', value)}
                />
                <Field
                  label="Country"
                  value={values.country}
                  onChange={(value) => setValue('country', value)}
                />
              </div>

              <Field
                label="Position"
                required
                placeholder="e.g. Left-footed winger"
                value={values.position}
                onChange={(value) => setValue('position', value)}
              />

              <Field
                label="Short title"
                placeholder="Optional"
                value={values.title}
                onChange={(value) => setValue('title', value)}
              />

              <TextArea
                label="What does the club need?"
                placeholder="Add the useful detail you already know."
                value={values.notes}
                onChange={(value) => setValue('notes', value)}
              />

              <Field
                label="Need valid until"
                type="date"
                value={values.expires_on}
                onChange={(value) => setValue('expires_on', value)}
              />
            </>
          ) : null}

          {kind === 'contact' ? (
            <>
              <Field
                label="Contact name"
                required
                value={values.contact_name}
                onChange={(value) => setValue('contact_name', value)}
              />

              <div className={styles.pair}>
                <Field
                  label="Club"
                  required
                  value={values.club_name}
                  onChange={(value) => setValue('club_name', value)}
                />
                <Field
                  label="Role"
                  placeholder="e.g. Sporting Director"
                  value={values.contact_role}
                  onChange={(value) => setValue('contact_role', value)}
                />
              </div>

              <Field
                label="Country"
                value={values.country}
                onChange={(value) => setValue('country', value)}
              />

              <TextArea
                label="Relationship note"
                placeholder="Optional context about how you know them."
                value={values.notes}
                onChange={(value) => setValue('notes', value)}
              />
            </>
          ) : null}

          {kind === 'deal' ? (
            <>
              {loadingOptions ? (
                <div className={styles.loading}>
                  <LoaderCircle size={17} className={styles.spin} />
                  Loading your players
                </div>
              ) : null}

              {!loadingOptions && !players.length ? (
                <div className={styles.notice}>
                  Add a player first. Every deal must belong to a real player in this agency.
                </div>
              ) : null}

              <label className={styles.field}>
                <span>Player</span>
                <select
                  required
                  value={values.player_id}
                  onChange={(event) =>
                    setValue('player_id', event.target.value)
                  }
                  disabled={loadingOptions || !players.length}
                >
                  <option value="">Choose player</option>
                  {players.map((player) => (
                    <option
                      key={player.player_id}
                      value={player.player_id}
                    >
                      {player.name}
                      {player.current_club
                        ? ` · ${player.current_club}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.pair}>
                <Field
                  label="Club"
                  required
                  value={values.club_name}
                  onChange={(value) => setValue('club_name', value)}
                />
                <Field
                  label="Country"
                  value={values.country}
                  onChange={(value) => setValue('country', value)}
                />
              </div>

              <label className={styles.field}>
                <span>Stage</span>
                <select
                  value={values.stage}
                  onChange={(event) =>
                    setValue('stage', event.target.value)
                  }
                >
                  <option value="qualifying">Qualifying</option>
                  <option value="contacted">Contacted</option>
                  <option value="interest">Interest</option>
                  <option value="negotiating">Negotiating</option>
                  <option value="offer">Offer</option>
                  <option value="contracting">Contracting</option>
                </select>
              </label>

              <div className={styles.pair}>
                <Field
                  label="Expected commission"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={values.expected_commission}
                  onChange={(value) =>
                    setValue('expected_commission', value)
                  }
                />
                <Field
                  label="Currency"
                  maxLength={3}
                  value={values.currency}
                  onChange={(value) => setValue('currency', value)}
                />
              </div>

              <Field
                label="Next action"
                placeholder="e.g. Send player profile to sporting director"
                value={values.next_action}
                onChange={(value) => setValue('next_action', value)}
              />

              <Field
                label="Next action date"
                type="datetime-local"
                value={values.next_action_at}
                onChange={(value) => setValue('next_action_at', value)}
              />

              <div className={styles.truth}>
                The system does not invent a success probability when you create a deal. It records what you know and helps you control the next action.
              </div>
            </>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={styles.primary}
              disabled={
                busy ||
                (kind === 'deal' &&
                  (loadingOptions || !players.length))
              }
            >
              {busy ? (
                <LoaderCircle size={16} className={styles.spin} />
              ) : (
                <Plus size={16} />
              )}
              {busy ? 'Saving' : meta.submit}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  min,
  step,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
  step?: string;
  maxLength?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        step={step}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
