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
import { bootstrapSelectedInstagramHistory } from '@/lib/connected-messaging';

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
  participant_username?: string | null;
  participant_name?: string | null;
  participant_identity_source?: string | null;
  is_selected: boolean;
  last_activity_at?: string | null;
  bound_person_id?: string | null;
  bound_player_id?: string | null;
  bound_prospect_id?: string | null;
};

type PlayerIdentity = {
  player_id: string;
  player_name?: string | null;
  primary_position?: string | null;
  current_club?: string | null;
  instagram_url?: string | null;
  instagram_handle?: string | null;
};

type ProspectIdentity = {
  prospect_id: string;
  prospect_name?: string | null;
  primary_position?: string | null;
  current_club?: string | null;
  recruitment_stage?: string | null;
  instagram_url?: string | null;
  instagram_handle?: string | null;
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

const providerNameForPrefill = (thread: Thread | null) => {
  if (!thread) return '';
  const name = String(thread.participant_name || '').trim();
  const handle = String(
    thread.participant_username ||
      thread.participant_label ||
      '',
  )
    .trim()
    .replace(/^@+/, '');

  if (name.length < 2 || name.length > 100) return '';
  if (name.toLowerCase() === handle.toLowerCase()) return '';
  if (!/[a-z]/i.test(name)) return '';
  return name;
};

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
  presentation = 'drawer',
}: {
  workspaceSlug: string;
  networkHref: string;
  onClose: () => void;
  onResolved?: () => Promise<void> | void;
  presentation?: 'drawer' | 'page';
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [providerSuggestions, setProviderSuggestions] =
    useState<ProviderSuggestion[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [players, setPlayers] = useState<PlayerIdentity[]>([]);
  const [prospects, setProspects] = useState<ProspectIdentity[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [createProspectOpen, setCreateProspectOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    full_name: '',
    club_name: '',
    role_title: '',
    country: '',
  });
  const [newProspect, setNewProspect] = useState({
    full_name: '',
    current_club: '',
    primary_position: '',
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        instagram,
        whatsapp,
        relationships,
        providerIdentity,
        playerIdentity,
        prospectIdentity,
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
          platformRpc<{
            players?: PlayerIdentity[];
          }>(
            'redream_messaging_player_candidates',
            {},
            workspaceSlug,
          ),
          platformRpc<{
            prospects?: ProspectIdentity[];
          }>(
            'redream_messaging_prospect_candidates',
            {},
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
            !thread.bound_person_id &&
            !thread.bound_player_id &&
            !thread.bound_prospect_id,
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
      setPlayers(
        Array.isArray(playerIdentity?.players)
          ? playerIdentity.players
          : [],
      );
      setProspects(
        Array.isArray(prospectIdentity?.prospects)
          ? prospectIdentity.prospects
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
        setCreateContactOpen(false);
        setCreateProspectOpen(false);
        setNewProspect({
          full_name: '',
          current_club: '',
          primary_position: '',
        });
        setNewContact({
          full_name: '',
          club_name: '',
          role_title: '',
          country: '',
        });
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

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const threadHandle =
      activeThread?.provider === 'instagram'
        ? String(activeThread?.participant_label || '')
            .trim()
            .toLowerCase()
        : '';

    return players
      .filter((player) => {
        if (!query) return true;

        return [
          player.player_name,
          player.primary_position,
          player.current_club,
          player.instagram_handle,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const aExact =
          Boolean(threadHandle) &&
          String(a.instagram_handle || '').toLowerCase() ===
            threadHandle;
        const bExact =
          Boolean(threadHandle) &&
          String(b.instagram_handle || '').toLowerCase() ===
            threadHandle;

        if (aExact !== bExact) return aExact ? -1 : 1;

        return String(a.player_name || '').localeCompare(
          String(b.player_name || ''),
        );
      })
      .slice(0, 50);
  }, [activeThread, players, search]);

  const filteredProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const threadHandle =
      activeThread?.provider === 'instagram'
        ? String(activeThread?.participant_label || '')
            .trim()
            .replace(/^@+/, '')
            .toLowerCase()
        : '';

    return prospects
      .filter((prospect) => {
        if (!query) return true;

        return [
          prospect.prospect_name,
          prospect.primary_position,
          prospect.current_club,
          prospect.instagram_handle,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const aExact =
          Boolean(threadHandle) &&
          String(a.instagram_handle || '')
            .replace(/^@+/, '')
            .toLowerCase() === threadHandle;
        const bExact =
          Boolean(threadHandle) &&
          String(b.instagram_handle || '')
            .replace(/^@+/, '')
            .toLowerCase() === threadHandle;

        if (aExact !== bExact) return aExact ? -1 : 1;

        return String(a.prospect_name || '').localeCompare(
          String(b.prospect_name || ''),
        );
      })
      .slice(0, 50);
  }, [activeThread, prospects, search]);

  const bootstrapHistory = async (thread: Thread) => {
    if (thread.provider !== 'instagram') {
      return {
        attempted: false,
        ok: true,
        imported: 0,
      };
    }

    try {
      const result = await bootstrapSelectedInstagramHistory(
        workspaceSlug,
        thread.external_thread_id,
      );

      return {
        attempted: true,
        ok: Boolean(result?.ok),
        imported: Number(result?.messages_imported || 0),
      };
    } catch {
      return {
        attempted: true,
        ok: false,
        imported: 0,
      };
    }
  };

  const historySuffix = (
    result: {
      attempted: boolean;
      ok: boolean;
      imported: number;
    },
  ) => {
    if (!result.attempted) return '';
    if (!result.ok) {
      return ' Identity saved. Recent Instagram history could not be imported yet.';
    }
    if (result.imported > 0) {
      return (
        ' ' +
        result.imported +
        ' recent Instagram ' +
        (result.imported === 1 ? 'message' : 'messages') +
        ' added to Agency Memory.'
      );
    }
    return ' Recent Instagram history checked.';
  };

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
      const history = await bootstrapHistory(linkedThread);

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
          '.' +
          historySuffix(history),
      );

      await onResolved?.();
    } catch (bindError) {
      setError(friendlyError(bindError));
    } finally {
      setBusy('');
    }
  };

  const bindPlayer = async (player: PlayerIdentity) => {
    if (!activeThread || busy) return;

    const busyKey = `player:${player.player_id}`;
    setBusy(busyKey);
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        bound?: boolean;
        bound_player_name?: string | null;
      }>(
        'redream_messaging_thread_bind_player',
        {
          p_provider: activeThread.provider,
          p_external_thread_id:
            activeThread.external_thread_id,
          p_player_id: player.player_id,
        },
        workspaceSlug,
      );

      if (!result?.bound) {
        throw new Error(
          'The chat could not be linked to that player.',
        );
      }

      const linkedThread = activeThread;
      const linkedName =
        result.bound_player_name ||
        player.player_name ||
        'Player';
      const history = await bootstrapHistory(linkedThread);

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
          ' linked to player ' +
          linkedName +
          '.' +
          historySuffix(history),
      );

      await onResolved?.();
    } catch (bindError) {
      setError(friendlyError(bindError));
    } finally {
      setBusy('');
    }
  };

  const bindProspect = async (prospect: ProspectIdentity) => {
    if (!activeThread || busy) return;

    const busyKey = `prospect:${prospect.prospect_id}`;
    setBusy(busyKey);
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        bound?: boolean;
        bound_prospect_name?: string | null;
      }>(
        'redream_messaging_thread_bind_prospect',
        {
          p_provider: activeThread.provider,
          p_external_thread_id: activeThread.external_thread_id,
          p_prospect_id: prospect.prospect_id,
        },
        workspaceSlug,
      );

      if (!result?.bound) {
        throw new Error(
          'The chat could not be linked to that recruitment target.',
        );
      }

      const linkedThread = activeThread;
      const linkedName =
        result.bound_prospect_name ||
        prospect.prospect_name ||
        'Recruitment target';
      const history = await bootstrapHistory(linkedThread);

      setThreads((current) =>
        current.filter(
          (thread) =>
            !(
              thread.provider === linkedThread.provider &&
              thread.external_thread_id === linkedThread.external_thread_id
            ),
        ),
      );
      setActiveThread(null);
      setSearch('');
      setSuccess(
        (linkedThread.participant_label || 'Chat') +
          ' linked to recruitment target ' +
          linkedName +
          '.' +
          historySuffix(history),
      );

      await onResolved?.();
    } catch (bindError) {
      setError(friendlyError(bindError));
    } finally {
      setBusy('');
    }
  };

  const createAndBindProspect = async () => {
    if (!activeThread || busy) return;

    const fullName = newProspect.full_name.trim();

    if (fullName.length < 2) {
      setError('Enter the player’s full name before creating the recruitment target.');
      return;
    }

    setBusy('create-prospect');
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        created?: boolean;
        bound?: boolean;
        prospect_id?: string | null;
        prospect_name?: string | null;
      }>(
        'redream_messaging_thread_create_prospect_and_bind',
        {
          p_provider: activeThread.provider,
          p_external_thread_id: activeThread.external_thread_id,
          p_full_name: fullName,
          p_current_club: newProspect.current_club.trim() || null,
          p_primary_position: newProspect.primary_position.trim() || null,
          p_current_country: null,
        },
        workspaceSlug,
      );

      if (!result?.created || !result?.bound) {
        throw new Error(
          'The recruitment target could not be created and linked.',
        );
      }

      const linkedThread = activeThread;
      const linkedName = result.prospect_name || fullName;
      const history = await bootstrapHistory(linkedThread);

      setThreads((current) =>
        current.filter(
          (thread) =>
            !(
              thread.provider === linkedThread.provider &&
              thread.external_thread_id === linkedThread.external_thread_id
            ),
        ),
      );
      setActiveThread(null);
      setSearch('');
      setCreateProspectOpen(false);
      setNewProspect({
        full_name: '',
        current_club: '',
        primary_position: '',
      });
      setSuccess(
        linkedName +
          ' added to Recruitment and linked to this chat.' +
          historySuffix(history),
      );

      await onResolved?.();
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setBusy('');
    }
  };

  const createAndBindContact = async () => {
    if (!activeThread || busy) return;

    const fullName = newContact.full_name.trim();

    if (fullName.length < 2) {
      setError('Enter the person’s full name before creating the Network contact.');
      return;
    }

    setBusy('create-contact');
    setError('');
    setSuccess('');

    try {
      const result = await platformRpc<{
        created?: boolean;
        bound?: boolean;
        reason?: string | null;
        person_id?: string | null;
        person_name?: string | null;
        existing_person_id?: string | null;
        existing_person_name?: string | null;
      }>(
        'redream_messaging_thread_create_contact_and_bind',
        {
          p_provider: activeThread.provider,
          p_external_thread_id: activeThread.external_thread_id,
          p_full_name: fullName,
          p_club_name: newContact.club_name.trim() || null,
          p_role_title: newContact.role_title.trim() || null,
          p_country: newContact.country.trim() || null,
        },
        workspaceSlug,
      );

      if (result?.reason === 'network_person_already_exists') {
        const existingName =
          result.existing_person_name || fullName;

        setCreateContactOpen(false);
        setSearch(existingName);
        setError(
          existingName +
            ' already exists in Network. Choose that existing person instead of creating a duplicate.',
        );
        return;
      }

      if (!result?.created || !result?.bound) {
        throw new Error(
          'The Network person could not be created and linked to this chat.',
        );
      }

      const linkedThread = activeThread;
      const linkedName = result.person_name || fullName;
      const history = await bootstrapHistory(linkedThread);

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
      setCreateContactOpen(false);
      setNewContact({
        full_name: '',
        club_name: '',
        role_title: '',
        country: '',
      });
      setSuccess(
        linkedName +
          ' added to Network and linked to ' +
          (linkedThread.participant_label || 'the selected chat') +
          '.' +
          historySuffix(history),
      );

      await onResolved?.();
    } catch (createError) {
      setError(friendlyError(createError));
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

  const pageMode = presentation === 'page';

  return (
    <div
      className={pageMode ? styles.pageShell : styles.backdrop}
      role="presentation"
      onMouseDown={pageMode ? undefined : onClose}
    >
      <aside
        className={`${styles.drawer} ${pageMode ? styles.pagePanel : ''}`}
        role={pageMode ? 'region' : 'dialog'}
        aria-modal={pageMode ? undefined : true}
        aria-label="Resolve connected identities"
        onMouseDown={pageMode ? undefined : (event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <small>CONNECTED WORK</small>
            <h2>
              {activeThread
                ? 'Choose the right identity'
                : 'Resolve connected identities'}
            </h2>
            <p>
              {activeThread
                ? activeThread.provider === 'instagram'
                  ? 'Instagram is normally player communication. Start with a signed player or Recruitment target, and use Network when this DM is actually a club or football contact.'
                  : 'WhatsApp is normally club and football contact communication. Start with Network, or use a signed player when the chat is actually with the player.'
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
            aria-label={pageMode ? 'Back to Connections' : 'Close identity resolution'}
          >
            {pageMode ? <ArrowLeft size={17} /> : <X size={17} />}
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
            Loading connected identities
          </div>
        ) : activeThread ? (
          <div className={styles.contactMode}>
            <button
              type="button"
              className={styles.back}
              onClick={() => {
                setActiveThread(null);
                setSearch('');
                setCreateContactOpen(false);
                setCreateProspectOpen(false);
                setNewProspect({
                  full_name: '',
                  current_club: '',
                  primary_position: '',
                });
                setNewContact({
                  full_name: '',
                  club_name: '',
                  role_title: '',
                  country: '',
                });
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
                  {activeThread.participant_username ||
                    activeThread.participant_label ||
                    (activeThread.provider === 'instagram'
                      ? 'Instagram DM'
                      : 'WhatsApp chat')}
                </strong>
                {providerNameForPrefill(activeThread) ? (
                  <span>
                    {providerNameForPrefill(activeThread)} · {providerLabel(activeThread.provider)} profile
                  </span>
                ) : null}
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
                placeholder={
                  activeThread.provider === 'instagram'
                    ? 'Search signed players, targets or Network people'
                    : 'Search Network people, players or targets'
                }
                autoFocus
              />
            </label>

            <div className={styles.identityGroups}>
              <section
                className={styles.identityGroup}
                style={{ order: activeThread.provider === 'instagram' ? 1 : 2 }}
              >
                <div className={styles.identityGroupHead}>
                  <div>
                    <small>{activeThread.provider === 'instagram' ? 'START HERE · OUR PLAYERS' : 'OUR PLAYERS'}</small>
                    <strong>Signed players</strong>
                  </div>
                  <span>{filteredPlayers.length}</span>
                </div>

                <div className={styles.contactList}>
                  {filteredPlayers.map((player) => {
                    const exactHandle =
                      activeThread.provider === 'instagram' &&
                      Boolean(activeThread.participant_label) &&
                      String(player.instagram_handle || '')
                        .toLowerCase() ===
                        String(activeThread.participant_label || '')
                          .trim()
                          .toLowerCase();
                    const busyKey = `player:${player.player_id}`;

                    return (
                      <button
                        type="button"
                        className={
                          exactHandle
                            ? styles.playerExact
                            : styles.contact
                        }
                        key={player.player_id}
                        onClick={() => void bindPlayer(player)}
                        disabled={Boolean(busy)}
                      >
                        <span className={styles.contactIcon}>
                          <UserRound size={15} />
                        </span>
                        <span className={styles.contactCopy}>
                          <strong>
                            {player.player_name || 'Player'}
                          </strong>
                          <small>
                            {[
                              player.primary_position,
                              player.current_club,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Signed player'}
                          </small>
                          {exactHandle ? (
                            <em className={styles.exactHandle}>
                              Exact Instagram handle
                            </em>
                          ) : null}
                        </span>
                        {busy === busyKey ? (
                          <LoaderCircle
                            size={14}
                            className={styles.spin}
                          />
                        ) : (
                          <span className={styles.linkLabel}>
                            {exactHandle ? 'Confirm' : 'Link'}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {!filteredPlayers.length ? (
                    <div className={styles.groupEmpty}>
                      No signed player matches this search.
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                className={styles.identityGroup}
                style={{ order: activeThread.provider === 'instagram' ? 2 : 3 }}
              >
                <div className={styles.identityGroupHead}>
                  <div>
                    <small>RECRUITMENT</small>
                    <strong>Targets not signed yet</strong>
                  </div>
                  <span>{filteredProspects.length}</span>
                </div>

                <div className={styles.contactList}>
                  {filteredProspects.map((prospect) => {
                    const threadHandle = String(
                      activeThread.participant_label || '',
                    )
                      .trim()
                      .replace(/^@+/, '')
                      .toLowerCase();
                    const exactHandle =
                      activeThread.provider === 'instagram' &&
                      Boolean(threadHandle) &&
                      String(prospect.instagram_handle || '')
                        .replace(/^@+/, '')
                        .toLowerCase() === threadHandle;
                    const busyKey = `prospect:${prospect.prospect_id}`;

                    return (
                      <button
                        type="button"
                        className={
                          exactHandle ? styles.playerExact : styles.contact
                        }
                        key={prospect.prospect_id}
                        onClick={() => void bindProspect(prospect)}
                        disabled={Boolean(busy)}
                      >
                        <span className={styles.contactIcon}>
                          <UserRound size={15} />
                        </span>
                        <span className={styles.contactCopy}>
                          <strong>
                            {prospect.prospect_name || 'Recruitment target'}
                          </strong>
                          <small>
                            {[
                              prospect.primary_position,
                              prospect.current_club,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Recruitment target'}
                          </small>
                          {exactHandle ? (
                            <em className={styles.exactHandle}>
                              Exact Instagram handle
                            </em>
                          ) : null}
                        </span>
                        {busy === busyKey ? (
                          <LoaderCircle
                            size={14}
                            className={styles.spin}
                          />
                        ) : (
                          <span className={styles.linkLabel}>
                            {exactHandle ? 'Confirm' : 'Link'}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {!filteredProspects.length ? (
                    <div className={styles.groupEmpty}>
                      No recruitment target matches this search.
                    </div>
                  ) : null}
                </div>

                <div className={styles.createContactArea}>
                  {!createProspectOpen ? (
                    <button
                      type="button"
                      className={styles.createContactStart}
                      onClick={() => {
                        setError('');
                        setNewProspect((current) => ({
                          ...current,
                          full_name:
                            current.full_name ||
                            providerNameForPrefill(activeThread),
                        }));
                        setCreateProspectOpen(true);
                      }}
                      disabled={Boolean(busy)}
                    >
                      <UserRound size={15} />
                      <span>
                        <strong>Not in Recruitment?</strong>
                        <small>Create target and link this chat</small>
                      </span>
                    </button>
                  ) : (
                    <form
                      className={styles.createContactForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createAndBindProspect();
                      }}
                    >
                      <div className={styles.createContactHead}>
                        <div>
                          <small>NEW RECRUITMENT TARGET</small>
                          <strong>Create from this player chat</strong>
                        </div>
                        <span>
                          {activeThread.provider === 'instagram'
                            ? '@' +
                              String(activeThread.participant_label || '')
                                .replace(/^@+/, '')
                            : activeThread.participant_label || 'Player chat'}
                        </span>
                      </div>

                      <label>
                        <span>Player name *</span>
                        <input
                          required
                          value={newProspect.full_name}
                          onChange={(event) =>
                            setNewProspect((current) => ({
                              ...current,
                              full_name: event.target.value,
                            }))
                          }
                          placeholder="Full name"
                          autoComplete="off"
                        />
                      </label>

                      <div className={styles.createContactPair}>
                        <label>
                          <span>Club</span>
                          <input
                            value={newProspect.current_club}
                            onChange={(event) =>
                              setNewProspect((current) => ({
                                ...current,
                                current_club: event.target.value,
                              }))
                            }
                            placeholder="Optional"
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          <span>Position</span>
                          <input
                            value={newProspect.primary_position}
                            onChange={(event) =>
                              setNewProspect((current) => ({
                                ...current,
                                primary_position: event.target.value,
                              }))
                            }
                            placeholder="Optional"
                            autoComplete="off"
                          />
                        </label>
                      </div>

                      <div className={styles.createContactActions}>
                        <button
                          type="button"
                          className={styles.createContactCancel}
                          onClick={() => {
                            setCreateProspectOpen(false);
                            setNewProspect({
                              full_name: '',
                              current_club: '',
                              primary_position: '',
                            });
                          }}
                          disabled={Boolean(busy)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={styles.createContactSubmit}
                          disabled={Boolean(busy)}
                        >
                          {busy === 'create-prospect' ? (
                            <LoaderCircle
                              size={14}
                              className={styles.spin}
                            />
                          ) : null}
                          Create & link
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>

              <section
                className={styles.identityGroup}
                style={{ order: activeThread.provider === 'whatsapp' ? 1 : 3 }}
              >
                <div className={styles.identityGroupHead}>
                  <div>
                    <small>{activeThread.provider === 'whatsapp' ? 'START HERE · NETWORK' : 'NETWORK'}</small>
                    <strong>Club and football contacts</strong>
                  </div>
                  <span>{filteredContacts.length}</span>
                </div>

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
                    <div className={styles.groupEmpty}>
                      No existing Network person matches this search.
                    </div>
                  ) : null}
                </div>

                <div className={styles.createContactArea}>
                  {!createContactOpen ? (
                    <button
                      type="button"
                      className={styles.createContactStart}
                      onClick={() => {
                        setError('');
                        setNewContact((current) => ({
                          ...current,
                          full_name:
                            current.full_name ||
                            providerNameForPrefill(activeThread),
                        }));
                        setCreateContactOpen(true);
                      }}
                      disabled={Boolean(busy)}
                    >
                      <ContactRound size={15} />
                      <span>
                        <strong>Not in Network?</strong>
                        <small>Create person and link this chat</small>
                      </span>
                    </button>
                  ) : (
                    <form
                      className={styles.createContactForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createAndBindContact();
                      }}
                    >
                      <div className={styles.createContactHead}>
                        <div>
                          <small>NEW NETWORK PERSON</small>
                          <strong>Create from this selected chat</strong>
                        </div>
                        <span>
                          {activeThread.provider === 'instagram'
                            ? '@' +
                              String(
                                activeThread.participant_label || '',
                              ).replace(/^@+/, '')
                            : activeThread.participant_label ||
                              providerLabel(activeThread.provider)}
                        </span>
                      </div>

                      <label>
                        <span>Full name *</span>
                        <input
                          required
                          value={newContact.full_name}
                          onChange={(event) =>
                            setNewContact((current) => ({
                              ...current,
                              full_name: event.target.value,
                            }))
                          }
                          placeholder="e.g. Aaron Lewis"
                          autoComplete="off"
                        />
                      </label>

                      <div className={styles.createContactPair}>
                        <label>
                          <span>Club</span>
                          <input
                            value={newContact.club_name}
                            onChange={(event) => {
                              const clubName = event.target.value;
                              setNewContact((current) => ({
                                ...current,
                                club_name: clubName,
                                role_title: clubName.trim()
                                  ? current.role_title
                                  : '',
                              }));
                            }}
                            placeholder="Optional"
                            autoComplete="off"
                          />
                        </label>

                        {newContact.club_name.trim() ? (
                          <label>
                            <span>Role</span>
                            <input
                              value={newContact.role_title}
                              onChange={(event) =>
                                setNewContact((current) => ({
                                  ...current,
                                  role_title: event.target.value,
                                }))
                              }
                              placeholder="Optional"
                              autoComplete="off"
                            />
                          </label>
                        ) : null}
                      </div>

                      <label>
                        <span>Country</span>
                        <input
                          value={newContact.country}
                          onChange={(event) =>
                            setNewContact((current) => ({
                              ...current,
                              country: event.target.value,
                            }))
                          }
                          placeholder="Optional"
                          autoComplete="off"
                        />
                      </label>

                      <p>
                        ReDream will create this person in Network,
                        preserve the conversation identity and link the
                        chat. Nothing is sent externally.
                      </p>

                      <div className={styles.createContactActions}>
                        <button
                          type="button"
                          className={styles.createContactCancel}
                          onClick={() => {
                            setCreateContactOpen(false);
                            setError('');
                          }}
                          disabled={Boolean(busy)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={styles.createContactConfirm}
                          disabled={
                            Boolean(busy) ||
                            newContact.full_name.trim().length < 2
                          }
                        >
                          {busy === 'create-contact' ? (
                            <LoaderCircle
                              size={14}
                              className={styles.spin}
                            />
                          ) : (
                            <ContactRound size={14} />
                          )}
                          Create and link
                        </button>
                      </div>
                    </form>
                  )}

                  <a
                    className={styles.openNetworkLink}
                    href={networkHref}
                    onClick={onClose}
                  >
                    Open full Network
                  </a>
                </div>
              </section>
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
                  <small>IDENTITY CONFIRMATION</small>
                  <strong>Confirm who each conversation belongs to</strong>
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
                    setError('');
                    setSearch('');
                    setCreateContactOpen(false);
                    setCreateProspectOpen(false);
                    setNewProspect({
                      full_name: '',
                      current_club: '',
                      primary_position: '',
                    });
                    setNewContact({
                      full_name: '',
                      club_name: '',
                      role_title: '',
                      country: '',
                    });
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
                      {thread.participant_username ||
                        thread.participant_label ||
                        (thread.provider === 'instagram'
                          ? 'Instagram DM'
                          : 'WhatsApp chat')}
                    </strong>
                    <span>
                      {providerNameForPrefill(thread)
                        ? providerNameForPrefill(thread) + ' · ' +
                          (thread.last_activity_at
                            ? 'Active ' + relativeDate(thread.last_activity_at)
                            : 'Selected for ReDream')
                        : thread.last_activity_at
                          ? 'Active ' + relativeDate(thread.last_activity_at)
                          : 'Selected for ReDream'}
                    </span>
                  </span>
                  <span className={styles.chooseLabel}>
                    Choose identity
                  </span>
                </button>
              );
            })}

            {!threads.length && !providerSuggestions.length ? (
              <div className={styles.complete}>
                <CheckCircle2 size={22} />
                <strong>Connected identities are resolved</strong>
                <span>
                  Future messages follow the identity you confirmed: signed player, Recruitment target, or Network person. Personal selected chats remain private to the agent who connected them.
                </span>
              </div>
            ) : null}
          </div>
        )}

        <footer className={styles.footer}>
          <span>
            ReDream never applies an identity suggestion automatically.
            Existing matches are confirmed explicitly. A new Network
            person is created only when you choose Create and link.
            Nothing here sends an external message.
          </span>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
