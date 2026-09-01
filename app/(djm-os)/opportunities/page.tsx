'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Contact,
  Edit3,
  Footprints,
  Gauge,
  Ruler,
  MapPin,
  NotebookText,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import {
  ClubNeedContactControl,
  ClubNeedIdentity,
} from '@/components/ClubNeedCardResource';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import styles from './page.module.css';

type View = 'needs' | 'matches' | 'pipeline';

const ACTIVE_NEED = new Set(['active', 'open', 'confirmed']);

type NeedForm = {
  organisation_id: string;
  title: string;
  position: string;
  source_person_id: string;
  secondary_position: string;
  preferred_foot: string;
  min_age: string;
  max_age: string;
  min_height_cm: string;
  transfer_type: string;
  transfer_budget: string;
  salary_budget: string;
  currency: string;
  salary_period: string;
  salary_tax_basis: string;
  nationality_preferences: string;
  passport_requirements: string;
  foreign_player_notes: string;
  playing_style: string;
  profile_notes: string;
  registration_notes: string;
  raw_request: string;
  source_context: string;
  received_at: string;
  priority: string;
  need_type: string;
  prediction_probability: string;
  expires_at: string;
  status: string;
};

type TaskForm = {
  id: string;
  title: string;
  due_at: string;
  person_id: string;
  priority: string;
  status: string;
};

const emptyNeedForm: NeedForm = {
  organisation_id: '',
  title: '',
  position: '',
  source_person_id: '',
  secondary_position: '',
  preferred_foot: '',
  min_age: '',
  max_age: '',
  min_height_cm: '',
  transfer_type: '',
  transfer_budget: '',
  salary_budget: '',
  currency: 'EUR',
  salary_period: '',
  salary_tax_basis: '',
  nationality_preferences: '',
  passport_requirements: '',
  foreign_player_notes: '',
  playing_style: '',
  profile_notes: '',
  registration_notes: '',
  raw_request: '',
  source_context: '',
  received_at: '',
  priority: '3',
  need_type: 'confirmed',
  prediction_probability: '',
  expires_at: '',
  status: 'confirmed',
};

const emptyTaskForm: TaskForm = {
  id: '',
  title: '',
  due_at: '',
  person_id: '',
  priority: '3',
  status: 'open',
};

const nullableNumber = (value: string) => {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const smallInt = (value: string) => {
  const parsed = nullableNumber(value);
  return parsed == null ? null : Math.round(parsed);
};

function localInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function isoFromLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function needToForm(need: any): NeedForm {
  return {
    organisation_id: need?.organisation_id || '',
    title: need?.title || '',
    position: need?.need_position || need?.position || '',
    source_person_id: need?.source_person_id || '',
    secondary_position: need?.secondary_position || '',
    preferred_foot: need?.preferred_foot || '',
    min_age: need?.min_age == null ? '' : String(need.min_age),
    max_age: need?.max_age == null ? '' : String(need.max_age),
    min_height_cm: need?.min_height_cm == null ? '' : String(need.min_height_cm),
    transfer_type: need?.transfer_type || '',
    transfer_budget: need?.transfer_budget == null ? '' : String(need.transfer_budget),
    salary_budget: need?.salary_budget == null ? '' : String(need.salary_budget),
    currency: need?.currency || 'EUR',
    salary_period: need?.salary_period || '',
    salary_tax_basis: need?.salary_tax_basis || '',
    nationality_preferences: Array.isArray(need?.nationality_preferences)
      ? need.nationality_preferences.join(', ')
      : '',
    passport_requirements: need?.passport_requirements || '',
    foreign_player_notes: need?.foreign_player_notes || '',
    playing_style: need?.playing_style || '',
    profile_notes: need?.profile_notes || '',
    registration_notes: need?.registration_notes || '',
    raw_request: need?.raw_request || '',
    source_context: need?.source_context || '',
    received_at: localInput(need?.received_at),
    priority: String(need?.priority || 3),
    need_type: need?.need_type || 'confirmed',
    prediction_probability:
      need?.prediction_probability == null ? '' : String(need.prediction_probability),
    expires_at: localInput(need?.expires_at),
    status: need?.need_status || need?.status || 'confirmed',
  };
}

function money(value: unknown, currency = 'EUR') {
  if (value == null || value === '') return 'Not set';

  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not set';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(number);
  } catch {
    return `${currency || 'EUR'} ${Math.round(number).toLocaleString('en-GB')}`;
  }
}

function ageRange(need: any) {
  if (need?.min_age != null && need?.max_age != null) return `${need.min_age}-${need.max_age}`;
  if (need?.min_age != null) return `${need.min_age}+`;
  if (need?.max_age != null) return `Up to ${need.max_age}`;
  return 'Open';
}

function listText(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || 'Open';
  const text = String(value || '').trim();
  return text || 'Open';
}

function priorityLabel(value: unknown) {
  const priority = Number(value || 3);
  if (priority >= 5) return 'Critical';
  if (priority === 4) return 'High';
  if (priority === 3) return 'Normal';
  if (priority === 2) return 'Low';
  return 'Background';
}

export default function OpportunitiesPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('needs');
  const [needs, setNeeds] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [candidates, setCandidates] = useState<any>({
    signed_players: [],
    recruitment_targets: [],
  });
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [clubId, setClubId] = useState('');
  const [addContacts, setAddContacts] = useState<any[]>([]);
  const [sourcePersonId, setSourcePersonId] = useState('');
  const [requestText, setRequestText] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingNeed, setEditingNeed] = useState(false);
  const [needForm, setNeedForm] = useState<NeedForm>(emptyNeedForm);
  const [editContacts, setEditContacts] = useState<any[]>([]);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [deletingNeed, setDeletingNeed] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [needData, clubData, opportunityData] = await Promise.all([
        djmRpc<any[]>('djm_market_needs_v3', { p_status: null }),
        djmRpc<any[]>('djm_network_organisations', { p_search: null, p_limit: 300 }),
        djmRpc<any[]>('djm_opportunities', { p_status: 'active' }),
      ]);
      setNeeds(needData || []);
      setClubs((clubData || []).filter((club: any) => club.organisation_type === 'club'));
      setOpportunities(opportunityData || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const position =
      selectedNeed?.need_position ||
      selectedNeed?.position ||
      selectedNeed?.title ||
      null;
    const detail = selectedNeed
      ? {
          route: '/opportunities',
          context_type: 'club_need',
          label: [selectedNeed.organisation_name, position]
            .filter(Boolean)
            .join(' · '),
          organisation_id: selectedNeed.organisation_id || null,
          organisation_name: selectedNeed.organisation_name || null,
          person_id: selectedNeed.source_person_id || null,
          person_name: selectedNeed.source_person_name || null,
          club_need_id: selectedNeed.id || null,
          need_position: position,
        }
      : null;

    window.dispatchEvent(new CustomEvent('djm:tell-context', { detail }));
    return () => {
      window.dispatchEvent(
        new CustomEvent('djm:tell-context', { detail: null }),
      );
    };
  }, [selectedNeed]);

  const activeNeeds = useMemo(
    () =>
      needs.filter((need) =>
        ACTIVE_NEED.has(String(need.need_status || need.status).toLowerCase()),
      ),
    [needs],
  );

  const filteredNeeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeNeeds.filter(
      (need) =>
        !q ||
        [
          need.organisation_name,
          need.need_position,
          need.position,
          need.secondary_position,
          need.title,
          need.profile_notes,
          need.raw_request,
          need.source_person_name,
          need.playing_style,
          need.passport_requirements,
          need.foreign_player_notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
  }, [activeNeeds, search]);

  const filteredPipeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter(
      (opportunity) =>
        !q ||
        [
          opportunity.player_name,
          opportunity.organisation_name,
          opportunity.title,
          opportunity.stage,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
  }, [opportunities, search]);

  const loadClubContacts = useCallback(async (organisationId: string) => {
    if (!organisationId) return [];
    try {
      const data: any = await djmRpc('djm_network_club_workspace', {
        p_organisation_id: organisationId,
      });
      return Array.isArray(data?.contacts) ? data.contacts : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!clubId) {
      setAddContacts([]);
      setSourcePersonId('');
      return;
    }
    void loadClubContacts(clubId).then((contacts) => {
      if (!active) return;
      setAddContacts(contacts);
      if (sourcePersonId && !contacts.some((contact: any) => contact.id === sourcePersonId)) {
        setSourcePersonId('');
      }
    });
    return () => {
      active = false;
    };
  }, [clubId, loadClubContacts, sourcePersonId]);

  const loadNeedWorkspace = useCallback(async (needId: string) => {
    setWorkspaceBusy(true);
    setError('');
    try {
      const result: any = await djmRpc('djm_market_need_workspace', {
        p_need_id: needId,
      });
      setWorkspace(result || null);
      if (result?.need) {
        setSelectedNeed(result.need);
        setNeedForm(needToForm(result.need));
      }
      setEditContacts(Array.isArray(result?.contacts) ? result.contacts : []);
    } catch (workspaceError) {
      setError(friendlyError(workspaceError));
    } finally {
      setWorkspaceBusy(false);
    }
  }, []);

  const openNeed = async (need: any) => {
    setView('needs');
    setSelectedNeed(need);
    setWorkspace(null);
    setEditingNeed(false);
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    await loadNeedWorkspace(need.id);
  };

  const openMatches = async (need: any) => {
    setSelectedNeed(need);
    setView('matches');
    setError('');
    try {
      const result: any = await djmRpc('djm_market_candidates_v2', {
        p_need_id: need.id,
      });
      setCandidates(
        result || {
          signed_players: [],
          recruitment_targets: [],
        },
      );
    } catch (matchError) {
      setError(friendlyError(matchError));
    }
  };

  const createNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!clubId || !requestText.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result: any = await djmRpc('djm_market_create_need_from_text', {
        p_organisation_id: clubId,
        p_text: requestText.trim(),
        p_source_person_id: sourcePersonId || null,
      });
      setClubId('');
      setSourcePersonId('');
      setRequestText('');
      setShowAdd(false);
      setMessage(
        'Club need captured. Open the brief to refine every recruitment field and set the follow-up.',
      );
      await load();
      if (result?.need_id) {
        const refreshed = await djmRpc<any[]>('djm_market_needs_v3', {
          p_status: null,
        });
        const created = (refreshed || []).find(
          (need: any) => need.id === result.need_id,
        );
        if (created) await openNeed(created);
      }
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setBusy(false);
    }
  };

  const startEditNeed = async () => {
    if (!selectedNeed) return;
    const form = needToForm(selectedNeed);
    setNeedForm(form);
    const contacts = await loadClubContacts(form.organisation_id);
    setEditContacts(contacts);
    setEditingNeed(true);
  };

  const changeEditClub = async (organisationId: string) => {
    setNeedForm((current) => ({
      ...current,
      organisation_id: organisationId,
      source_person_id: '',
    }));
    const contacts = await loadClubContacts(organisationId);
    setEditContacts(contacts);
  };

  const saveNeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedNeed || !needForm.organisation_id || !needForm.position.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await djmRpc('djm_market_update_need_v2', {
        p_need_id: selectedNeed.id,
        p_organisation_id: needForm.organisation_id,
        p_title: needForm.title.trim() || `${needForm.position.trim()} requirement`,
        p_position: needForm.position.trim(),
        p_source_person_id: needForm.source_person_id || null,
        p_secondary_position: needForm.secondary_position.trim() || null,
        p_preferred_foot: needForm.preferred_foot.trim() || null,
        p_min_age: smallInt(needForm.min_age),
        p_max_age: smallInt(needForm.max_age),
        p_min_height_cm: smallInt(needForm.min_height_cm),
        p_transfer_type: needForm.transfer_type.trim() || null,
        p_transfer_budget: nullableNumber(needForm.transfer_budget),
        p_salary_budget: nullableNumber(needForm.salary_budget),
        p_currency: needForm.currency.trim() || null,
        p_salary_period: needForm.salary_period.trim() || null,
        p_salary_tax_basis: needForm.salary_tax_basis.trim() || null,
        p_nationality_preferences: needForm.nationality_preferences
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        p_passport_requirements: needForm.passport_requirements.trim() || null,
        p_foreign_player_notes: needForm.foreign_player_notes.trim() || null,
        p_playing_style: needForm.playing_style.trim() || null,
        p_profile_notes: needForm.profile_notes.trim() || null,
        p_registration_notes: needForm.registration_notes.trim() || null,
        p_raw_request: needForm.raw_request.trim() || null,
        p_source_context: needForm.source_context.trim() || null,
        p_received_at: isoFromLocal(needForm.received_at),
        p_priority: smallInt(needForm.priority) || 3,
        p_need_type: needForm.need_type,
        p_prediction_probability:
          needForm.need_type === 'predicted'
            ? smallInt(needForm.prediction_probability)
            : null,
        p_prediction_basis: selectedNeed.prediction_basis || {},
        p_expires_at: isoFromLocal(needForm.expires_at),
      });

      const currentStatus = String(selectedNeed.need_status || selectedNeed.status || '');
      if (needForm.status && needForm.status !== currentStatus) {
        await djmRpc('djm_market_set_need_status', {
          p_need_id: selectedNeed.id,
          p_status: needForm.status,
        });
      }

      setEditingNeed(false);
      setMessage('Recruitment brief updated.');
      await load();
      await loadNeedWorkspace(selectedNeed.id);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const newTask = () => {
    setTaskForm({
      ...emptyTaskForm,
      person_id: selectedNeed?.source_person_id || '',
      title: selectedNeed
        ? `Follow up ${selectedNeed.organisation_name} on ${selectedNeed.need_position || selectedNeed.position || 'club need'}`
        : '',
    });
    setShowTaskForm(true);
  };

  const editTask = (task: any) => {
    setTaskForm({
      id: task.id,
      title: task.title || '',
      due_at: localInput(task.due_at),
      person_id: task.person_id || selectedNeed?.source_person_id || '',
      priority: String(task.priority || 3),
      status: task.status || 'open',
    });
    setShowTaskForm(true);
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedNeed || !taskForm.title.trim()) return;
    setTaskBusy(true);
    setError('');
    setMessage('');
    try {
      await djmRpc('djm_market_upsert_need_task', {
        p_need_id: selectedNeed.id,
        p_title: taskForm.title.trim(),
        p_task_id: taskForm.id || null,
        p_due_at: isoFromLocal(taskForm.due_at),
        p_person_id: taskForm.person_id || null,
        p_priority: smallInt(taskForm.priority) || 3,
        p_status: taskForm.status,
      });
      setShowTaskForm(false);
      setTaskForm(emptyTaskForm);
      setMessage(taskForm.id ? 'Follow-up task updated.' : 'Follow-up task created.');
      await load();
      await loadNeedWorkspace(selectedNeed.id);
    } catch (taskError) {
      setError(friendlyError(taskError));
    } finally {
      setTaskBusy(false);
    }
  };

  const deleteNeed = async () => {
    if (!selectedNeed || deletingNeed) return;

    setError('');
    setMessage('');

    try {
      const impact: any = await djmRpc('djm_delete_preview', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
      });

      const position =
        selectedNeed.need_position ||
        selectedNeed.position ||
        selectedNeed.title ||
        'club need';

      const ok = window.confirm(
        `Delete ${selectedNeed.organisation_name} · ${position}? ` +
          `This permanently removes this recruitment need and ${Number(
            impact?.matches || 0,
          )} candidate match${Number(impact?.matches || 0) === 1 ? '' : 'es'}. ` +
          'Existing deals and follow-up tasks are kept but disconnected from this need. ' +
          'The club and its contacts are not deleted.',
      );

      if (!ok) return;

      setDeletingNeed(true);

      await djmRpc('djm_delete_entity', {
        p_entity_type: 'club_need',
        p_entity_id: selectedNeed.id,
        p_confirm: true,
      });

      setSelectedNeed(null);
      setWorkspace(null);
      setEditingNeed(false);
      setShowTaskForm(false);
      setTaskForm(emptyTaskForm);
      setMessage('Club need deleted.');

      await load();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setDeletingNeed(false);
    }
  };

  const createOpportunity = async (
    candidate: any,
    candidateType: 'signed' | 'prospect',
  ) => {
    if (!selectedNeed) return;
    setError('');
    try {
      const name = candidate.player_name || candidate.full_name || 'Player';
      const result: any = await djmRpc('djm_opportunity_upsert', {
        p_id: null,
        p_title: `${name} to ${selectedNeed.organisation_name}`,
        p_organisation_id: selectedNeed.organisation_id,
        p_source_person_id: selectedNeed.source_person_id || null,
        p_player_id: candidateType === 'signed' ? candidate.player_id : null,
        p_prospect_id:
          candidateType === 'prospect'
            ? candidate.prospect_id || candidate.id
            : null,
        p_club_need_id: selectedNeed.id,
        p_stage: 'qualifying',
        p_expected_commission: null,
        p_currency: selectedNeed.currency || 'EUR',
        p_primary_blocker: null,
        p_next_decision: 'Confirm genuine club interest and commercial fit',
        p_next_action_text: 'Qualify with the club decision-maker',
        p_next_action_at: null,
        p_transfer_fee: selectedNeed.transfer_budget || null,
        p_player_salary: selectedNeed.salary_budget || null,
        p_salary_period: selectedNeed.salary_period || null,
        p_financial_notes: null,
        p_manual_probability: null,
        p_source: 'market_match',
      });
      setMessage(`${name} moved into the opportunity pipeline.`);
      await load();
      const id = result?.opportunity_id || result?.deal_room_id;
      if (id) router.push(`/opportunities/${id}`);
    } catch (opportunityError) {
      setError(friendlyError(opportunityError));
    }
  };

  const signedMatches = Array.isArray(candidates?.signed_players)
    ? candidates.signed_players
    : [];
  const prospectMatches = Array.isArray(candidates?.recruitment_targets)
    ? candidates.recruitment_targets
    : [];

  return (
    <DjmOsShell eyebrow="Demand to player to deal" title="Opportunities">
      {error ? (
        <div className="ux-alert ux-alert-error">
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="ux-alert ux-alert-success">
          <CheckCircle2 size={17} />
          {message}
        </div>
      ) : null}

      <div className="ux-page-toolbar">
        <div className="ux-segmented" role="tablist" aria-label="Opportunity views">
          <button
            type="button"
            className={view === 'needs' ? 'is-active' : ''}
            onClick={() => setView('needs')}
          >
            Needs <span>{activeNeeds.length}</span>
          </button>
          <button
            type="button"
            className={view === 'matches' ? 'is-active' : ''}
            onClick={() => setView('matches')}
          >
            Matches{' '}
            <span>
              {selectedNeed ? signedMatches.length + prospectMatches.length : 0}
            </span>
          </button>
          <button
            type="button"
            className={view === 'pipeline' ? 'is-active' : ''}
            onClick={() => setView('pipeline')}
          >
            Pipeline <span>{opportunities.length}</span>
          </button>
        </div>

        <div className="ux-toolbar-actions">
          <label className="ux-search-control">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search club needs"
            />
          </label>
          <button
            type="button"
            className="ux-secondary-action"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="ux-primary-action"
            onClick={() => setShowAdd((value) => !value)}
          >
            <Plus size={15} />
            Add need
          </button>
        </div>
      </div>

      {showAdd ? (
        <section className="ux-surface ux-inline-create">
          <div className="ux-surface-head">
            <div>
              <p className="ux-eyebrow">CAPTURE THE REAL REQUEST</p>
              <h2>What did the club actually ask for?</h2>
              <p>
                Link the request to the club contact and preserve the original wording.
                DJM will open the structured recruitment brief immediately after capture.
              </p>
            </div>
          </div>
          <form className="ux-simple-form" onSubmit={createNeed}>
            <div className={styles.formGridTwo}>
              <label>
                Club
                <select
                  required
                  value={clubId}
                  onChange={(event) => setClubId(event.target.value)}
                >
                  <option value="">Choose club</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name}
                      {club.country ? ` · ${club.country}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Club contact
                <select
                  value={sourcePersonId}
                  onChange={(event) => setSourcePersonId(event.target.value)}
                  disabled={!clubId}
                >
                  <option value="">
                    {clubId ? 'Choose contact or add later' : 'Choose club first'}
                  </option>
                  {addContacts.map((contact: any) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.full_name}
                      {contact.role_title ? ` · ${contact.role_title}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Original club requirement
              <textarea
                required
                rows={5}
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="Fast U21 right winger, left-footed, free or loan, salary max €200k, foreign slot available..."
              />
            </label>
            <button className="ux-primary-action" type="submit">
              Create recruitment brief
            </button>
          </form>
        </section>
      ) : null}

      {busy ? (
        <div className="ux-loading-row">
          <RefreshCw size={18} className="spin" />
          Connecting live demand...
        </div>
      ) : null}

      {!busy && view === 'needs' ? (
        <>
          {selectedNeed ? (
            <NeedWorkspace
              selectedNeed={selectedNeed}
              workspace={workspace}
              workspaceBusy={workspaceBusy}
              editingNeed={editingNeed}
              needForm={needForm}
              setNeedForm={setNeedForm}
              editContacts={editContacts}
              clubs={clubs}
              onChangeClub={changeEditClub}
              onStartEdit={() => void startEditNeed()}
              onCancelEdit={() => setEditingNeed(false)}
              onSaveNeed={saveNeed}
              onClose={() => {
                setSelectedNeed(null);
                setWorkspace(null);
                setEditingNeed(false);
                setShowTaskForm(false);
              }}
              onFindCandidates={() => void openMatches(selectedNeed)}
              deletingNeed={deletingNeed}
              onDeleteNeed={() => void deleteNeed()}
              showTaskForm={showTaskForm}
              taskForm={taskForm}
              setTaskForm={setTaskForm}
              taskBusy={taskBusy}
              onNewTask={newTask}
              onEditTask={editTask}
              onCancelTask={() => {
                setShowTaskForm(false);
                setTaskForm(emptyTaskForm);
              }}
              onSaveTask={saveTask}
            />
          ) : null}

          <section className={styles.needGrid}>
            {filteredNeeds.map((need) => (
              <NeedCard
                key={need.id}
                need={need}
                onOpen={() => void openNeed(need)}
                onFindCandidates={() => void openMatches(need)}
              />
            ))}
            {!filteredNeeds.length ? (
              <EmptyState text="No live club needs match this view." />
            ) : null}
          </section>
        </>
      ) : null}

      {!busy && view === 'matches' ? (
        <section className="ux-surface">
          <div className="ux-surface-head">
            <div>
              <p className="ux-eyebrow">WORKING CANDIDATE LIST</p>
              <h2>
                {selectedNeed
                  ? `${selectedNeed.organisation_name} · ${
                      selectedNeed.need_position ||
                      selectedNeed.position ||
                      selectedNeed.title
                    }`
                  : 'Choose a club need'}
              </h2>
              <p>
                This is a scouting shortlist, not a player score. Review the evidence and
                recruitment brief before moving a player into the pipeline.
              </p>
            </div>
            {selectedNeed ? (
              <button
                type="button"
                className="ux-secondary-action"
                onClick={() => {
                  setView('needs');
                  void loadNeedWorkspace(selectedNeed.id);
                }}
              >
                Open brief
              </button>
            ) : null}
          </div>

          {selectedNeed ? (
            <div className="ux-match-sections">
              <MatchGroup
                title="Signed players"
                rows={signedMatches}
                type="signed"
                onCreate={createOpportunity}
              />
              <MatchGroup
                title="Prospects"
                rows={prospectMatches}
                type="prospect"
                onCreate={createOpportunity}
              />
            </div>
          ) : (
            <EmptyState text="Select a live need first." />
          )}
        </section>
      ) : null}

      {!busy && view === 'pipeline' ? (
        <section className="ux-pipeline-list">
          {filteredPipeline.map((opportunity) => (
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="ux-pipeline-row"
              key={opportunity.id}
            >
              <div className="ux-stage-dot" />
              <div className="ux-player-main">
                <strong>{opportunity.player_name || opportunity.title}</strong>
                <p>
                  {opportunity.organisation_name} ·{' '}
                  {String(opportunity.stage || 'identified').replaceAll('_', ' ')}
                </p>
                <small>
                  {opportunity.primary_blocker
                    ? `Blocker: ${opportunity.primary_blocker}`
                    : opportunity.next_action_text || 'Open deal room'}
                </small>
              </div>
              <div className="ux-player-meta">
                <strong>{opportunity.next_action_at ? 'Follow-up' : 'Open'}</strong>
                <span>
                  {opportunity.next_action_at
                    ? compactDateTime(opportunity.next_action_at)
                    : 'deal room'}
                </span>
              </div>
              <ArrowRight size={17} />
            </Link>
          ))}
          {!filteredPipeline.length ? (
            <EmptyState text="No live opportunities match this search." />
          ) : null}
        </section>
      ) : null}
    </DjmOsShell>
  );
}

function NeedCard({
  need,
  onOpen,
  onFindCandidates,
}: {
  need: any;
  onOpen: () => void;
  onFindCandidates: () => void;
}) {
  const position = need.need_position || need.position || need.title || 'Player requirement';
  const nextTask = need.next_task_due_at
    ? `Follow-up ${compactDateTime(need.next_task_due_at)}`
    : Number(need.open_task_count || 0)
      ? `${need.open_task_count} open follow-up${Number(need.open_task_count) === 1 ? '' : 's'}`
      : 'No follow-up set';

  return (
    <article className={styles.needCard}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.chipRow}>
            <span
              className={`ux-trust-chip ${
                need.need_type === 'predicted' ? 'is-predicted' : ''
              }`}
            >
              {need.need_type === 'predicted' ? 'Predicted' : 'Confirmed'}
            </span>
            <span className={styles.priorityChip}>
              P{need.priority || 3} · {priorityLabel(need.priority)}
            </span>
          </div>
          <ClubNeedIdentity need={need} />
          <h3>{position}</h3>
          {need.secondary_position ? (
            <p className={styles.secondary}>Also: {need.secondary_position}</p>
          ) : null}
        </div>
        <Target size={19} />
      </div>

      <div className={styles.cardFacts}>
        <MiniFact label="Age" value={ageRange(need)} />
        <MiniFact
          label="Transfer fee"
          value={money(need.transfer_budget, need.currency)}
        />
        <MiniFact label="Salary" value={money(need.salary_budget, need.currency)} />
        <MiniFact label="Deal" value={need.transfer_type || 'Open'} />
        <MiniFact label="Foot" value={need.preferred_foot || 'Open'} />
        <MiniFact
          label="Height"
          value={need.min_height_cm ? `${need.min_height_cm}cm+` : 'Open'}
        />
      </div>

      <p className={styles.cardNotes}>
        {need.profile_notes ||
          need.raw_request ||
          need.playing_style ||
          'No recruitment notes recorded yet.'}
      </p>

      <ClubNeedContactControl need={need} />

      <div className={styles.cardFooter}>
        <div>
          <CalendarClock size={14} />
          <span>{nextTask}</span>
        </div>
        <span>
          {Number(need.match_count || 0)} candidate
          {Number(need.match_count || 0) === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.cardActions}>
        <button type="button" className="ux-secondary-action" onClick={onOpen}>
          Open brief
        </button>
        <button type="button" className="ux-primary-action" onClick={onFindCandidates}>
          Find candidates
        </button>
      </div>
    </article>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NeedWorkspace({
  selectedNeed,
  workspace,
  workspaceBusy,
  editingNeed,
  needForm,
  setNeedForm,
  editContacts,
  clubs,
  onChangeClub,
  onStartEdit,
  onCancelEdit,
  onSaveNeed,
  onClose,
  onFindCandidates,
  deletingNeed,
  onDeleteNeed,
  showTaskForm,
  taskForm,
  setTaskForm,
  taskBusy,
  onNewTask,
  onEditTask,
  onCancelTask,
  onSaveTask,
}: {
  selectedNeed: any;
  workspace: any;
  workspaceBusy: boolean;
  editingNeed: boolean;
  needForm: NeedForm;
  setNeedForm: Dispatch<SetStateAction<NeedForm>>;
  editContacts: any[];
  clubs: any[];
  onChangeClub: (organisationId: string) => Promise<void>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveNeed: (event: FormEvent) => Promise<void>;
  onClose: () => void;
  onFindCandidates: () => void;
  deletingNeed: boolean;
  onDeleteNeed: () => void;
  showTaskForm: boolean;
  taskForm: TaskForm;
  setTaskForm: Dispatch<SetStateAction<TaskForm>>;
  taskBusy: boolean;
  onNewTask: () => void;
  onEditTask: (task: any) => void;
  onCancelTask: () => void;
  onSaveTask: (event: FormEvent) => Promise<void>;
}) {
  const need = workspace?.need || selectedNeed;
  const contacts = Array.isArray(workspace?.contacts) ? workspace.contacts : editContacts;
  const tasks = Array.isArray(workspace?.tasks) ? workspace.tasks : [];
  const linkedContact = contacts.find(
    (contact: any) => contact.id === need.source_person_id,
  );

  return (
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <div className={styles.chipRow}>
            <span
              className={`ux-trust-chip ${
                need.need_type === 'predicted' ? 'is-predicted' : ''
              }`}
            >
              {need.need_type === 'predicted' ? 'Predicted' : 'Confirmed'}
            </span>
            <span className={styles.priorityChip}>
              P{need.priority || 3} · {priorityLabel(need.priority)}
            </span>
          </div>
          <span className={styles.workspaceClub}>{need.organisation_name}</span>
          <h2>
            {need.need_position || need.position || need.title || 'Recruitment brief'}
          </h2>
          <p>
            One source of truth for scouts: football profile, financial limits,
            registration constraints, decision-maker and follow-up.
          </p>
        </div>
        <div className={styles.workspaceActions}>
          <button type="button" className="ux-secondary-action" onClick={onClose}>
            <X size={15} />
            Close
          </button>
          <button
            type="button"
            className="ux-secondary-action"
            onClick={editingNeed ? onCancelEdit : onStartEdit}
          >
            <Edit3 size={15} />
            {editingNeed ? 'Cancel edit' : 'Edit brief'}
          </button>
          <button
            type="button"
            className="ux-secondary-action"
            onClick={onDeleteNeed}
            disabled={deletingNeed}
            style={{ color: '#9d2f2f' }}
          >
            <Trash2 size={15} />
            {deletingNeed ? 'Deleting...' : 'Delete need'}
          </button>

          <button type="button" className="ux-primary-action" onClick={onFindCandidates}>
            <Search size={15} />
            Find candidates
          </button>
        </div>
      </header>

      {workspaceBusy ? (
        <div className="ux-loading-row">
          <RefreshCw size={18} className="spin" />
          Loading recruitment brief...
        </div>
      ) : editingNeed ? (
        <NeedEditForm
          form={needForm}
          setForm={setNeedForm}
          contacts={editContacts}
          clubs={clubs}
          onChangeClub={onChangeClub}
          onSubmit={onSaveNeed}
        />
      ) : (
        <div className={styles.workspaceBody}>
          <main className={styles.briefColumn}>
            <section className={styles.briefSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>SCOUTING BRIEF</span>
                  <h3>What the club actually needs</h3>
                </div>
                <ShieldCheck size={18} />
              </div>

              <div className={styles.factGrid}>
                <BriefFact
                  icon={<Target size={15} />}
                  label="Primary position"
                  value={need.need_position || need.position || 'Not set'}
                />
                <BriefFact
                  icon={<Target size={15} />}
                  label="Secondary position"
                  value={need.secondary_position || 'Open'}
                />
                <BriefFact
                  icon={<UserRound size={15} />}
                  label="Age range"
                  value={ageRange(need)}
                />
                <BriefFact
                  icon={<Footprints size={15} />}
                  label="Preferred foot"
                  value={need.preferred_foot || 'Open'}
                />
                <BriefFact
                  icon={<Ruler size={15} />}
                  label="Minimum height"
                  value={need.min_height_cm ? `${need.min_height_cm} cm` : 'Open'}
                />
                <BriefFact
                  icon={<WalletCards size={15} />}
                  label="Transfer type"
                  value={need.transfer_type || 'Open'}
                />
                <BriefFact
                  icon={<Banknote size={15} />}
                  label="Transfer fee budget"
                  value={money(need.transfer_budget, need.currency)}
                />
                <BriefFact
                  icon={<Banknote size={15} />}
                  label="Salary budget"
                  value={money(need.salary_budget, need.currency)}
                />
                <BriefFact
                  icon={<Clock3 size={15} />}
                  label="Salary period"
                  value={need.salary_period || 'Not set'}
                />
                <BriefFact
                  icon={<Gauge size={15} />}
                  label="Salary tax basis"
                  value={need.salary_tax_basis || 'Not set'}
                />
                <BriefFact
                  icon={<MapPin size={15} />}
                  label="Nationality preference"
                  value={listText(need.nationality_preferences)}
                />
                <BriefFact
                  icon={<ShieldCheck size={15} />}
                  label="Passport requirement"
                  value={need.passport_requirements || 'Open'}
                />
                <BriefFact
                  icon={<ShieldCheck size={15} />}
                  label="Foreign player rules"
                  value={need.foreign_player_notes || 'None recorded'}
                />
                <BriefFact
                  icon={<NotebookText size={15} />}
                  label="Playing style"
                  value={need.playing_style || 'Not specified'}
                />
                <BriefFact
                  icon={<Gauge size={15} />}
                  label="Priority"
                  value={`P${need.priority || 3} · ${priorityLabel(need.priority)}`}
                />
                <BriefFact
                  icon={<CalendarClock size={15} />}
                  label="Expires"
                  value={need.expires_at ? compactDateTime(need.expires_at) : 'No expiry'}
                />
              </div>
            </section>

            <section className={styles.notesGrid}>
              <NoteBlock
                label="Original club wording"
                value={need.raw_request || 'No original wording captured.'}
                featured
              />
              <NoteBlock
                label="Scout profile notes"
                value={need.profile_notes || 'No profile notes yet.'}
              />
              <NoteBlock
                label="Registration notes"
                value={need.registration_notes || 'No registration notes yet.'}
              />
              <NoteBlock
                label="Source context"
                value={need.source_context || 'No source context recorded.'}
              />
            </section>
          </main>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <div className={styles.sideCardHeader}>
                <div>
                  <span>CLUB CONTACT</span>
                  <h3>Decision-maker</h3>
                </div>
                <Contact size={18} />
              </div>

              {need.source_person_id ? (
                <div className={styles.contactCard}>
                  <strong>{need.source_person_name || linkedContact?.full_name || 'Club contact'}</strong>
                  <span>
                    {need.source_person_role ||
                      linkedContact?.role_title ||
                      'Club contact'}
                  </span>
                  {linkedContact?.email ? <small>{linkedContact.email}</small> : null}
                  {linkedContact?.whatsapp ? <small>{linkedContact.whatsapp}</small> : null}
                  <Link href={`/network/contacts/${need.source_person_id}`}>
                    Open relationship record <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <div className={styles.missingCard}>
                  <AlertCircle size={18} />
                  <div>
                    <strong>No contact linked</strong>
                    <p>Edit the brief and link the person who supplied or owns this need.</p>
                  </div>
                </div>
              )}
            </section>

            <section className={styles.sideCard}>
              <div className={styles.sideCardHeader}>
                <div>
                  <span>FOLLOW-UP</span>
                  <h3>Tasks for this need</h3>
                </div>
                <button type="button" className="ux-secondary-action" onClick={onNewTask}>
                  <Plus size={14} />
                  Add task
                </button>
              </div>

              {showTaskForm ? (
                <TaskFormPanel
                  form={taskForm}
                  setForm={setTaskForm}
                  contacts={contacts}
                  busy={taskBusy}
                  onSubmit={onSaveTask}
                  onCancel={onCancelTask}
                />
              ) : null}

              <div className={styles.taskList}>
                {tasks.map((task: any) => (
                  <article
                    className={`${styles.taskRow} ${
                      ['done', 'completed', 'cancelled'].includes(task.status)
                        ? styles.taskDone
                        : ''
                    }`}
                    key={task.id}
                  >
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {task.person_name || 'No contact'} ·{' '}
                        {task.owner_name || 'DJM'}
                      </p>
                      <small>
                        {task.due_at ? `Due ${compactDateTime(task.due_at)}` : 'No due date'}
                        {' · '}P{task.priority || 3}
                        {' · '}
                        {String(task.status || 'open').replaceAll('_', ' ')}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.editTaskButton}
                      onClick={() => onEditTask(task)}
                    >
                      <Edit3 size={14} />
                      Edit
                    </button>
                  </article>
                ))}
                {!tasks.length ? (
                  <div className={styles.emptyTasks}>
                    <CalendarClock size={20} />
                    <p>No follow-up task yet. Add the next date before this need goes cold.</p>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

function BriefFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className={styles.briefFact}>
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </article>
  );
}

function NoteBlock({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: string;
  featured?: boolean;
}) {
  return (
    <article className={`${styles.noteBlock} ${featured ? styles.noteFeatured : ''}`}>
      <span>{label}</span>
      <p>{value}</p>
    </article>
  );
}

function NeedEditForm({
  form,
  setForm,
  contacts,
  clubs,
  onChangeClub,
  onSubmit,
}: {
  form: NeedForm;
  setForm: Dispatch<SetStateAction<NeedForm>>;
  contacts: any[];
  clubs: any[];
  onChangeClub: (organisationId: string) => Promise<void>;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  const patch = (key: keyof NeedForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <form className={styles.editForm} onSubmit={onSubmit}>
      <section>
        <div className={styles.editSectionHead}>
          <span>IDENTITY</span>
          <h3>Club and source</h3>
        </div>
        <div className={styles.formGridTwo}>
          <label>
            Club
            <select
              required
              value={form.organisation_id}
              onChange={(event) => void onChangeClub(event.target.value)}
            >
              <option value="">Choose club</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                  {club.country ? ` · ${club.country}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Club contact
            <select
              value={form.source_person_id}
              onChange={(event) => patch('source_person_id', event.target.value)}
            >
              <option value="">No contact linked</option>
              {contacts.map((contact: any) => (
                <option key={contact.id} value={contact.id}>
                  {contact.full_name}
                  {contact.role_title ? ` · ${contact.role_title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Brief title
            <input
              value={form.title}
              onChange={(event) => patch('title', event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(event) => patch('status', event.target.value)}
            >
              <option value="confirmed">Confirmed</option>
              <option value="active">Active</option>
              <option value="open">Open</option>
              <option value="stale">On hold / stale</option>
              <option value="filled">Filled</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <div className={styles.editSectionHead}>
          <span>PLAYER PROFILE</span>
          <h3>Hard scouting constraints</h3>
        </div>
        <div className={styles.formGridFour}>
          <label>
            Primary position
            <input
              required
              value={form.position}
              onChange={(event) => patch('position', event.target.value)}
            />
          </label>
          <label>
            Secondary position
            <input
              value={form.secondary_position}
              onChange={(event) => patch('secondary_position', event.target.value)}
            />
          </label>
          <label>
            Preferred foot
            <select
              value={form.preferred_foot}
              onChange={(event) => patch('preferred_foot', event.target.value)}
            >
              <option value="">Open</option>
              <option value="Left">Left</option>
              <option value="Right">Right</option>
              <option value="Either">Either</option>
            </select>
          </label>
          <label>
            Minimum height cm
            <input
              inputMode="numeric"
              value={form.min_height_cm}
              onChange={(event) => patch('min_height_cm', event.target.value)}
            />
          </label>
          <label>
            Minimum age
            <input
              inputMode="numeric"
              value={form.min_age}
              onChange={(event) => patch('min_age', event.target.value)}
            />
          </label>
          <label>
            Maximum age
            <input
              inputMode="numeric"
              value={form.max_age}
              onChange={(event) => patch('max_age', event.target.value)}
            />
          </label>
          <label>
            Nationality preferences
            <input
              value={form.nationality_preferences}
              onChange={(event) =>
                patch('nationality_preferences', event.target.value)
              }
              placeholder="EU, New Zealand, Australia"
            />
          </label>
          <label>
            Passport requirements
            <input
              value={form.passport_requirements}
              onChange={(event) => patch('passport_requirements', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <div className={styles.editSectionHead}>
          <span>COMMERCIAL</span>
          <h3>Transfer and salary limits</h3>
        </div>
        <div className={styles.formGridFour}>
          <label>
            Transfer type
            <input
              value={form.transfer_type}
              onChange={(event) => patch('transfer_type', event.target.value)}
              placeholder="Free, loan, permanent"
            />
          </label>
          <label>
            Transfer fee budget
            <input
              inputMode="decimal"
              value={form.transfer_budget}
              onChange={(event) => patch('transfer_budget', event.target.value)}
            />
          </label>
          <label>
            Salary budget
            <input
              inputMode="decimal"
              value={form.salary_budget}
              onChange={(event) => patch('salary_budget', event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              value={form.currency}
              onChange={(event) => patch('currency', event.target.value.toUpperCase())}
            />
          </label>
          <label>
            Salary period
            <input
              value={form.salary_period}
              onChange={(event) => patch('salary_period', event.target.value)}
              placeholder="annual, monthly, weekly"
            />
          </label>
          <label>
            Salary tax basis
            <input
              value={form.salary_tax_basis}
              onChange={(event) => patch('salary_tax_basis', event.target.value)}
              placeholder="gross, net"
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(event) => patch('priority', event.target.value)}
            >
              <option value="1">P1 Background</option>
              <option value="2">P2 Low</option>
              <option value="3">P3 Normal</option>
              <option value="4">P4 High</option>
              <option value="5">P5 Critical</option>
            </select>
          </label>
          <label>
            Need type
            <select
              value={form.need_type}
              onChange={(event) => patch('need_type', event.target.value)}
            >
              <option value="confirmed">Confirmed</option>
              <option value="predicted">Predicted</option>
            </select>
          </label>
          {form.need_type === 'predicted' ? (
            <label>
              Prediction probability
              <input
                inputMode="numeric"
                value={form.prediction_probability}
                onChange={(event) =>
                  patch('prediction_probability', event.target.value)
                }
              />
            </label>
          ) : null}
          <label>
            Received at
            <input
              type="datetime-local"
              value={form.received_at}
              onChange={(event) => patch('received_at', event.target.value)}
            />
          </label>
          <label>
            Expires at
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(event) => patch('expires_at', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <div className={styles.editSectionHead}>
          <span>SCOUTING CONTEXT</span>
          <h3>What matters beyond the numbers</h3>
        </div>
        <div className={styles.formGridTwo}>
          <label>
            Playing style
            <textarea
              rows={4}
              value={form.playing_style}
              onChange={(event) => patch('playing_style', event.target.value)}
            />
          </label>
          <label>
            Foreign player notes
            <textarea
              rows={4}
              value={form.foreign_player_notes}
              onChange={(event) => patch('foreign_player_notes', event.target.value)}
            />
          </label>
          <label>
            Scout profile notes
            <textarea
              rows={5}
              value={form.profile_notes}
              onChange={(event) => patch('profile_notes', event.target.value)}
            />
          </label>
          <label>
            Registration notes
            <textarea
              rows={5}
              value={form.registration_notes}
              onChange={(event) => patch('registration_notes', event.target.value)}
            />
          </label>
          <label>
            Original club wording
            <textarea
              rows={5}
              value={form.raw_request}
              onChange={(event) => patch('raw_request', event.target.value)}
            />
          </label>
          <label>
            Source context
            <textarea
              rows={5}
              value={form.source_context}
              onChange={(event) => patch('source_context', event.target.value)}
            />
          </label>
        </div>
      </section>

      <div className={styles.formActions}>
        <button type="submit" className="ux-primary-action">
          <Save size={15} />
          Save recruitment brief
        </button>
      </div>
    </form>
  );
}

function TaskFormPanel({
  form,
  setForm,
  contacts,
  busy,
  onSubmit,
  onCancel,
}: {
  form: TaskForm;
  setForm: Dispatch<SetStateAction<TaskForm>>;
  contacts: any[];
  busy: boolean;
  onSubmit: (event: FormEvent) => Promise<void>;
  onCancel: () => void;
}) {
  const patch = (key: keyof TaskForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <form className={styles.taskForm} onSubmit={onSubmit}>
      <label>
        Task
        <input
          required
          value={form.title}
          onChange={(event) => patch('title', event.target.value)}
        />
      </label>
      <div className={styles.formGridTwo}>
        <label>
          Follow-up date
          <input
            type="datetime-local"
            value={form.due_at}
            onChange={(event) => patch('due_at', event.target.value)}
          />
        </label>
        <label>
          Club contact
          <select
            value={form.person_id}
            onChange={(event) => patch('person_id', event.target.value)}
          >
            <option value="">No contact</option>
            {contacts.map((contact: any) => (
              <option key={contact.id} value={contact.id}>
                {contact.full_name}
                {contact.role_title ? ` · ${contact.role_title}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={form.priority}
            onChange={(event) => patch('priority', event.target.value)}
          >
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
            <option value="4">P4</option>
            <option value="5">P5</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => patch('status', event.target.value)}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="snoozed">Snoozed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <div className={styles.taskFormActions}>
        <button type="button" className="ux-secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="ux-primary-action" disabled={busy}>
          <Save size={14} />
          {busy ? 'Saving...' : form.id ? 'Update task' : 'Create task'}
        </button>
      </div>
    </form>
  );
}

function MatchGroup({
  title,
  rows,
  type,
  onCreate,
}: {
  title: string;
  rows: any[];
  type: 'signed' | 'prospect';
  onCreate: (row: any, type: 'signed' | 'prospect') => Promise<void>;
}) {
  return (
    <section className="ux-match-group">
      <div className="ux-match-title">
        <h3>{title}</h3>
        <span>{rows.length}</span>
      </div>
      {rows.map((row, index) => {
        const name = row.player_name || row.full_name || 'Player';
        return (
          <article
            className="ux-match-row"
            key={
              row.match_id ||
              row.player_id ||
              row.prospect_id ||
              row.id ||
              index
            }
          >
            <div className={styles.candidateIcon}>
              <UserRound size={18} />
            </div>
            <div className="ux-player-main">
              <strong>{name}</strong>
              <p>
                {[
                  row.player_position || row.primary_position,
                  row.current_club,
                  row.current_league || row.current_country,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <small>{explainReasoning(row.reasoning)}</small>
            </div>
            {type === 'signed' && row.player_id ? (
              <Link
                className="ux-secondary-action"
                href={`/admin/players/${row.player_id}`}
              >
                View player
              </Link>
            ) : null}
            <button
              type="button"
              className="ux-primary-action"
              onClick={() => void onCreate(row, type)}
            >
              Create opportunity
            </button>
          </article>
        );
      })}
      {!rows.length ? (
        <p className="ux-muted-copy">
          No current candidate records in this group. Use the brief as the scout search
          specification.
        </p>
      ) : null}
    </section>
  );
}

function explainReasoning(value: any) {
  if (!value) return 'Open the player and review the real evidence against the club brief.';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.slice(0, 3).map(String).join(' · ');
  const items = Object.entries(value)
    .filter(([, entry]) => entry != null)
    .slice(0, 3)
    .map(([key, entry]) => `${key.replaceAll('_', ' ')}: ${String(entry)}`);
  return items.join(' · ') || 'Candidate evidence available.';
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="ux-evidence-empty">
      <CheckCircle2 size={25} />
      <div>
        <strong>Nothing to show.</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
