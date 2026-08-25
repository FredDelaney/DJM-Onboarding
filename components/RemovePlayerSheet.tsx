'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  Trash2,
  X,
} from 'lucide-react';

export default function RemovePlayerSheet({
  open,
  name,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (
    confirmation: string,
  ) => Promise<void> | void;
}) {
  const [value, setValue] =
    useState('');

  useEffect(() => {
    if (open) {
      setValue('');
    }
  }, [open, name]);

  if (!open) {
    return null;
  }

  const exact =
    value.trim() ===
    name.trim();

  return (
    <div
      className="club-share-backdrop"
      onClick={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <section
        className="club-confirm-sheet"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="club-share-handle" />

        <div className="row-between">
          <div>
            <div className="section-kicker">
              PERMANENT REMOVAL
            </div>

            <h2>
              Remove {name}?
            </h2>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p>
          This permanently removes the
          player record, dossier,
          check-ins, requests,
          opportunities, share links and
          stored player files.
        </p>

        <div
          className="field"
          style={{ marginTop: 18 }}
        >
          <label className="label">
            Type “{name}” to confirm
          </label>

          <input
            className="input"
            value={value}
            onChange={(event) =>
              setValue(
                event.target.value,
              )
            }
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div className="club-confirm-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-navy"
            disabled={
              busy ||
              !exact
            }
            onClick={() =>
              onConfirm(
                value.trim(),
              )
            }
          >
            <Trash2 size={15} />

            {busy
              ? 'Removing…'
              : 'Remove player'}
          </button>
        </div>
      </section>
    </div>
  );
}
