'use client';

import {
  Instagram,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
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

type MessagingProvider =
  | 'whatsapp'
  | 'instagram';

type MessagingConnection = {
  provider: MessagingProvider;
  display_label?: string | null;
  status?: string;
  health?: 'connected' | 'attention' | 'reconnect_required';
  last_event_at?: string | null;
  last_error?: string | null;
  token_expires_at?: string | null;
};

type MessagingThread = {
  provider: MessagingProvider;
  external_thread_id: string;
  participant_label?: string | null;
  participant_username?: string | null;
  participant_name?: string | null;
  participant_identity_source?: string | null;
  is_selected: boolean;
  last_activity_at?: string | null;
  bound_person_id?: string | null;
  bound_person_name?: string | null;
  bound_organisation_id?: string | null;
  bound_organisation_name?: string | null;
  bound_player_id?: string | null;
  bound_prospect_id?: string | null;
  bound_prospect_name?: string | null;
  bound_prospect_current_club?: string | null;
  bound_prospect_stage?: string | null;
  bound_player_name?: string | null;
  bound_player_current_club?: string | null;
  identity_kind?: 'player' | 'network_person' | 'recruitment_target' | null;
};

type FacebookSdk = {
  init: (config: Record<string, unknown>) => void;
  login: (
    callback: (response: any) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}

const PROVIDERS: Array<{
  key: MessagingProvider;
  name: string;
  description: string;
}> = [
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    description:
      'Best for club and football contacts. Choose only the business conversations ReDream should remember.',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    description:
      'Best for player conversations. Choose the player DMs ReDream should remember.',
  },
];

const providerName = (
  provider: MessagingProvider,
) =>
  provider === 'whatsapp'
    ? 'WhatsApp'
    : 'Instagram';

const timeout = <T,>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
) =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(message)),
        milliseconds,
      );
    }),
  ]);

async function loadFacebookSdk(
  appId: string,
  version: string,
) {
  if (!window.FB) {
    await new Promise<void>(
      (resolve, reject) => {
        const existing =
          document.getElementById(
            'facebook-jssdk',
          ) as HTMLScriptElement | null;

        if (existing) {
          const poll =
            window.setInterval(() => {
              if (window.FB) {
                window.clearInterval(
                  poll,
                );
                resolve();
              }
            }, 100);
          window.setTimeout(() => {
            window.clearInterval(poll);
            if (!window.FB) {
              reject(
                new Error(
                  'Meta connection could not load.',
                ),
              );
            }
          }, 10000);
          return;
        }

        const script =
          document.createElement(
            'script',
          );
        script.id =
          'facebook-jssdk';
        script.src =
          'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.onload = () =>
          resolve();
        script.onerror = () =>
          reject(
            new Error(
              'Meta connection could not load.',
            ),
          );
        document.head.appendChild(
          script,
        );
      },
    );
  }

  if (!window.FB) {
    throw new Error(
      'Meta connection could not load.',
    );
  }

  window.FB.init({
    appId,
    cookie: true,
    xfbml: false,
    version,
  });

  return window.FB;
}

async function whatsappSignup(
  appId: string,
  configId: string,
  version: string,
) {
  const sdk =
    await loadFacebookSdk(
      appId,
      version,
    );

  let removeListener =
    () => {};

  const session =
    new Promise<{
      waba_id: string;
      phone_number_id: string;
    }>((resolve) => {
      const handler =
        (event: MessageEvent) => {
          if (
            event.origin !==
            'https://www.facebook.com'
          ) {
            return;
          }

          try {
            const data =
              typeof event.data ===
              'string'
                ? JSON.parse(
                    event.data,
                  )
                : event.data;

            if (
              data?.type ===
                'WA_EMBEDDED_SIGNUP' &&
              data?.event ===
                'FINISH' &&
              data?.data
                ?.waba_id &&
              data?.data
                ?.phone_number_id
            ) {
              resolve({
                waba_id:
                  String(
                    data.data
                      .waba_id,
                  ),
                phone_number_id:
                  String(
                    data.data
                      .phone_number_id,
                  ),
              });
            }
          } catch {
            // Ignore unrelated Facebook window messages.
          }
        };

      window.addEventListener(
        'message',
        handler,
      );
      removeListener = () =>
        window.removeEventListener(
          'message',
          handler,
        );
    });

  const code =
    new Promise<string>(
      (resolve, reject) => {
        sdk.login(
          (response) => {
            const nextCode =
              String(
                response
                  ?.authResponse
                  ?.code || '',
              ).trim();

            if (nextCode) {
              resolve(nextCode);
            } else {
              reject(
                new Error(
                  'WhatsApp connection was cancelled.',
                ),
              );
            }
          },
          {
            config_id: configId,
            auth_type:
              'rerequest',
            response_type:
              'code',
            override_default_response_type:
              true,
            extras: {
              setup: {},
            },
          },
        );
      },
    );

  try {
    const [
      authorizationCode,
      sessionInfo,
    ] = await Promise.all([
      timeout(
        code,
        120000,
        'WhatsApp connection timed out.',
      ),
      timeout(
        session,
        120000,
        'WhatsApp setup details were not returned.',
      ),
    ]);

    return {
      code: authorizationCode,
      ...sessionInfo,
    };
  } finally {
    removeListener();
  }
}

export default function AgencyMessagingConnections({
  workspaceSlug,
  onStatus,
  onIdentityState,
}: {
  workspaceSlug: string;
  onStatus?: (
    kind: 'success' | 'error',
    message: string,
  ) => void;
  onIdentityState?: (state: {
    selected: number;
    unresolved: number;
  }) => void;
}) {
  const [
    connections,
    setConnections,
  ] = useState<
    MessagingConnection[]
  >([]);
  const [threads, setThreads] =
    useState<
      Record<
        MessagingProvider,
        MessagingThread[]
      >
    >({
      whatsapp: [],
      instagram: [],
    });
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState('');
  const [ready, setReady] =
    useState<
      Record<
        MessagingProvider,
        boolean
      >
    >({
      whatsapp: false,
      instagram: false,
    });

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

  const loadThreads =
    useCallback(
      async (
        provider:
          MessagingProvider,
      ) => {
        const result =
          await platformRpc<{
            threads?: MessagingThread[];
          }>(
            'redream_messaging_threads',
            {
              p_provider:
                provider,
            },
            workspaceSlug,
          );

        setThreads(
          (current) => ({
            ...current,
            [provider]:
              Array.isArray(
                result?.threads,
              )
                ? result.threads
                : [],
          }),
        );
      },
      [workspaceSlug],
    );

  const load =
    useCallback(async () => {
      setLoading(true);

      try {
        const result =
          await platformRpc<{
            connections?:
              MessagingConnection[];
          }>(
            'redream_messaging_connections',
            {},
            workspaceSlug,
          );

        const next =
          Array.isArray(
            result
              ?.connections,
          )
            ? result.connections
            : [];

        setConnections(next);

        try {
          const config =
            await platformInvoke<{
              whatsapp_ready?: boolean;
              instagram_ready?: boolean;
            }>(
              'redream-meta-connect',
              {
                action: 'config',
                workspace_slug:
                  workspaceSlug,
              },
            );

          setReady({
            whatsapp:
              Boolean(
                config?.whatsapp_ready,
              ),
            instagram:
              Boolean(
                config?.instagram_ready,
              ),
          });
        } catch {
          setReady({
            whatsapp: false,
            instagram: false,
          });
        }

        await Promise.all(
          next
            .filter(
              (item) =>
                item.status ===
                'connected',
            )
            .map(async (item) => {
              if (
                item.provider ===
                'instagram'
              ) {
                try {
                  await platformInvoke(
                    'redream-meta-connect',
                    {
                      action:
                        'instagram_threads',
                      workspace_slug:
                        workspaceSlug,
                    },
                  );
                } catch {
                  // Existing cached thread stubs remain usable if Meta is unavailable.
                }
              }

              await loadThreads(
                item.provider,
              );
            }),
        );
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(error),
        );
      } finally {
        setLoading(false);
      }
    }, [
      loadThreads,
      onStatus,
      workspaceSlug,
    ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const allThreads = [
      ...threads.instagram,
      ...threads.whatsapp,
    ];
    const selected = allThreads.filter(
      (thread) => thread.is_selected,
    );
    const unresolved = selected.filter(
      (thread) =>
        !thread.bound_person_id &&
        !thread.bound_player_id &&
        !thread.bound_prospect_id,
    );

    onIdentityState?.({
      selected: selected.length,
      unresolved: unresolved.length,
    });
  }, [onIdentityState, threads]);

  const refreshInstagramThreads =
    async () => {
      if (busy) return;

      setBusy(
        'sync:instagram',
      );

      try {
        const result =
          await platformInvoke<{
            ok?: boolean;
            threads_seen?: number;
          }>(
            'redream-meta-connect',
            {
              action:
                'instagram_threads',
              workspace_slug:
                workspaceSlug,
            },
          );

        if (!result?.ok) {
          throw new Error(
            'Instagram chats could not be refreshed.',
          );
        }

        await loadThreads(
          'instagram',
        );

        onStatus?.(
          'success',
          String(
            result.threads_seen ||
              0,
          ) +
            ' Instagram chats ready to choose.',
        );
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(error),
        );
      } finally {
        setBusy('');
      }
    };

  const connectInstagram =
    async () => {
      setBusy(
        'connect:instagram',
      );

      try {
        const returnTo =
          new URL(
            window.location.href,
          );
        returnTo.searchParams.set(
          'connections',
          '1',
        );

        const result =
          await platformInvoke<{
            authorization_url?: string;
            error?: string;
          }>(
            'redream-meta-connect',
            {
              action:
                'instagram_start',
              workspace_slug:
                workspaceSlug,
              return_to:
                returnTo.toString(),
            },
          );

        if (
          !result
            ?.authorization_url
        ) {
          throw new Error(
            result?.error ||
              'Instagram connection link was not returned.',
          );
        }

        window.location.assign(
          result
            .authorization_url,
        );
      } catch (error) {
        setBusy('');
        onStatus?.(
          'error',
          friendlyError(error),
        );
      }
    };

  const connectWhatsApp =
    async () => {
      setBusy(
        'connect:whatsapp',
      );

      try {
        const config =
          await platformInvoke<{
            ready?: boolean;
            app_id?: string;
            config_id?: string;
            graph_version?: string;
          }>(
            'redream-meta-connect',
            {
              action:
                'whatsapp_config',
              workspace_slug:
                workspaceSlug,
            },
          );

        if (
          !config?.ready ||
          !config.app_id ||
          !config.config_id
        ) {
          throw new Error(
            'WhatsApp connection needs Meta app setup first.',
          );
        }

        const signup =
          await whatsappSignup(
            config.app_id,
            config.config_id,
            config.graph_version ||
              'v26.0',
          );

        const result =
          await platformInvoke<{
            ok?: boolean;
          }>(
            'redream-meta-connect',
            {
              action:
                'whatsapp_finish',
              workspace_slug:
                workspaceSlug,
              code: signup.code,
              waba_id:
                signup.waba_id,
              phone_number_id:
                signup
                  .phone_number_id,
            },
          );

        if (!result?.ok) {
          throw new Error(
            'WhatsApp connection did not complete.',
          );
        }

        onStatus?.(
          'success',
          'WhatsApp connected.',
        );
        await load();
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(error),
        );
      } finally {
        setBusy('');
      }
    };

  const connect =
    async (
      provider:
        MessagingProvider,
    ) => {
      if (busy) return;

      if (
        provider ===
        'whatsapp'
      ) {
        await connectWhatsApp();
      } else {
        await connectInstagram();
      }
    };

  const disconnect =
    async (
      provider:
        MessagingProvider,
    ) => {
      if (busy) return;
      setBusy(
        'disconnect:' +
          provider,
      );

      try {
        await platformRpc(
          'redream_messaging_connection_disconnect',
          {
            p_provider:
              provider,
          },
          workspaceSlug,
        );

        onStatus?.(
          'success',
          providerName(
            provider,
          ) +
            ' disconnected.',
        );
        await load();
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(error),
        );
      } finally {
        setBusy('');
      }
    };

  const setSelected =
    async (
      provider:
        MessagingProvider,
      thread:
        MessagingThread,
      selected: boolean,
    ) => {
      if (busy) return;
      setBusy(
        'thread:' +
          provider +
          ':' +
          thread.external_thread_id,
      );

      try {
        await platformRpc(
          'redream_messaging_thread_set_selected',
          {
            p_provider:
              provider,
            p_external_thread_id:
              thread
                .external_thread_id,
            p_selected:
              selected,
          },
          workspaceSlug,
        );

        setThreads(
          (current) => ({
            ...current,
            [provider]:
              current[
                provider
              ].map(
                (item) =>
                  item.external_thread_id ===
                  thread.external_thread_id
                    ? {
                        ...item,
                        is_selected:
                          selected,
                      }
                    : item,
              ),
          }),
        );

        onStatus?.(
          'success',
          selected
            ? provider === 'instagram'
              ? 'This Instagram conversation can now feed ReDream. Confirm who it belongs to under Review identities.'
              : 'This business conversation can now feed ReDream. Confirm who it belongs to under Review identities.'
            : 'ReDream will stop learning from this chat.',
        );
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(error),
        );
      } finally {
        setBusy('');
      }
    };

  return (
    <section
      className={
        styles.messagingSection
      }
      aria-labelledby="agency-messaging-title"
    >
      <div
        className={
          styles.sectionIntro
        }
      >
        <div>
          <span>
            MESSAGES
          </span>
          <h3 id="agency-messaging-title">
            Choose what ReDream
            should remember.
          </h3>
        </div>
        <ShieldCheck
          size={17}
        />
      </div>

      <p
        className={
          styles.sectionCopy
        }
      >
        Connecting an account does not give ReDream every conversation.
        Instagram is normally for your players. WhatsApp is normally for
        club and football contacts. Turn on only the conversations that
        matter, then confirm the person or player before ReDream uses the context.
      </p>

      {loading ? (
        <div
          className={
            styles.messagingLoading
          }
        >
          <LoaderCircle
            size={16}
            className={
              styles.spin
            }
          />
          Checking messaging
          accounts...
        </div>
      ) : (
        <div
          className={
            styles.messagingProviders
          }
        >
          {PROVIDERS.map(
            (provider) => {
              const connection =
                byProvider.get(
                  provider.key,
                );
              const providerThreads =
                threads[
                  provider.key
                ];
              const working =
                busy.endsWith(
                  provider.key,
                );
              const health =
                connection?.health ||
                (connection
                  ? 'connected'
                  : null);
              const statusLabel =
                !connection
                  ? 'Not connected'
                  : health ===
                      'reconnect_required'
                    ? 'Reconnect'
                    : health ===
                        'attention'
                      ? 'Needs attention'
                      : 'Connected';

                            return (
                <article
                  key={
                    provider.key
                  }
                  className={
                    styles.messagingProvider
                  }
                >
                  <div
                    className={
                      styles.messagingTop
                    }
                  >
                    <div
                      className={
                        styles.providerIcon
                      }
                    >
                      {provider.key ===
                      'instagram' ? (
                        <Instagram
                          size={18}
                        />
                      ) : (
                        <MessageCircle
                          size={18}
                        />
                      )}
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
                            connection &&
                            health ===
                              'connected'
                              ? styles.connected
                              : health ===
                                  'attention'
                                ? styles.attention
                                : styles.notConnected
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <span>
                        {connection
                          ?.display_label ||
                          provider.description}
                      </span>
                    </div>
                  </div>

                  {connection ? (
                    <>
                      {health !==
                      'connected' ? (
                        <div
                          className={
                            styles.connectionWarning
                          }
                        >
                          {health ===
                          'reconnect_required'
                            ? 'This connection needs to be reconnected before new messages can reach ReDream.'
                            : 'This connection will need attention soon. ReDream will try to refresh it automatically.'}
                        </div>
                      ) : null}

                      <div
                        className={
                          styles.threadList
                        }
                      >
                        {providerThreads
                          .length ? (
                          providerThreads.map(
                            (
                              thread,
                            ) => (
                                                            <div
                                key={
                                  thread.external_thread_id
                                }
                                className={
                                  styles.threadRow
                                }
                              >
                                <span>
                                  <strong>
                                    {thread.participant_username ||
                                      thread.participant_label ||
                                      'Conversation'}
                                  </strong>

                                  <small>
                                    {thread.bound_player_name
                                      ? 'Player · ' +
                                        thread.bound_player_name +
                                        (thread.bound_player_current_club
                                          ? ' · ' + thread.bound_player_current_club
                                          : '')
                                      : thread.bound_person_name
                                        ? 'Network · ' +
                                          thread.bound_person_name +
                                          (thread.bound_organisation_name
                                            ? ' · ' + thread.bound_organisation_name
                                            : '')
                                        : thread.is_selected
                                          ? thread.participant_name &&
                                            thread.participant_name.toLowerCase() !==
                                              String(
                                                thread.participant_username ||
                                                  thread.participant_label ||
                                                  '',
                                              ).toLowerCase()
                                            ? thread.participant_name +
                                              ' · Identity needed'
                                            : provider.key === 'instagram'
                                              ? 'Identity needed. Usually link this Instagram DM to a signed player.'
                                              : 'Identity needed. Usually link this WhatsApp chat to a Network contact.'
                                          : 'Private until you switch it on.'}
                                  </small>
                                </span>

                                <div
                                  className={
                                    styles.threadControls
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      thread.is_selected
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      void setSelected(
                                        provider.key,
                                        thread,
                                        event
                                          .target
                                          .checked,
                                      )
                                    }
                                    disabled={
                                      Boolean(
                                        busy,
                                      )
                                    }
                                    aria-label={
                                      'Use ' +
                                      (thread.participant_label ||
                                        'conversation') +
                                      ' in ReDream'
                                    }
                                  />
                                </div>
                              </div>
                            ),
                          )
                        ) : (
                          <div
                            className={
                              styles.noThreads
                            }
                          >
                            New
                            conversations
                            will appear
                            here. Nothing
                            is saved to
                            Agency Memory
                            until you
                            switch a chat
                            on.
                          </div>
                        )}
                      </div>

                      <div
                        className={
                          styles.messagingActions
                        }
                      >
                        {provider.key ===
                          'instagram' &&
                        health ===
                          'connected' ? (
                          <button
                            type="button"
                            className={
                              styles.secondary
                            }
                            onClick={() =>
                              void refreshInstagramThreads()
                            }
                            disabled={
                              Boolean(busy)
                            }
                          >
                            {busy ===
                            'sync:instagram' ? (
                              <LoaderCircle
                                size={14}
                                className={
                                  styles.spin
                                }
                              />
                            ) : (
                              <RefreshCw
                                size={14}
                              />
                            )}
                            Refresh chats
                          </button>
                        ) : null}

                        {ready[
                          provider.key
                        ] ? (
                          <button
                            type="button"
                            className={
                              health ===
                              'reconnect_required'
                                ? styles.primary
                                : styles.secondary
                            }
                            onClick={() =>
                              void connect(
                                provider.key,
                              )
                            }
                            disabled={
                              Boolean(busy)
                            }
                          >
                            {working ? (
                              <LoaderCircle
                                size={14}
                                className={
                                  styles.spin
                                }
                              />
                            ) : (
                              <MessageCircle
                                size={14}
                              />
                            )}
                            Reconnect
                          </button>
                        ) : null}

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
                            Boolean(busy)
                          }
                        >
                          {working ? (
                            <LoaderCircle
                              size={14}
                              className={
                                styles.spin
                              }
                            />
                          ) : (
                            <Unplug
                              size={14}
                            />
                          )}
                          Disconnect
                        </button>
                      </div>
                    </>
                  ) : ready[
                    provider.key
                  ] ? (
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
                        Boolean(busy)
                      }
                    >
                      {working ? (
                        <LoaderCircle
                          size={14}
                          className={
                            styles.spin
                          }
                        />
                      ) : (
                        <MessageCircle
                          size={14}
                        />
                      )}
                      Connect{' '}
                      {providerName(
                        provider.key,
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={
                        styles.secondary
                      }
                      disabled
                    >
                      <ShieldCheck
                        size={14}
                      />
                      Setup in progress
                    </button>
                  )}
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
