'use client';

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  LoaderCircle,
  Search,
  Target,
  UserRound,
  Users,
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

import styles from './AgencyTeamHandoffDrawer.module.css';

type WorkKey =
  | 'players'
  | 'recruitment_targets'
  | 'club_needs'
  | 'deals'
  | 'tasks';

type Selection = Record<WorkKey, Set<string>>;

type Candidate = {
  user_id: string;
  name: string;
  tenant_role?: string | null;
  role_title?: string | null;
  load?: {
    players?: number;
    recruitment_targets?: number;
    club_needs?: number;
    active_deals?: number;
    open_tasks?: number;
    overdue_tasks?: number;
  };
};

type Member = {
  user_id: string;
  name?: string | null;
  tenant_role?: string | null;
  role_title?: string | null;
};

type Preview = {
  available?: boolean;
  source?: Member;
  candidates?: Candidate[];
  work?: Record<WorkKey, any[]>;
  summary?: Record<string, number>;
  truth_contract?: Record<string, string>;
};

const groupConfig: Array<{
  key: WorkKey;
  label: string;
  singular: string;
  icon: typeof Users;
}> = [
  {
    key: 'players',
    label: 'Players',
    singular: 'player',
    icon: Users,
  },
  {
    key: 'recruitment_targets',
    label: 'Recruitment',
    singular: 'recruitment target',
    icon: Target,
  },
  {
    key: 'club_needs',
    label: 'Club needs',
    singular: 'club need',
    icon: Search,
  },
  {
    key: 'deals',
    label: 'Live deals',
    singular: 'deal',
    icon: BriefcaseBusiness,
  },
  {
    key: 'tasks',
    label: 'Open work',
    singular: 'task',
    icon: ClipboardCheck,
  },
];

const emptySelection = (): Selection => ({
  players: new Set(),
  recruitment_targets: new Set(),
  club_needs: new Set(),
  deals: new Set(),
  tasks: new Set(),
});

const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const itemTitle = (key: WorkKey, item: any) => {
  if (key === 'players') return item?.name || 'Player';
  if (key === 'recruitment_targets') {
    return item?.name || 'Recruitment target';
  }
  return item?.title || human(key);
};

const itemContext = (key: WorkKey, item: any) => {
  if (key === 'players') {
    return [
      human(item?.football_status || 'active'),
      item?.open_player_requests
        ? `${item.open_player_requests} open player request${
            Number(item.open_player_requests) === 1 ? '' : 's'
          }`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (key === 'recruitment_targets') {
    return [
      human(item?.recruitment_stage),
      item?.primary_position,
      item?.current_club,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (key === 'club_needs') {
    return [
      item?.organisation_name,
      item?.position,
      item?.expires_at
        ? `Expires ${relativeDate(item.expires_at)}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (key === 'deals') {
    return [
      item?.organisation_name,
      human(item?.stage),
      item?.player_name,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return [
    item?.player_name ||
      item?.person_name ||
      item?.organisation_name,
    item?.due_at ? `Due ${relativeDate(item.due_at)}` : null,
    item?.commitment ? 'Commitment linked' : null,
  ]
    .filter(Boolean)
    .join(' · ');
};
export default function AgencyTeamHandoffDrawer({
  workspaceSlug,
  member,
  onClose,
  onApplied,
}: {
  workspaceSlug: string;
  member: Member;
  onClose: () => void;
  onApplied?: (result: any) => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selection, setSelection] =
    useState<Selection>(emptySelection);
  const [targetUserId, setTargetUserId] = useState('');
  const [step, setStep] = useState<'select' | 'review' | 'success'>(
    'select',
  );
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const next = await platformRpc<Preview>(
        'redream_team_handoff_preview',
        {
          p_from_user_id: member.user_id,
        },
        workspaceSlug,
      );

      setPreview(next);

      const selected = emptySelection();

      for (const group of groupConfig) {
        for (const item of next?.work?.[group.key] || []) {
          if (item?.id) {
            selected[group.key].add(String(item.id));
          }
        }
      }

      setSelection(selected);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [member.user_id, workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = Array.isArray(preview?.candidates)
    ? preview!.candidates!
    : [];

  const target = candidates.find(
    (candidate) => candidate.user_id === targetUserId,
  );

  const work = preview?.work || ({} as Record<WorkKey, any[]>);

  const totalSelected = useMemo(
    () =>
      groupConfig.reduce(
        (total, group) => total + selection[group.key].size,
        0,
      ),
    [selection],
  );

  const selectedCounts = useMemo(
    () =>
      Object.fromEntries(
        groupConfig.map((group) => [
          group.key,
          selection[group.key].size,
        ]),
      ) as Record<WorkKey, number>,
    [selection],
  );

  const toggleItem = (key: WorkKey, id: string) => {
    setSelection((current) => {
      const next: Selection = {
        players: new Set(current.players),
        recruitment_targets: new Set(
          current.recruitment_targets,
        ),
        club_needs: new Set(current.club_needs),
        deals: new Set(current.deals),
        tasks: new Set(current.tasks),
      };

      if (next[key].has(id)) {
        next[key].delete(id);
      } else {
        next[key].add(id);
      }

      return next;
    });
  };

  const toggleGroup = (key: WorkKey) => {
    const items = Array.isArray(work[key]) ? work[key] : [];
    const allSelected =
      items.length > 0 &&
      items.every((item: any) =>
        selection[key].has(String(item.id)),
      );

    setSelection((current) => ({
      ...current,
      [key]: new Set(
        allSelected
          ? []
          : items.map((item: any) => String(item.id)),
      ),
    }));
  };

  const apply = async () => {
    if (!targetUserId || totalSelected === 0 || applying) return;

    setApplying(true);
    setError('');

    try {
      const applied = await platformRpc(
        'redream_team_handoff_apply',
        {
          p_from_user_id: member.user_id,
          p_to_user_id: targetUserId,
          p_selection: {
            player_ids: Array.from(selection.players),
            recruitment_target_ids: Array.from(
              selection.recruitment_targets,
            ),
            club_need_ids: Array.from(selection.club_needs),
            deal_ids: Array.from(selection.deals),
            task_ids: Array.from(selection.tasks),
          },
          p_note: note.trim() || null,
        },
        workspaceSlug,
      );

      setResult(applied);
      setStep('success');
      await onApplied?.(applied);
    } catch (applyError) {
      setError(friendlyError(applyError));
    } finally {
      setApplying(false);
    }
  };
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
        aria-label={`Handoff ${member.name || 'team member'} work`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <small>TEAM HANDOFF</small>
            <h2>
              {step === 'success'
                ? 'Handoff complete'
                : `Handoff ${preview?.source?.name || member.name || 'work'}`}
            </h2>
            <p>
              {step === 'select'
                ? 'Choose the next accountable agent and exactly which work should move.'
                : step === 'review'
                  ? 'Review the ownership change before anything moves.'
                  : 'The selected ownership has moved and the agency audit trail has been updated.'}
            </p>
          </div>

          <button
            type="button"
            data-ui-button="icon"
              className={styles.close}
            onClick={onClose}
            aria-label="Close team handoff"
          >
            <X size={17} />
          </button>
        </header>

        {error ? (
          <div className={styles.error}>
            <CircleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loading}>
            <LoaderCircle size={18} />
            <span>Loading recorded ownership</span>
          </div>
        ) : step === 'success' ? (
          <div className={styles.success}>
            <CheckCircle2 size={28} />
            <h3>Responsibility moved</h3>
            <p>
              {preview?.source?.name || member.name || 'The current owner'}{' '}
              → {target?.name || 'the new owner'}
            </p>

            <div className={styles.successGrid}>
              {groupConfig.map((group) =>
                selectedCounts[group.key] ? (
                  <div key={group.key}>
                    <strong>{selectedCounts[group.key]}</strong>
                    <span>{group.label}</span>
                  </div>
                ) : null,
              )}
            </div>

            {count(result?.moved?.open_player_requests) > 0 ? (
              <small>
                {count(result?.moved?.open_player_requests)} open player
                request
                {count(result?.moved?.open_player_requests) === 1
                  ? ''
                  : 's'}{' '}
                followed the selected player ownership.
              </small>
            ) : null}

            {count(result?.moved?.linked_commitments) > 0 ? (
              <small>
                {count(result?.moved?.linked_commitments)} linked
                commitment
                {count(result?.moved?.linked_commitments) === 1
                  ? ''
                  : 's'}{' '}
                moved with selected tasks.
              </small>
            ) : null}

            <button
              type="button"
              data-ui-button="primary"
              className={styles.primary}
              onClick={onClose}
            >
              Back to Team
            </button>
          </div>
        ) : step === 'review' ? (
          <div className={styles.review}>
            <button
              type="button"
              data-ui-button="tertiary"
              className={styles.back}
              onClick={() => setStep('select')}
            >
              <ArrowLeft size={14} />
              Edit selection
            </button>

            <div className={styles.reviewRoute}>
              <div>
                <span className={styles.avatar}>
                  <UserRound size={17} />
                </span>
                <strong>
                  {preview?.source?.name || member.name || 'Current owner'}
                </strong>
                <small>Current owner</small>
              </div>

              <ArrowRight size={20} />

              <div>
                <span className={styles.avatar}>
                  <UserRound size={17} />
                </span>
                <strong>{target?.name || 'Choose agent'}</strong>
                <small>New owner</small>
              </div>
            </div>

            <div className={styles.reviewGroups}>
              {groupConfig.map((group) => {
                const selected = selectedCounts[group.key];
                if (!selected) return null;

                return (
                  <div key={group.key}>
                    <group.icon size={15} />
                    <span>{group.label}</span>
                    <strong>{selected}</strong>
                  </div>
                );
              })}
            </div>

            <label className={styles.note}>
              <span>Handoff note <em>optional</em></span>
              <textarea
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything the next agent should know about this ownership change"
              />
              <small>{note.length}/500</small>
            </label>

            <div className={styles.boundary}>
              <strong>What will not move</strong>
              <span>
                Personal calendars, email connections, selected chats and
                known relationship routes stay exactly where they are.
              </span>
            </div>

            <button
              type="button"
              data-ui-button="primary"
              className={styles.confirm}
              onClick={() => void apply()}
              disabled={applying}
            >
              {applying ? (
                <>
                  <LoaderCircle size={15} className={styles.spin} />
                  Moving ownership
                </>
              ) : (
                <>
                  <Check size={15} />
                  Confirm handoff
                </>
              )}
            </button>
          </div>
        ) : (
          <div className={styles.selectMode}>
            <section className={styles.targetSection}>
              <div className={styles.sectionTitle}>
                <div>
                  <small>STEP 1</small>
                  <h3>Choose the next owner</h3>
                </div>
                <span>{candidates.length} available</span>
              </div>

              <div className={styles.candidates}>
                {candidates.map((candidate) => {
                  const selected =
                    candidate.user_id === targetUserId;
                  const load = candidate.load || {};

                  return (
                    <button
                      type="button"
                      className={
                        selected
                          ? styles.candidateSelected
                          : styles.candidate
                      }
                      key={candidate.user_id}
                      onClick={() =>
                        setTargetUserId(candidate.user_id)
                      }
                    >
                      <span className={styles.candidateAvatar}>
                        <UserRound size={16} />
                      </span>
                      <span className={styles.candidateCopy}>
                        <strong>{candidate.name}</strong>
                        <small>
                          {candidate.role_title ||
                            human(candidate.tenant_role || 'agent')}
                        </small>
                      </span>
                      <span className={styles.candidateLoad}>
                        {count(load.players)} players ·{' '}
                        {count(load.recruitment_targets)} recruitment ·{' '}
                        {count(load.open_tasks)} open work
                      </span>
                      {selected ? (
                        <CheckCircle2 size={17} />
                      ) : null}
                    </button>
                  );
                })}

                {!candidates.length ? (
                  <div className={styles.empty}>
                    <Users size={18} />
                    <strong>No other active staff available</strong>
                    <span>
                      Add another agency staff member before handing work
                      over.
                    </span>
                  </div>
                ) : null}
              </div>

              <p className={styles.truth}>
                Load figures are recorded ownership only. They are not a
                performance score or working-hour capacity estimate.
              </p>
            </section>

            <section className={styles.workSection}>
              <div className={styles.sectionTitle}>
                <div>
                  <small>STEP 2</small>
                  <h3>Choose what moves</h3>
                </div>
                <span>{totalSelected} selected</span>
              </div>

              <p className={styles.selectionHint}>
                Current accountable work is selected by default. Clear
                anything that should stay with{' '}
                {preview?.source?.name || member.name || 'the current owner'}.
              </p>

              <div className={styles.groups}>
                {groupConfig.map((group) => {
                  const items = Array.isArray(work[group.key])
                    ? work[group.key]
                    : [];
                  const Icon = group.icon;
                  const selected = selection[group.key].size;
                  const allSelected =
                    items.length > 0 && selected === items.length;

                  return (
                    <div className={styles.group} key={group.key}>
                      <div className={styles.groupHead}>
                        <div>
                          <span className={styles.groupIcon}>
                            <Icon size={15} />
                          </span>
                          <div>
                            <strong>{group.label}</strong>
                            <small>
                              {items.length}{' '}
                              {items.length === 1
                                ? group.singular
                                : group.label.toLowerCase()}
                            </small>
                          </div>
                        </div>

                        {items.length ? (
                          <button data-ui-button="tertiary"
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                          >
                            {allSelected ? 'Clear' : 'Select all'}
                          </button>
                        ) : null}
                      </div>

                      {items.length ? (
                        <div className={styles.items}>
                          {items.map((item: any) => {
                            const id = String(item.id);
                            const checked =
                              selection[group.key].has(id);

                            return (
                              <button
                                type="button"
                                className={
                                  checked
                                    ? styles.itemSelected
                                    : styles.item
                                }
                                key={id}
                                onClick={() =>
                                  toggleItem(group.key, id)
                                }
                              >
                                <span className={styles.check}>
                                  {checked ? <Check size={13} /> : null}
                                </span>
                                <span className={styles.itemCopy}>
                                  <strong>
                                    {itemTitle(group.key, item)}
                                  </strong>
                                  <small>
                                    {itemContext(group.key, item) ||
                                      'Recorded agency work'}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.groupEmpty}>
                          No recorded {group.label.toLowerCase()} owned by
                          this agent.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {step === 'select' && !loading ? (
          <footer className={styles.footer}>
            <span>
              Only selected accountable work moves. Personal connected
              accounts never transfer.
            </span>
            <button data-ui-button="primary"
              type="button"
              disabled={!targetUserId || totalSelected === 0}
              onClick={() => setStep('review')}
            >
              Review {totalSelected} item
              {totalSelected === 1 ? '' : 's'}
              <ArrowRight size={14} />
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
