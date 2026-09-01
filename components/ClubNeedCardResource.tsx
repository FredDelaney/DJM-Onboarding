'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Contact,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Save,
  X,
} from 'lucide-react';

import { djmRpc, friendlyError } from '@/lib/djm-os';
import styles from './ClubNeedCardResource.module.css';

type NeedLike = {
  id: string;
  organisation_id: string;
  organisation_name?: string | null;
  organisation_country?: string | null;
  organisation_league_name?: string | null;
  transfermarkt_url?: string | null;
  source_person_id?: string | null;
  source_person_name?: string | null;
  source_person_role?: string | null;
};

type ClubContact = {
  id: string;
  full_name?: string | null;
  role_title?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};

export function ClubNeedIdentity({ need }: { need: NeedLike }) {
  const [league, setLeague] = useState(need.organisation_league_name || '');
  const [country, setCountry] = useState(need.organisation_country || '');
  const [transfermarktUrl, setTransfermarktUrl] = useState(
    need.transfermarkt_url || '',
  );
  const [showEdit, setShowEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await djmRpc('djm_market_update_club_identity', {
        p_organisation_id: need.organisation_id,
        p_league_name: league.trim() || null,
        p_country: country.trim() || null,
        p_transfermarkt_url: transfermarktUrl.trim() || null,
      });
      setShowEdit(false);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.identity}>
      <strong>{need.organisation_name || 'Club'}</strong>

      <div className={styles.meta}>
        <span>{league || 'League not set'}</span>
        <span aria-hidden="true">·</span>
        <span>{country || 'Country not set'}</span>
      </div>

      <div className={styles.identityActions}>
        {transfermarktUrl ? (
          <a
            href={transfermarktUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.transfermarkt}
          >
            Transfermarkt
            <ExternalLink size={12} />
          </a>
        ) : (
          <span className={styles.missing}>Transfermarkt not set</span>
        )}

        <button
          type="button"
          className={styles.editMini}
          onClick={() => setShowEdit((value) => !value)}
        >
          <Pencil size={12} />
          {showEdit ? 'Close' : 'Edit club'}
        </button>
      </div>

      {showEdit ? (
        <form className={styles.inlinePanel} onSubmit={save}>
          <div className={styles.formGrid}>
            <label>
              League
              <input
                value={league}
                onChange={(event) => setLeague(event.target.value)}
                placeholder="A-League Men"
              />
            </label>

            <label>
              Country
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="New Zealand"
              />
            </label>
          </div>

          <label>
            Transfermarkt club URL
            <input
              type="url"
              value={transfermarktUrl}
              onChange={(event) => setTransfermarktUrl(event.target.value)}
              placeholder="https://www.transfermarkt.com/..."
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setShowEdit(false)}
            >
              <X size={13} />
              Cancel
            </button>
            <button type="submit" className={styles.save} disabled={busy}>
              <Save size={13} />
              {busy ? 'Saving...' : 'Save club'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function ClubNeedContactControl({ need }: { need: NeedLike }) {
  const [linkedPersonId, setLinkedPersonId] = useState(need.source_person_id || '');
  const [linkedName, setLinkedName] = useState(need.source_person_name || '');
  const [linkedRole, setLinkedRole] = useState(need.source_person_role || '');
  const [showForm, setShowForm] = useState(false);

  const [contacts, setContacts] = useState<ClubContact[]>([]);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [existingPersonId, setExistingPersonId] = useState(
    need.source_person_id || '',
  );

  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadExistingContacts = useCallback(async () => {
    setContactsBusy(true);
    setError('');

    try {
      const data: any = await djmRpc('djm_network_club_workspace', {
        p_organisation_id: need.organisation_id,
      });
      const nextContacts = Array.isArray(data?.contacts) ? data.contacts : [];
      setContacts(nextContacts);
      setExistingPersonId((current) => {
        if (current && nextContacts.some((contact: ClubContact) => contact.id === current)) {
          return current;
        }
        if (
          linkedPersonId &&
          nextContacts.some((contact: ClubContact) => contact.id === linkedPersonId)
        ) {
          return linkedPersonId;
        }
        return '';
      });
    } catch (loadError) {
      setContacts([]);
      setError(friendlyError(loadError));
    } finally {
      setContactsBusy(false);
    }
  }, [linkedPersonId, need.organisation_id]);

  useEffect(() => {
    if (!showForm) return;
    void loadExistingContacts();
  }, [loadExistingContacts, showForm]);

  const linkExisting = async () => {
    if (!existingPersonId) return;

    setBusy(true);
    setError('');

    try {
      const result: any = await djmRpc('djm_market_link_need_contact', {
        p_need_id: need.id,
        p_person_id: existingPersonId,
      });

      const selected = contacts.find((contact) => contact.id === existingPersonId);
      setLinkedPersonId(existingPersonId);
      setLinkedName(result?.full_name || selected?.full_name || 'Club contact');
      setLinkedRole(result?.role_title || selected?.role_title || '');
      setShowForm(false);
    } catch (linkError) {
      setError(friendlyError(linkError));
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) return;

    setBusy(true);
    setError('');

    try {
      const result: any = await djmRpc('djm_market_add_need_contact', {
        p_need_id: need.id,
        p_full_name: fullName.trim(),
        p_role_title: roleTitle.trim() || null,
        p_email: email.trim() || null,
        p_whatsapp: whatsapp.trim() || null,
      });

      setLinkedPersonId(result?.person_id || '');
      setLinkedName(result?.full_name || fullName.trim());
      setLinkedRole(result?.role_title || roleTitle.trim());
      setFullName('');
      setRoleTitle('');
      setEmail('');
      setWhatsapp('');
      setShowForm(false);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.contactControl}>
      <div className={styles.contactRow}>
        <Contact size={14} />
        <div className={styles.contactCopy}>
          {linkedName ? (
            <>
              <strong>{linkedName}</strong>
              <span>{linkedRole || 'Club contact'}</span>
            </>
          ) : (
            <>
              <strong>No club contact linked</strong>
              <span>Link someone already in Network or create a new contact.</span>
            </>
          )}
        </div>

        <button
          type="button"
          className={styles.contactAction}
          onClick={() => setShowForm((value) => !value)}
        >
          <Plus size={12} />
          {linkedName ? 'Add / change' : 'Add club contact'}
        </button>
      </div>

      {showForm ? (
        <form className={styles.inlinePanel} onSubmit={save}>
          <div className={styles.existingContactBlock}>
            <div className={styles.sectionHeading}>
              <strong>Use an existing club contact</strong>
              <span>Select someone already saved against this club in DJM Network.</span>
            </div>

            {contactsBusy ? (
              <p className={styles.helper}>Loading club contacts...</p>
            ) : contacts.length ? (
              <div className={styles.existingLinkRow}>
                <label>
                  Existing contact
                  <select
                    value={existingPersonId}
                    onChange={(event) => setExistingPersonId(event.target.value)}
                  >
                    <option value="">Choose a club contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.full_name || 'Unnamed contact'}
                        {contact.role_title ? ` · ${contact.role_title}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className={styles.save}
                  disabled={busy || !existingPersonId}
                  onClick={() => void linkExisting()}
                >
                  <Link2 size={13} />
                  {busy ? 'Linking...' : 'Link contact'}
                </button>
              </div>
            ) : (
              <p className={styles.helper}>
                No existing contacts are saved against this club yet.
              </p>
            )}
          </div>

          <div className={styles.divider}>
            <span>or create a new contact</span>
          </div>

          <div className={styles.formGrid}>
            <label>
              Name
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Chris Greenacre"
              />
            </label>

            <label>
              Role
              <input
                value={roleTitle}
                onChange={(event) => setRoleTitle(event.target.value)}
                placeholder="Assistant Coach"
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@club.com"
              />
            </label>

            <label>
              WhatsApp
              <input
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="+64..."
              />
            </label>
          </div>

          <p className={styles.helper}>
            Creating a new person adds or updates them in DJM Network, links them
            to this club, and attaches them to this specific recruitment need.
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setShowForm(false)}
            >
              <X size={13} />
              Cancel
            </button>
            <button
              type="submit"
              className={styles.save}
              disabled={busy || !fullName.trim()}
            >
              <Save size={13} />
              {busy ? 'Saving...' : 'Create and link'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
