'use client';

import {
  ArrowLeft,
  CheckCircle2,
  ContactRound,
  Instagram,
  LoaderCircle,
  Mail,
  MessageCircle,
  Search,
  UserRound,
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
  relativeDate,
} from '@/lib/platform-client';

import styles from './AgencyConnectedIdentityResolverDrawer.module.css';

type Provider = 'instagram' | 'whatsapp';
type ContactProvider = 'google' | 'microsoft';

type ProviderSuggestion = {
  provider: ContactProvider;
  external_contact_id: string;
  display_name?: string | null;
  email?: string | null;
  provider_organisation_name?: string | null;
  provider_role_title?: string | null;
  suggested_person_id: string;
  suggested_person_name?: string | null;
  suggested_organisation_name?: string | null;
  suggested_role_title?: string | null;
  match_basis?: 'exact_email' | 'exact_name' | null;
};

type Thread = {
  provider: Provider;
  external_thread_id: string;
  participant_label?: string | null;
  is_selected: boolean;
  last_activity_at?: string | null;
  bound_person_id?: string | null;
};

type Contact = {
  person_id: string;
  person?: {
    full_name?: string | null;
    preferred_name?: string | null;
  };
  employment?: {
    organisation_name?: string | null;
    role_title?: string | null;
  };
};

const providerLabel = (provider: Provider) =>
  provider === 'instagram' ? 'Instagram' : 'WhatsApp';

const contactName = (contact: Contact) =>
  String(
    contact?.person?.preferred_name ||
      contact?.person?.full_name ||
      'Network contact',
  ).trim();

export default function AgencyConnectedIdentityResolverDrawer({
  workspaceSlug,
  networkHref,
  onClose,
  onResolved,
}: {
  workspaceSlug: string;
  networkHref: string;
  onClose: () => void;
  onResolved?: () => Promise<void> | void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [providerSuggestions, setProviderSuggestions] =
    useState<ProviderSuggestion[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        instagram,
        whatsapp,
        relationships,
        providerIdentity,
      ] = await Promise.all([
          platformRpc<{ threads?: Thread[] }>(
            'redream_messaging_threads',
            { p_provider: 'instagram' },
            workspaceSlug,
          ),
          platformRpc<{ threads?: Thread[] }>(
            'redream_messaging_threads',
            { p_provider: 'whatsapp' },
            workspaceSlug,
          ),
          platformRpc<{
            contacts?: { items?: Contact[] };
          }>(
            'redream_autopilot_relationships',
            {
              p_limit: 1,
              p_contact_limit: 500,
            },
            workspaceSlug,
          ),
          platformRpc<{
            items?: ProviderSuggestion[];
          }>(
            'redream_provider_contact_suggestions',
            { p_limit: 24 },
            workspaceSlug,
          ),
        ]);

      const nextThreads = [
        ...(Array.isArray(instagram?.threads)
          ? instagram.threads
          : []),
        ...(Array.isArray(whatsapp?.threads)
          ? whatsapp.threads
          : []),
      ]
        .filter(
          (thread) =>
            thread.is_selected &&
            !thread.bound_person_id,
        )
        .sort((a, b) => {
          const aTime = Date.parse(
            String(a.last_activity_at || ''),
          );
          const bTime = Date.parse(
            String(b.last_activity_at || ''),
          );
          return (
            (Number.isFinite(bTime) ? bTime : 0) -
            (Number.isFinite(aTime) ? aTime : 0)
          );
        });

      setThreads(nextThreads);
      setProviderSuggestions(
        Array.isArray(providerIdentity?.items)
          ? providerIdentity.items
          : [],
      );
      setContacts(
        Array.isArray(relationships?.contacts?.items)
          ? relationships.contacts.items
          : [],
      );

      if (
        activeThread &&
        !nextThreads.some(
          (thread) =>
            thread.provider === activeThread.provider &&
            thread.external_thread_id ===
              activeThread.external_thread_id,
        )
      ) {
        setActiveThread(null);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, activeThread]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return contacts.slice(0, 80);

    return contacts
      .filter((contact) => {
        const haystack = [
          contactName(contact),
          contact?.employment?.organisation_name,
          contact?.employment?.role_title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, 80);
  }, [contacts, search]);
  const bind = async (contact: Contact) => {
    if (!activeThread || busy) return;

    setBusy(contact.person_id);
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        bound?: boolean;
        bound_person_name?: string | null;
      }>(
        'redream_messaging_thread_bind_contact',
        {
          p_provider: activeThread.provider,
          p_external_thread_id:
            activeThread.external_thread_id,
          p_person_id: contact.person_id,
        },
        workspaceSlug,
      );

      if (!result?.bound) {
        throw new Error(
          'The chat could not be linked to that contact.',
        );
      }

      const linkedThread = activeThread;
      const linkedName =
        result.bound_person_name || contactName(contact);

      setThreads((current) =>
        current.filter(
          (thread) =>
            !(
              thread.provider === linkedThread.provider &&
              thread.external_thread_id ===
                linkedThread.external_thread_id
            ),
        ),
      );
      setActiveThread(null);
      setSearch('');
      setSuccess(
        (linkedThread.participant_label || 'Chat') +
          ' linked to ' +
          linkedName +
          '.',
      );

      await onResolved?.();
    } catch (bindError) {
      setError(friendlyError(bindError));
    } finally {
      setBusy('');
    }
  };

  const bindProviderSuggestion = async (
    suggestion: ProviderSuggestion,
  ) => {
    if (busy) return;

    const busyKey =
      suggestion.provider +
      ':' +
      suggestion.external_contact_id;

    setBusy(busyKey);
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        bound?: boolean;
        person_id?: string | null;
        person_name?: string | null;
        organisation_name?: string | null;
      }>(
        'redream_provider_contact_bind',
        {
          p_provider: suggestion.provider,
          p_external_contact_id:
            suggestion.external_contact_id,
          p_person_id:
            suggestion.suggested_person_id,
        },
        workspaceSlug,
      );

      if (!result?.bound) {
        throw new Error(
          'The provider contact could not be linked.',
        );
      }

      setProviderSuggestions((current) =>
        current.filter(
          (item) =>
            !(
              item.provider === suggestion.provider &&
              item.suggested_person_id ===
                suggestion.suggested_person_id
            ),
        ),
      );

      const linkedName =
        result.person_name ||
        suggestion.suggested_person_name ||
        suggestion.display_name ||
        'Network contact';

      let syncWarning = '';

      try {
        const syncResult = await platformInvoke<{
          ok?: boolean;
          emails_reopened?: number;
          emails_captured?: number;
          error?: string;
        }>(
          'redream-provider-sync',
          {
            provider: suggestion.provider,
            workspace_slug: workspaceSlug,
          },
        );

        if (!syncResult?.ok) {
          throw new Error(
            syncResult?.error ||
              'Provider sync did not complete.',
          );
        }
      } catch {
        syncWarning =
          ' The identity is saved, but the provider refresh did not complete. You can sync it later in Connections.';
      }

      setSuccess(
        (suggestion.display_name ||
          suggestion.email ||
          'Provider contact') +
          ' linked to ' +
          linkedName +
          '.' +
          syncWarning,
      );

      await onResolved?.();
    } catch (bindError) {
      setError(friendlyError(bindError));
    } finally {
      setBusy('');
    }
  };

  const remaining =
    threads.length + providerSuggestions.length;
  const ProviderIcon =
    activeThread?.provider === 'instagram'
      ? Instagram
      : MessageCircle;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Resolve connected identities"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <small>CONNECTED WORK</small>
            <h2>
              {activeThread
                ? 'Choose the right contact'
                : 'Resolve connected identities'}
            </h2>
            <p>
              {activeThread
                ? 'Use the agency Network as the identity source. ReDream will use the person and their current club for future selected messages.'
                : remaining
                  ? remaining +
                    ' connected ' +
                    (remaining === 1 ? 'identity needs' : 'identities need') +
                    ' confirmation.'
                  : 'Connected identities are up to date.'}
            </p>
          </div>

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close identity resolution"
          >
            <X size={17} />
          </button>
        </header>
        {error ? (
          <div className={styles.error}>{error}</div>
        ) : null}

        {success ? (
          <div className={styles.success}>
            <CheckCircle2 size={15} />
            <span>{success}</span>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loading}>
            <LoaderCircle size={16} />
            Loading identity matches and selected chats
          </div>
        ) : activeThread ? (
          <div className={styles.contactMode}>
            <button
              type="button"
              className={styles.back}
              onClick={() => {
                setActiveThread(null);
                setSearch('');
              }}
            >
              <ArrowLeft size={14} />
              Back to chats
            </button>

            <div className={styles.selectedThread}>
              <ProviderIcon size={16} />
              <div>
                <small>
                  {providerLabel(activeThread.provider)}
                </small>
                <strong>
                  {activeThread.participant_label ||
                    'Selected chat'}
                </strong>
                {activeThread.last_activity_at ? (
                  <span>
                    Active{' '}
                    {relativeDate(
                      activeThread.last_activity_at,
                    )}
                  </span>
                ) : null}
              </div>
            </div>

            <label className={styles.search}>
              <Search size={15} />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search Network contacts"
                autoFocus
              />
            </label>

            <div className={styles.contactList}>
              {filteredContacts.map((contact) => (
                <button
                  type="button"
                  className={styles.contact}
                  key={contact.person_id}
                  onClick={() => void bind(contact)}
                  disabled={Boolean(busy)}
                >
                  <span className={styles.contactIcon}>
                    <UserRound size={15} />
                  </span>
                  <span className={styles.contactCopy}>
                    <strong>{contactName(contact)}</strong>
                    <small>
                      {[
                        contact?.employment?.role_title,
                        contact?.employment?.organisation_name,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Network contact'}
                    </small>
                  </span>
                  {busy === contact.person_id ? (
                    <LoaderCircle
                      size={14}
                      className={styles.spin}
                    />
                  ) : (
                    <span className={styles.linkLabel}>
                      Link
                    </span>
                  )}
                </button>
              ))}

              {!filteredContacts.length ? (
                <div className={styles.emptyContacts}>
                  <UserRound size={18} />
                  <strong>No matching Network contact</strong>
                  <span>
                    Add the person to Network first, then come back
                    and link the selected chat.
                  </span>
                  <a href={networkHref} onClick={onClose}>
                    Open Network
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={styles.threadMode}>
            {providerSuggestions.length ? (
              <section className={styles.providerSection}>
                <div className={styles.providerSectionHead}>
                  <div>
                    <small>GOOGLE / MICROSOFT</small>
                    <strong>Suggested Network matches</strong>
                  </div>
                  <span>
                    Exact matches only. You confirm every link.
                  </span>
                </div>

                <div className={styles.providerSuggestionList}>
                  {providerSuggestions.map((suggestion) => {
                    const busyKey =
                      suggestion.provider +
                      ':' +
                      suggestion.external_contact_id;
                    const ProviderContactIcon =
                      suggestion.provider === 'google'
                        ? Mail
                        : ContactRound;

                    return (
                      <article
                        className={styles.providerSuggestion}
                        key={busyKey}
                      >
                        <span className={styles.providerSuggestionIcon}>
                          <ProviderContactIcon size={15} />
                        </span>

                        <div className={styles.providerSuggestionCopy}>
                          <small>
                            {suggestion.provider === 'google'
                              ? 'GOOGLE CONTACT'
                              : 'MICROSOFT CONTACT'}
                            {' · '}
                            {suggestion.match_basis === 'exact_email'
                              ? 'EXACT EMAIL'
                              : 'EXACT NAME'}
                          </small>
                          <strong>
                            {suggestion.display_name ||
                              suggestion.email ||
                              'Provider contact'}
                          </strong>
                          <span>
                            {[
                              suggestion.email,
                              suggestion.provider_role_title,
                              suggestion.provider_organisation_name,
                            ]
                              .filter(Boolean)
                              .join(' · ') ||
                              'Provider contact'}
                          </span>
                        </div>

                        <div className={styles.providerRoute}>
                          <span>Network</span>
                          <strong>
                            {suggestion.suggested_person_name ||
                              'Network contact'}
                          </strong>
                          <small>
                            {[
                              suggestion.suggested_role_title,
                              suggestion.suggested_organisation_name,
                            ]
                              .filter(Boolean)
                              .join(' · ') ||
                              'Canonical Network identity'}
                          </small>
                        </div>

                        <button
                          type="button"
                          className={styles.confirmProvider}
                          onClick={() =>
                            void bindProviderSuggestion(suggestion)
                          }
                          disabled={Boolean(busy)}
                        >
                          {busy === busyKey ? (
                            <LoaderCircle
                              size={13}
                              className={styles.spin}
                            />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          Confirm
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {threads.length ? (
              <div className={styles.threadSectionHead}>
                <div>
                  <small>SELECTED CHATS</small>
                  <strong>Choose the right Network person</strong>
                </div>
              </div>
            ) : null}

            {threads.map((thread) => {
              const Icon =
                thread.provider === 'instagram'
                  ? Instagram
                  : MessageCircle;

              return (
                <button
                  type="button"
                  className={styles.thread}
                  key={
                    thread.provider +
                    ':' +
                    thread.external_thread_id
                  }
                  onClick={() => {
                    setSuccess('');
                    setActiveThread(thread);
                  }}
                >
                  <span className={styles.threadIcon}>
                    <Icon size={16} />
                  </span>
                  <span className={styles.threadCopy}>
                    <small>
                      {providerLabel(thread.provider)}
                    </small>
                    <strong>
                      {thread.participant_label ||
                        'Selected chat'}
                    </strong>
                    <span>
                      {thread.last_activity_at
                        ? 'Active ' +
                          relativeDate(
                            thread.last_activity_at,
                          )
                        : 'Selected for ReDream'}
                    </span>
                  </span>
                  <span className={styles.chooseLabel}>
                    Choose contact
                  </span>
                </button>
              );
            })}

            {!threads.length && !providerSuggestions.length ? (
              <div className={styles.complete}>
                <CheckCircle2 size={22} />
                <strong>Connected identities are resolved</strong>
                <span>
                  Future selected messages and eligible connected
                  email can now use the canonical Network identity
                  and current club.
                </span>
              </div>
            ) : null}
          </div>
        )}

        <footer className={styles.footer}>
          <span>
            ReDream never applies a provider contact suggestion
            automatically. Confirming identity does not send a
            message or create a person.
          </span>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
