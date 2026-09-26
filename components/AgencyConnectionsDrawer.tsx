'use client';

import {
  CalendarDays,
  ContactRound,
  Link2,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  friendlyError,
  platformInvoke,
  platformRpc,
} from '@/lib/platform-client';

import styles from './AgencyConnectionsDrawer.module.css';

type Provider =
  | 'google'
  | 'microsoft';

type Connection = {
  provider: Provider;
  email?: string | null;
  display_label?: string | null;
  capabilities?: string[];
  scopes?: string[];
  status?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
};

const PROVIDERS: Array<{
  key: Provider;
  name: string;
  description: string;
}> = [
  {
    key: 'google',
    name: 'Google',
    description:
      'Google Calendar and Google Contacts.',
  },
  {
    key: 'microsoft',
    name: 'Microsoft',
    description:
      'Outlook Calendar and Microsoft contacts.',
  },
];

export default function AgencyConnectionsDrawer({
  workspaceSlug,
  onClose,
}: {
  workspaceSlug: string;
  onClose: () => void;
}) {
  const [connections, setConnections] =
    useState<Connection[]>([]);
  const [emailAccess, setEmailAccess] =
    useState<Record<Provider, boolean>>({
      google: false,
      microsoft: false,
    });
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState('');
  const [error, setError] =
    useState('');
  const [message, setMessage] =
    useState('');

  const byProvider =
    useMemo(
      () =>
        new Map(
          connections.map(
            (connection) => [
              connection.provider,
              connection,
            ],
          ),
        ),
      [connections],
    );

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError('');

        try {
          const result =
            await platformRpc<{
              connections?: Connection[];
            }>(
              'redream_provider_connections',
              {},
              workspaceSlug,
            );

          const next =
            Array.isArray(
              result?.connections,
            )
              ? result.connections
              : [];

          setConnections(next);

          setEmailAccess({
            google:
              next
                .find(
                  (item) =>
                    item.provider ===
                    'google',
                )
                ?.capabilities
                ?.includes('email') ||
              false,
            microsoft:
              next
                .find(
                  (item) =>
                    item.provider ===
                    'microsoft',
                )
                ?.capabilities
                ?.includes('email') ||
              false,
          });
        } catch (loadError) {
          setError(
            friendlyError(
              loadError,
            ),
          );
        } finally {
          setLoading(false);
        }
      },
      [workspaceSlug],
    );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    const status =
      params.get(
        'connection_status',
      );

    const provider =
      params.get(
        'connection_provider',
      );

    if (
      status === 'connected'
    ) {
      setMessage(
        `${provider === 'microsoft' ? 'Microsoft' : 'Google'} connected.`,
      );
    } else if (
      status === 'error'
    ) {
      setError(
        `${provider === 'microsoft' ? 'Microsoft' : 'Google'} connection did not complete. Nothing was changed.`,
      );
    }

    if (
      status ||
      provider ||
      params.get('connections') === '1'
    ) {
      params.delete(
        'connection_status',
      );
      params.delete(
        'connection_provider',
      );
      params.delete(
        'connections',
      );

      const query =
        params.toString();

      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }
  }, []);

  const connect =
    async (
      provider: Provider,
    ) => {
      if (busy) return;

      setBusy(
        `connect:${provider}`,
      );
      setError('');
      setMessage('');

      try {
        const returnTo =
          new URL(
            window.location.href,
          );

        returnTo.searchParams.set(
          'connections',
          '1',
        );

        returnTo.searchParams.delete(
          'connection_status',
        );

        returnTo.searchParams.delete(
          'connection_provider',
        );

        const capabilities = [
          'calendar',
          'contacts',
          ...(emailAccess[
            provider
          ]
            ? ['email']
            : []),
        ];

        const result =
          await platformInvoke<{
            authorization_url?: string;
          }>(
            'redream-provider-oauth',
            {
              action: 'start',
              provider,
              workspace_slug:
                workspaceSlug,
              capabilities,
              return_to:
                returnTo.toString(),
            },
          );

        if (
          !result?.authorization_url
        ) {
          throw new Error(
            'Connection link was not returned.',
          );
        }

        window.location.assign(
          result.authorization_url,
        );
      } catch (connectError) {
        setError(
          friendlyError(
            connectError,
          ),
        );
        setBusy('');
      }
    };

  const disconnect =
    async (
      provider: Provider,
    ) => {
      if (busy) return;

      setBusy(
        `disconnect:${provider}`,
      );
      setError('');
      setMessage('');

      try {
        await platformRpc(
          'redream_provider_connection_disconnect',
          {
            p_provider:
              provider,
          },
          workspaceSlug,
        );

        setMessage(
          `${provider === 'microsoft' ? 'Microsoft' : 'Google'} disconnected.`,
        );

        await load();
      } catch (disconnectError) {
        setError(
          friendlyError(
            disconnectError,
          ),
        );
      } finally {
        setBusy('');
      }
    };

  return (
    <div
      className={
        styles.backdrop
      }
      onClick={(event) => {
        if (
          event.target ===
            event.currentTarget &&
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
        aria-labelledby="agency-connections-title"
      >
        <header
          className={
            styles.header
          }
        >
          <div>
            <p
              className={
                styles.eyebrow
              }
            >
              CONNECTED WORK
            </p>
            <h2 id="agency-connections-title">
              Connect the tools
              you already use.
            </h2>
            <p>
              ReDream will use
              only the access you
              choose for this
              agency account.
            </p>
          </div>

          <button
            type="button"
            className={
              styles.close
            }
            onClick={onClose}
            disabled={
              Boolean(busy)
            }
            aria-label="Close connections"
          >
            <X size={17} />
          </button>
        </header>

        {error ? (
          <div
            className={
              styles.error
            }
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {message ? (
          <div
            className={
              styles.success
            }
            role="status"
          >
            {message}
          </div>
        ) : null}

        {loading ? (
          <div
            className={
              styles.loading
            }
          >
            <LoaderCircle
              size={18}
              className={
                styles.spin
              }
            />
            Checking connections...
          </div>
        ) : (
          <div
            className={
              styles.providers
            }
          >
            {PROVIDERS.map(
              (provider) => {
                const connected =
                  byProvider.get(
                    provider.key,
                  );

                const working =
                  busy.endsWith(
                    provider.key,
                  );

                return (
                  <article
                    key={
                      provider.key
                    }
                    className={
                      styles.provider
                    }
                  >
                    <div
                      className={
                        styles.providerTop
                      }
                    >
                      <div
                        className={
                          styles.providerIcon
                        }
                      >
                        <Link2
                          size={18}
                        />
                      </div>

                      <div
                        className={
                          styles.providerCopy
                        }
                      >
                        <div
                          className={
                            styles.providerTitle
                          }
                        >
                          <strong>
                            {
                              provider.name
                            }
                          </strong>

                          <span
                            className={
                              connected
                                ? styles.connected
                                : styles.notConnected
                            }
                          >
                            {connected
                              ? 'Connected'
                              : 'Not connected'}
                          </span>
                        </div>

                        <span>
                          {connected
                            ?.email ||
                            connected
                              ?.display_label ||
                            provider.description}
                        </span>
                      </div>
                    </div>

                    <div
                      className={
                        styles.capabilities
                      }
                    >
                      <div>
                        <CalendarDays
                          size={15}
                        />
                        <span>
                          Calendar
                        </span>
                        <small>
                          Read meetings
                          and dates.
                        </small>
                      </div>

                      <div>
                        <ContactRound
                          size={15}
                        />
                        <span>
                          Contacts
                        </span>
                        <small>
                          Match people
                          you already
                          know.
                        </small>
                      </div>
                    </div>

                    <label
                      className={
                        styles.emailOption
                      }
                    >
                      <div>
                        <Mail
                          size={15}
                        />
                        <span>
                          <strong>
                            Email
                          </strong>
                          <small>
                            Optional.
                            Read-only
                            access for
                            selected
                            agency
                            intelligence
                            workflows.
                          </small>
                        </span>
                      </div>

                      <input
                        type="checkbox"
                        checked={
                          emailAccess[
                            provider
                              .key
                          ]
                        }
                        onChange={(
                          event,
                        ) =>
                          setEmailAccess(
                            (
                              current,
                            ) => ({
                              ...current,
                              [provider
                                .key]:
                                event
                                  .target
                                  .checked,
                            }),
                          )
                        }
                        disabled={
                          Boolean(
                            busy,
                          )
                        }
                      />
                    </label>

                    <div
                      className={
                        styles.actions
                      }
                    >
                      <button
                        type="button"
                        className={
                          styles.primary
                        }
                        onClick={() =>
                          void connect(
                            provider.key,
                          )
                        }
                        disabled={
                          Boolean(
                            busy,
                          )
                        }
                      >
                        {working ? (
                          <LoaderCircle
                            size={14}
                            className={
                              styles.spin
                            }
                          />
                        ) : connected ? (
                          <RefreshCw
                            size={14}
                          />
                        ) : (
                          <Link2
                            size={14}
                          />
                        )}
                        {connected
                          ? 'Reconnect'
                          : `Connect ${provider.name}`}
                      </button>

                      {connected ? (
                        <button
                          type="button"
                          className={
                            styles.secondary
                          }
                          onClick={() =>
                            void disconnect(
                              provider.key,
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                        >
                          <Unplug
                            size={14}
                          />
                          Disconnect
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}

        <footer
          className={
            styles.security
          }
        >
          <ShieldCheck
            size={16}
          />
          <span>
            Refresh tokens are
            encrypted in Supabase
            Vault. They are never
            exposed to the browser
            or another agency.
          </span>
        </footer>
      </section>
    </div>
  );
}
