'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Instagram,
  LoaderCircle,
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
  platformRpc,
  relativeDate,
} from '@/lib/platform-client';

import styles from './AgencyConnectedIdentityResolverDrawer.module.css';

type Provider = 'instagram' | 'whatsapp';

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
      const [instagram, whatsapp, relationships] =
        await Promise.all([
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

  const remaining = threads.length;
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
        aria-label="Link selected chats"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <small>CONNECTED WORK</small>
            <h2>
              {activeThread
                ? 'Choose the right contact'
                : 'Link selected chats'}
            </h2>
            <p>
              {activeThread
                ? 'Use the agency Network as the identity source. ReDream will use the person and their current club for future selected messages.'
                : remaining
                  ? remaining +
                    ' selected ' +
                    (remaining === 1 ? 'chat needs' : 'chats need') +
                    ' a Network identity.'
                  : 'Every selected chat currently has a Network identity.'}
            </p>
          </div>

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close chat linking"
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
            Loading selected chats and Network contacts
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

            {!threads.length ? (
              <div className={styles.complete}>
                <CheckCircle2 size={22} />
                <strong>Selected chats are linked</strong>
                <span>
                  Future selected messages can now use the canonical
                  Network identity and current club.
                </span>
              </div>
            ) : null}
          </div>
        )}

        <footer className={styles.footer}>
          <span>
            Only selected chats are shown here. Linking does not send
            a message or create a person automatically.
          </span>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
