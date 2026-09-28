'use client';

import {
  ContactRound,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  friendlyError,
  platformRpc,
} from '@/lib/platform-client';

import styles from './AgencyConnectionsDrawer.module.css';

type Provider =
  | 'google'
  | 'microsoft';

type Connection = {
  provider: Provider;
  capabilities?: string[];
  status?: string;
};

type ProviderContact = {
  external_contact_id: string;
  display_name?: string | null;
  email?: string | null;
  organisation_name?: string | null;
  role_title?: string | null;
  linked_person_id?: string | null;
  linked_person_name?: string | null;
  linked_organisation_name?: string | null;
  suggested_person_id?: string | null;
  suggested_person_name?: string | null;
  suggested_organisation_name?: string | null;
};

type NetworkContact = {
  person_id: string;
  person?: {
    full_name?: string | null;
  };
  employment?: {
    organisation_name?: string | null;
    role_title?: string | null;
  };
};

export default function AgencyProviderContactLinks({
  workspaceSlug,
  onStatus,
}: {
  workspaceSlug: string;
  onStatus?: (
    kind: 'success' | 'error',
    message: string,
  ) => void;
}) {
  const [
    connections,
    setConnections,
  ] =
    useState<Connection[]>([]);

  const [
    contacts,
    setContacts,
  ] =
    useState<NetworkContact[]>([]);

  const [
    provider,
    setProvider,
  ] =
    useState<Provider>(
      'google',
    );

  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    results,
    setResults,
  ] =
    useState<
      ProviderContact[]
    >([]);

  const [
    selection,
    setSelection,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    searching,
    setSearching,
  ] =
    useState(false);

  const [
    busy,
    setBusy,
  ] =
    useState('');

  const connectedProviders =
    useMemo(
      () =>
        connections.filter(
          (
            connection,
          ) =>
            connection.status ===
              'connected' &&
            connection
              .capabilities
              ?.includes(
                'contacts',
              ),
        ),
      [connections],
    );

  const load =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const [
            providerResult,
            relationshipResult,
          ] =
            await Promise.all([
              platformRpc<{
                connections?:
                  Connection[];
              }>(
                'redream_provider_connections',
                {},
                workspaceSlug,
              ),

              platformRpc<{
                contacts?: {
                  items?:
                    NetworkContact[];
                };
              }>(
                'redream_autopilot_relationships',
                {
                  p_limit:
                    1,
                  p_contact_limit:
                    500,
                },
                workspaceSlug,
              ),
            ]);

          const nextConnections =
            Array.isArray(
              providerResult
                ?.connections,
            )
              ? providerResult
                  .connections
              : [];

          const nextContacts =
            Array.isArray(
              relationshipResult
                ?.contacts
                ?.items,
            )
              ? relationshipResult
                  .contacts
                  .items
              : [];

          setConnections(
            nextConnections,
          );

          setContacts(
            nextContacts,
          );

          const first =
            nextConnections.find(
              (
                connection,
              ) =>
                connection.status ===
                  'connected' &&
                connection
                  .capabilities
                  ?.includes(
                    'contacts',
                  ),
            );

          if (first) {
            setProvider(
              first.provider,
            );
          }
        } catch (error) {
          onStatus?.(
            'error',
            friendlyError(
              error,
            ),
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        onStatus,
        workspaceSlug,
      ],
    );

  useEffect(
    () => {
      void load();
    },
    [load],
  );

  useEffect(
    () => {
      const text =
        query.trim();

      if (
        text.length < 2 ||
        !connectedProviders
          .some(
            (
              item,
            ) =>
              item.provider ===
              provider,
          )
      ) {
        setResults(
          [],
        );
        return;
      }

      const timer =
        window.setTimeout(
          () => {
            void (async () => {
              setSearching(
                true,
              );

              try {
                const result =
                  await platformRpc<{
                    contacts?:
                      ProviderContact[];
                  }>(
                    'redream_provider_contact_candidates',
                    {
                      p_provider:
                        provider,
                      p_query:
                        text,
                      p_limit:
                        20,
                    },
                    workspaceSlug,
                  );

                const next =
                  Array.isArray(
                    result
                      ?.contacts,
                  )
                    ? result.contacts
                    : [];

                setResults(
                  next,
                );

                setSelection(
                  Object.fromEntries(
                    next.map(
                      (
                        contact,
                      ) => [
                        contact
                          .external_contact_id,
                        contact
                          .linked_person_id ||
                          contact
                            .suggested_person_id ||
                          '',
                      ],
                    ),
                  ),
                );
              } catch (error) {
                onStatus?.(
                  'error',
                  friendlyError(
                    error,
                  ),
                );
              } finally {
                setSearching(
                  false,
                );
              }
            })();
          },
          250,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [
      connectedProviders,
      onStatus,
      provider,
      query,
      workspaceSlug,
    ],
  );

  const bind =
    async (
      contact:
        ProviderContact,
    ) => {
      if (busy) return;

      const personId =
        selection[
          contact
            .external_contact_id
        ] || '';

      setBusy(
        contact
          .external_contact_id,
      );

      try {
        const result =
          await platformRpc<{
            bound?: boolean;
            person_id?:
              string | null;
            person_name?:
              string | null;
            organisation_name?:
              string | null;
          }>(
            'redream_provider_contact_bind',
            {
              p_provider:
                provider,
              p_external_contact_id:
                contact
                  .external_contact_id,
              p_person_id:
                personId ||
                null,
            },
            workspaceSlug,
          );

        setResults(
          (
            current,
          ) =>
            current.map(
              (
                item,
              ) =>
                item.external_contact_id ===
                  contact
                    .external_contact_id
                  ? {
                      ...item,
                      linked_person_id:
                        result
                          ?.person_id ||
                        null,
                      linked_person_name:
                        result
                          ?.person_name ||
                        null,
                      linked_organisation_name:
                        result
                          ?.organisation_name ||
                        null,
                    }
                  : item,
            ),
        );

        onStatus?.(
          'success',
          result?.bound
            ? `${
                contact
                  .display_name ||
                contact
                  .email ||
                'Contact'
              } linked to ${
                result
                  .person_name ||
                'Network'
              }.`
            : 'Contact link removed.',
        );
      } catch (error) {
        onStatus?.(
          'error',
          friendlyError(
            error,
          ),
        );
      } finally {
        setBusy('');
      }
    };

  if (
    !loading &&
    connectedProviders
      .length ===
      0
  ) {
    return null;
  }

  return (
    <section
      className={
        styles.messagingSection
      }
      aria-labelledby="provider-contact-links-title"
    >
      <div
        className={
          styles.sectionIntro
        }
      >
        <div>
          <span>
            CONTACT IDENTITY
          </span>

          <h3 id="provider-contact-links-title">
            Match contacts once.
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
        Search a Google or
        Microsoft contact and
        link it to the right
        person in Network.
        ReDream will never make
        the match automatically.
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

          Loading contacts...
        </div>
      ) : (
        <div
          className={
            styles.messagingProvider
          }
        >
          <div
            className={
              styles.messagingActions
            }
          >
            {connectedProviders
              .length > 1 ? (
              <select
                className={
                  styles.threadContactSelect
                }
                value={
                  provider
                }
                onChange={(
                  event,
                ) => {
                  setProvider(
                    event
                      .target
                      .value as Provider,
                  );

                  setQuery(
                    '',
                  );

                  setResults(
                    [],
                  );
                }}
              >
                {connectedProviders.map(
                  (
                    connection,
                  ) => (
                    <option
                      key={
                        connection.provider
                      }
                      value={
                        connection.provider
                      }
                    >
                      {connection.provider ===
                      'google'
                        ? 'Google'
                        : 'Microsoft'}
                    </option>
                  ),
                )}
              </select>
            ) : null}

            <input
              className={
                styles.threadContactSelect
              }
              value={
                query
              }
              onChange={(
                event,
              ) =>
                setQuery(
                  event
                    .target
                    .value,
                )
              }
              placeholder="Search name, email or club"
              aria-label="Search provider contacts"
            />
          </div>

          {searching ? (
            <div
              className={
                styles.messagingLoading
              }
            >
              <LoaderCircle
                size={15}
                className={
                  styles.spin
                }
              />

              Finding contacts...
            </div>
          ) : query
              .trim()
              .length <
              2 ? (
            <div
              className={
                styles.noThreads
              }
            >
              Type at least two
              letters to search.
              Nothing is linked
              until you confirm
              it.
            </div>
          ) : results.length ? (
            <div
              className={
                styles.threadList
              }
            >
              {results.map(
                (
                  contact,
                ) => {
                  const selected =
                    selection[
                      contact
                        .external_contact_id
                    ] ||
                    '';

                  const isSuggested =
                    !contact
                      .linked_person_id &&
                    Boolean(
                      contact
                        .suggested_person_id,
                    );

                  const unchanged =
                    (
                      contact
                        .linked_person_id ||
                      ''
                    ) ===
                    selected;

                  return (
                    <div
                      key={
                        contact
                          .external_contact_id
                      }
                      className={
                        styles.threadRow
                      }
                    >
                      <span>
                        <strong>
                          {contact
                            .display_name ||
                            contact
                              .email ||
                            'Contact'}
                        </strong>

                        <small>
                          {[
                            contact
                              .email,
                            contact
                              .organisation_name,
                            contact
                              .role_title,
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' · ',
                            )}
                        </small>

                        <small>
                          {contact
                            .linked_person_name
                            ? `Linked to ${contact.linked_person_name}${
                                contact
                                  .linked_organisation_name
                                  ? ` · ${contact.linked_organisation_name}`
                                  : ''
                              }`
                            : isSuggested
                              ? `Suggested: ${contact.suggested_person_name}${
                                  contact
                                    .suggested_organisation_name
                                    ? ` · ${contact.suggested_organisation_name}`
                                    : ''
                                }. Confirm before ReDream uses it.`
                              : 'Choose the matching Network contact.'}
                        </small>
                      </span>

                      <div
                        className={
                          styles.threadControls
                        }
                      >
                        <select
                          className={
                            styles.threadContactSelect
                          }
                          value={
                            selected
                          }
                          onChange={(
                            event,
                          ) =>
                            setSelection(
                              (
                                current,
                              ) => ({
                                ...current,
                                [contact
                                  .external_contact_id]:
                                  event
                                    .target
                                    .value,
                              }),
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                        >
                          <option value="">
                            No Network link
                          </option>

                          {contacts.map(
                            (
                              networkContact,
                            ) => (
                              <option
                                key={
                                  networkContact
                                    .person_id
                                }
                                value={
                                  networkContact
                                    .person_id
                                }
                              >
                                {networkContact
                                  .person
                                  ?.full_name ||
                                  'Contact'}
                                {networkContact
                                  .employment
                                  ?.organisation_name
                                  ? ` · ${networkContact.employment.organisation_name}`
                                  : ''}
                                {networkContact
                                  .employment
                                  ?.role_title
                                  ? ` · ${networkContact.employment.role_title}`
                                  : ''}
                              </option>
                            ),
                          )}
                        </select>

                        <button
                          type="button"
                          className={
                            styles.secondary
                          }
                          onClick={() =>
                            void bind(
                              contact,
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            ) ||
                            unchanged
                          }
                        >
                          {busy ===
                          contact
                            .external_contact_id ? (
                            <LoaderCircle
                              size={13}
                              className={
                                styles.spin
                              }
                            />
                          ) : (
                            <ContactRound
                              size={13}
                            />
                          )}

                          {selected
                            ? contact
                                .linked_person_id
                              ? 'Update'
                              : 'Confirm'
                            : contact
                                .linked_person_id
                              ? 'Unlink'
                              : 'Choose'}
                        </button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            <div
              className={
                styles.noThreads
              }
            >
              No matching provider
              contacts found.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
