'use client';

import { FormEvent, useState } from 'react';
import {
  Contact,
  ExternalLink,
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
  const [linkedName, setLinkedName] = useState(need.source_person_name || '');
  const [linkedRole, setLinkedRole] = useState(need.source_person_role || '');
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
              <span>Add the person who owns or supplied this need.</span>
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
          <div className={styles.formGrid}>
            <label>
              Name
              <input
                required
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
            Saving creates or updates the Network contact, links the contact to
            this club, and attaches them to this specific recruitment need.
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
            <button type="submit" className={styles.save} disabled={busy}>
              <Save size={13} />
              {busy ? 'Saving...' : 'Save contact'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
