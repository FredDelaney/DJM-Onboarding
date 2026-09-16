'use client';

import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react';
import { ChangeEvent, useMemo, useState } from 'react';

import {
  parseRosterMigrationCsv,
  rosterMigrationTemplate,
} from '@/lib/agency-roster-migration';

import styles from './AgencyRosterMigrationPanel.module.css';

type MigrationRow = {
  row_id: string;
  row_number: number;
  validation_state: string;
  proposed_action: string;
  human_decision: string | null;
  issues: Array<{ code?: string; message?: string }>;
  normalized_data: Record<string, unknown>;
};

type MigrationSnapshot = {
  batch: {
    id: string;
    status: string;
    row_count: number;
    valid_rows: number;
    warning_rows: number;
    blocked_rows: number;
  };
  rows: MigrationRow[];
  approval_gate: {
    blocked_rows: number;
    warnings_requiring_decision: number;
    can_approve: boolean;
  };
};

const playerName = (row: MigrationRow) =>
  [row.normalized_data?.first_name, row.normalized_data?.last_name]
    .filter(Boolean)
    .join(' ') ||
  String(row.normalized_data?.preferred_name || `Row ${row.row_number}`);

export default function AgencyRosterMigrationPanel({
  workspaceName,
  invoke,
  onClose,
  onImported,
}: {
  workspaceName: string;
  invoke: (
    action: string,
    body?: Record<string, unknown>,
  ) => Promise<any>;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const [csv, setCsv] = useState('');
  const [sourceName, setSourceName] = useState('Pasted CSV');
  const [migration, setMigration] =
    useState<MigrationSnapshot | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<any>(null);

  const parsed = useMemo(() => {
    if (!csv.trim()) return null;
    try {
      return parseRosterMigrationCsv(csv);
    } catch {
      return null;
    }
  }, [csv]);

  const resetReview = () => {
    setMigration(null);
    setApplied(null);
    setError('');
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2_000_000) {
      setError('Use a CSV smaller than 2 MB.');
      return;
    }

    setCsv(await file.text());
    setSourceName(file.name);
    resetReview();
  };

  const downloadTemplate = () => {
    const blob = new Blob([rosterMigrationTemplate], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'player-roster-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const refreshBatch = async (batchId: string) => {
    const response = await invoke('migration_batch', {
      batch_id: batchId,
      limit: 1000,
    });
    setMigration(response?.migration || null);
  };

  const runPreflight = async () => {
    setBusy('preview');
    setError('');
    setApplied(null);

    try {
      const next = parseRosterMigrationCsv(csv);

      if (next.errors.length) {
        throw new Error(next.errors.slice(0, 6).join(' '));
      }

      if (!next.rows.length) {
        throw new Error('No player rows were found.');
      }

      if (next.rows.length > 1000) {
        throw new Error('Use no more than 1,000 players in one import.');
      }

      const created = await invoke('migration_create_batch', {
        entity_type: 'players',
        source_label: sourceName || 'Player roster CSV',
        field_mapping: next.fieldMapping,
        metadata: {
          profile: 'agency_player_roster_v1',
          source: 'agency_workspace_csv',
        },
      });

      const batchId = String(created?.result?.batch_id || '');
      if (!batchId) {
        throw new Error('Migration batch could not be created.');
      }

      const response = await invoke('migration_preflight', {
        batch_id: batchId,
        rows: next.rows,
      });

      if (!response?.migration?.batch?.id) {
        throw new Error('Migration preflight returned no batch.');
      }

      setMigration(response.migration);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : 'Roster preflight failed.',
      );
    } finally {
      setBusy('');
    }
  };

  const decide = async (
    rowId: string,
    decision: 'create' | 'skip',
  ) => {
    const batchId = migration?.batch?.id;
    if (!batchId) return;

    setBusy(`row:${rowId}`);
    setError('');

    try {
      await invoke('migration_row_decision', {
        batch_id: batchId,
        row_id: rowId,
        decision,
      });
      await refreshBatch(batchId);
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : 'Decision could not be saved.',
      );
    } finally {
      setBusy('');
    }
  };

  const approveAndImport = async () => {
    const batchId = migration?.batch?.id;
    if (!batchId || !migration?.approval_gate?.can_approve) return;

    setBusy('apply');
    setError('');

    try {
      await invoke('migration_approve', {
        batch_id: batchId,
      });

      const response = await invoke('migration_apply', {
        batch_id: batchId,
      });

      setApplied(response?.result || null);
      await refreshBatch(batchId);
      await onImported();
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : 'Roster import failed.',
      );
    } finally {
      setBusy('');
    }
  };

  const warnings =
    migration?.rows?.filter(
      (row) => row.validation_state === 'warning',
    ) || [];
  const blocked =
    migration?.rows?.filter(
      (row) => row.validation_state === 'blocked',
    ) || [];

  return (
    <div className={styles.backdrop}>
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Player roster migration"
      >
        <header className={styles.header}>
          <div>
            <p>PLAYER ROSTER MIGRATION</p>
            <h2>Bring {workspaceName}'s players in.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.explainer}>
          <FileSpreadsheet size={18} />
          <div>
            <strong>Import an existing roster from CSV</strong>
            <span>
              Preflight checks every row first. Possible duplicates need a
              human create or skip decision. Nothing is written until you
              explicitly approve the import.
            </span>
          </div>
        </div>

        {!migration ? (
          <>
            <div className={styles.fileActions}>
              <label className={styles.fileButton}>
                <Upload size={15} />
                Choose CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void readFile(event)}
                />
              </label>
              <button type="button" onClick={downloadTemplate}>
                <Download size={15} />
                Download template
              </button>
            </div>

            <textarea
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value);
                setSourceName('Pasted CSV');
                resetReview();
              }}
              placeholder="Or paste CSV here..."
              spellCheck={false}
            />

            {parsed ? (
              <div className={styles.detected}>
                <strong>{parsed.rows.length} players detected</strong>
                <span>{parsed.headers.join(' · ')}</span>
              </div>
            ) : null}
          </>
        ) : null}

        {error ? (
          <div className={styles.error}>
            <CircleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        {migration ? (
          <div className={styles.review}>
            <div className={styles.summary}>
              <Summary label="Rows" value={migration.batch.row_count} />
              <Summary label="Ready" value={migration.batch.valid_rows} />
              <Summary label="Review" value={migration.batch.warning_rows} />
              <Summary label="Blocked" value={migration.batch.blocked_rows} />
            </div>

            {blocked.length ? (
              <section className={styles.issueSection}>
                <h3>Fix before import</h3>
                {blocked.slice(0, 12).map((row) => (
                  <div className={styles.issueRow} key={row.row_id}>
                    <div>
                      <strong>{playerName(row)}</strong>
                      <span>
                        {row.issues
                          .map((issue) => issue.message || issue.code)
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {warnings.length ? (
              <section className={styles.issueSection}>
                <h3>Possible duplicates</h3>
                {warnings.map((row) => (
                  <div className={styles.issueRow} key={row.row_id}>
                    <div>
                      <strong>{playerName(row)}</strong>
                      <span>
                        {row.issues
                          .map((issue) => issue.message || issue.code)
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                    </div>
                    <div className={styles.decisions}>
                      <button
                        type="button"
                        className={
                          row.human_decision === 'skip'
                            ? styles.selected
                            : ''
                        }
                        onClick={() => void decide(row.row_id, 'skip')}
                        disabled={Boolean(busy)}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        className={
                          row.human_decision === 'create'
                            ? styles.selected
                            : ''
                        }
                        onClick={() => void decide(row.row_id, 'create')}
                        disabled={Boolean(busy)}
                      >
                        Create anyway
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {applied ? (
              <div className={styles.success}>
                <CheckCircle2 size={17} />
                <div>
                  <strong>Roster imported</strong>
                  <span>
                    {applied.created_entities || 0} players created
                    {applied.skipped_rows
                      ? ` · ${applied.skipped_rows} skipped`
                      : ''}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className={styles.footer}>
          {migration && !applied ? (
            <button
              type="button"
              onClick={() => setMigration(null)}
              disabled={Boolean(busy)}
            >
              Edit CSV
            </button>
          ) : (
            <button type="button" onClick={onClose} disabled={Boolean(busy)}>
              {applied ? 'Close' : 'Cancel'}
            </button>
          )}

          {!migration ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => void runPreflight()}
              disabled={!csv.trim() || Boolean(busy)}
            >
              {busy === 'preview' ? (
                <LoaderCircle size={15} className={styles.spin} />
              ) : null}
              Run preflight
            </button>
          ) : null}

          {migration && !applied ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => void approveAndImport()}
              disabled={
                !migration.approval_gate.can_approve || Boolean(busy)
              }
            >
              {busy === 'apply' ? (
                <LoaderCircle size={15} className={styles.spin} />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Approve and import
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || 0}</strong>
    </div>
  );
}
