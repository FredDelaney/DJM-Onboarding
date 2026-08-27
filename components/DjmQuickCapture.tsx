'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  FileUp,
  MessageCircleMore,
  Paperclip,
  Plus,
  Target,
  UserPlus,
  X,
} from 'lucide-react';

import { djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';

type Mode = 'capture' | 'recruitment' | 'need';

export default function DjmQuickCapture() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('capture');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [channel, setChannel] = useState('whatsapp');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [personId, setPersonId] = useState('');
  const [organisationId, setOrganisationId] = useState('');

  const [transfermarktUrl, setTransfermarktUrl] = useState('');
  const [priority, setPriority] = useState('3');
  const [playerNotes, setPlayerNotes] = useState('');

  const [needClubId, setNeedClubId] = useState('');
  const [needText, setNeedText] = useState('');

  const [contacts, setContacts] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);

  useEffect(() => {
    if (!open || contacts.length || clubs.length) return;
    void Promise.all([
      djmRpc<any[]>('djm_network_club_contacts', { p_search: null, p_limit: 300 }),
      djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 300 }),
    ])
      .then(([people, organisations]) => {
        setContacts(people || []);
        setClubs((organisations || []).filter((org: any) => org.organisation_type === 'club'));
      })
      .catch(() => {
        // Manual attachment is a fallback. Smart capture still works without these lists.
      });
  }, [open, contacts.length, clubs.length]);

  const selectedPerson = useMemo(
    () => contacts.find((person) => person.id === personId) || null,
    [contacts, personId],
  );

  const reset = () => {
    setText('');
    setFile(null);
    setPersonId('');
    setOrganisationId('');
    setTransfermarktUrl('');
    setPriority('3');
    setPlayerNotes('');
    setNeedClubId('');
    setNeedText('');
    setMessage('');
  };

  const close = () => {
    reset();
    setOpen(false);
    setMode('capture');
  };

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && !file) || busy) return;
    setBusy(true);
    setMessage('');

    try {
      let payload: any;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('channel', channel);
        if (text.trim()) form.append('text', text.trim());
        if (personId) form.append('person_id', personId);
        if (organisationId) form.append('organisation_id', organisationId);
        payload = await djmInvoke('djm-network-capture', form);
      } else {
        payload = await djmInvoke('djm-network-capture', {
          text: text.trim(),
          channel,
          person_id: personId || null,
          organisation_id: organisationId || null,
          occurred_at: new Date().toISOString(),
        });
      }

      const result = payload?.note_result || payload?.result || payload || {};
      const linked = [result.resolved_person_name, result.resolved_organisation_name]
        .filter(Boolean)
        .join(' · ');
      const created = [
        result.position ? `${result.position} need detected` : '',
        result.task_id ? 'follow-up created' : '',
      ].filter(Boolean).join(' · ');

      setMessage(
        [
          file ? 'Saved file.' : 'Captured.',
          linked ? `Linked to ${linked}.` : 'DJM will keep it in context and review only if needed.',
          created ? `${created}.` : '',
          result.needs_review ? 'Needs a quick review.' : '',
        ].filter(Boolean).join(' '),
      );
      setText('');
      setFile(null);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitRecruitment = async (event: FormEvent) => {
    event.preventDefault();
    if (!transfermarktUrl.trim() || busy) return;
    setBusy(true);
    setMessage('');

    try {
      const quick: any = await djmRpc('djm_recruitment_quick_add', {
        p_transfermarkt_url: transfermarktUrl.trim(),
        p_priority: Number(priority || 3),
        p_notes: playerNotes.trim() || null,
      });

      let enrichment: any = null;
      if (quick?.prospect_id) {
        try {
          enrichment = await djmInvoke('djm-transfermarkt-enrich', {
            prospect_id: quick.prospect_id,
            url: transfermarktUrl.trim(),
          });
        } catch {
          // The URL is already queued by the database trigger.
        }
      }

      setMessage(
        `${quick?.derived_name || 'Player'} ${quick?.created ? 'added' : 'updated'} in Recruitment. ${
          enrichment?.blocked
            ? 'Transfermarkt verification is queued.'
            : enrichment
              ? 'Profile enriched.'
              : 'Transfermarkt verification is queued.'
        }`,
      );
      setTransfermarktUrl('');
      setPlayerNotes('');
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!needClubId || !needText.trim() || busy) return;
    setBusy(true);
    setMessage('');

    try {
      const result: any = await djmRpc('djm_market_create_need_from_text', {
        p_organisation_id: needClubId,
        p_text: needText.trim(),
        p_source_person_id: null,
      });
      const parsed = result?.parsed || {};
      const club = clubs.find((item) => item.id === needClubId)?.name || 'club';
      setMessage(
        `Need added for ${club}: ${parsed.position || 'position'}${
          parsed.preferred_foot ? ` · ${parsed.preferred_foot} foot` : ''
        }${parsed.max_age ? ` · max age ${parsed.max_age}` : ''}${
          parsed.transfer_type ? ` · ${String(parsed.transfer_type).replaceAll('_', ' ')}` : ''
        }. Matching is automatic.`,
      );
      setNeedText('');
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="djm-os-capture-trigger"
        onClick={() => setOpen(true)}
        aria-label="Add to DJM"
      >
        <Plus size={16} />
        <span>Add</span>
      </button>

      {open ? (
        <div className="djm-os-search-overlay" onMouseDown={close}>
          <div className="djm-os-capture-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="djm-os-capture-head">
              <div>
                <strong>Add to DJM</strong>
                <p>Give DJM the raw information. The system should do the admin.</p>
              </div>
              <button type="button" onClick={close}><X size={17} /></button>
            </div>

            <div className="djm-os-capture-body">
              <div className="djm-os-button-row" style={{ flexWrap: 'wrap' }}>
                <ModeButton active={mode === 'capture'} onClick={() => { setMode('capture'); setMessage(''); }} icon={<MessageCircleMore size={15} />} label="Conversation" />
                <ModeButton active={mode === 'recruitment'} onClick={() => { setMode('recruitment'); setMessage(''); }} icon={<UserPlus size={15} />} label="Recruit player" />
                <ModeButton active={mode === 'need'} onClick={() => { setMode('need'); setMessage(''); }} icon={<Target size={15} />} label="Club need" />
              </div>

              {mode === 'capture' ? (
                <form className="djm-os-form" onSubmit={submitCapture}>
                  <label>
                    What happened?
                    <textarea
                      autoFocus
                      rows={6}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste the message or write: Spoke to Chris. They need a left-footed CB. I said I would send options tomorrow."
                    />
                  </label>

                  <div className="djm-os-form-grid">
                    <label>
                      Channel
                      <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="phone">Phone call</option>
                        <option value="meeting">Meeting</option>
                        <option value="instagram">Instagram</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="email">Email</option>
                        <option value="other">Other</option>
                      </select>
                    </label>

                    <label className="djm-os-quick-file">
                      <Paperclip size={17} />
                      <div>
                        <strong>{file ? file.name : 'Optional file'}</strong>
                        <span>Screenshot, audio, PDF or document</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <details style={{ border: '1px solid var(--djm-line)', borderRadius: 12, padding: 12 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--djm-navy)' }}>
                      Attach manually only if DJM cannot infer it
                    </summary>
                    <div className="djm-os-form-grid" style={{ marginTop: 12 }}>
                      <label>
                        Contact
                        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                          <option value="">Auto-detect</option>
                          {contacts.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}{person.current_organisation ? ` · ${person.current_organisation}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Club
                        <select value={organisationId} onChange={(e) => setOrganisationId(e.target.value)}>
                          <option value="">{selectedPerson?.current_organisation ? `Use ${selectedPerson.current_organisation}` : 'Auto-detect'}</option>
                          {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </details>

                  <button className="djm-os-primary-button" type="submit" disabled={busy || (!text.trim() && !file)}>
                    <FileUp size={15} /> {busy ? 'Adding…' : 'Add to DJM'}
                  </button>
                </form>
              ) : null}

              {mode === 'recruitment' ? (
                <form className="djm-os-form" onSubmit={submitRecruitment}>
                  <label>
                    Transfermarkt player URL
                    <input
                      autoFocus
                      value={transfermarktUrl}
                      onChange={(e) => setTransfermarktUrl(e.target.value)}
                      placeholder="https://www.transfermarkt.com/player-name/profil/spieler/123456"
                    />
                  </label>
                  <div className="djm-os-form-grid">
                    <label>
                      Priority
                      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                        <option value="5">5 · Must pursue</option>
                        <option value="4">4 · High</option>
                        <option value="3">3 · Normal</option>
                        <option value="2">2 · Monitor</option>
                        <option value="1">1 · Low</option>
                      </select>
                    </label>
                    <label>
                      Optional note
                      <input value={playerNotes} onChange={(e) => setPlayerNotes(e.target.value)} placeholder="Why DJM should approach him" />
                    </label>
                  </div>
                  <p style={{ margin: 0, color: 'var(--djm-muted)', fontSize: 10, lineHeight: 1.5 }}>
                    DJM creates the Recruitment target immediately, then fills name, age, club, position, foot, contract, market value and agent data when available.
                  </p>
                  <button className="djm-os-primary-button" type="submit" disabled={busy || !transfermarktUrl.trim()}>
                    <UserPlus size={15} /> {busy ? 'Adding player…' : 'Add & autofill'}
                  </button>
                </form>
              ) : null}

              {mode === 'need' ? (
                <form className="djm-os-form" onSubmit={submitNeed}>
                  <label>
                    Club
                    <select autoFocus value={needClubId} onChange={(e) => setNeedClubId(e.target.value)}>
                      <option value="">Choose club</option>
                      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                    </select>
                  </label>
                  <label>
                    What do they need?
                    <textarea
                      rows={5}
                      value={needText}
                      onChange={(e) => setNeedText(e.target.value)}
                      placeholder="RW left foot, max age 21, free or loan. Needs pace and numbers."
                    />
                  </label>
                  <p style={{ margin: 0, color: 'var(--djm-muted)', fontSize: 10, lineHeight: 1.5 }}>
                    DJM extracts the position, foot, age and transfer type it can prove from your note. The original wording is always kept and player matching runs automatically.
                  </p>
                  <button className="djm-os-primary-button" type="submit" disabled={busy || !needClubId || !needText.trim()}>
                    <BriefcaseBusiness size={15} /> {busy ? 'Creating need…' : 'Create & match'}
                  </button>
                </form>
              ) : null}

              {message ? <div className="djm-os-capture-status">{message}</div> : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid var(--djm-line)', paddingTop: 12 }}>
                <small style={{ color: 'var(--djm-muted)' }}>Manual forms remain available in each workspace.</small>
                <Link href="/network" onClick={close} style={{ fontSize: 10, fontWeight: 800, color: 'var(--djm-navy)' }}>
                  Import WhatsApp chat
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={active ? 'djm-os-primary-button' : 'djm-os-secondary-button'}
      onClick={onClick}
      style={{ minHeight: 36 }}
    >
      {icon} {label}
    </button>
  );
}
