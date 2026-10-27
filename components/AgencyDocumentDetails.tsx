import type { ReactNode } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  DOCUMENT_TEMPLATES,
  documentMoney,
  invoiceTotals,
  type AgencyDocument,
  type DocumentContent,
  type DocumentField,
  type DocumentPlayer,
} from "@/lib/agency-documents";
import { DOCUMENT_GUIDES, invoiceDueDate } from "@/lib/document-workflow";
import styles from "./AgencyDocumentStudio.module.css";

export default function AgencyDocumentDetails({
  doc,
  players,
  playerId,
  onPlayerId,
  onImport,
  onField,
  onContent,
  onTitle,
  children,
}: {
  doc: AgencyDocument;
  players: DocumentPlayer[];
  playerId: string;
  onPlayerId: (id: string) => void;
  onImport: () => void;
  onField: (key: string, value: string) => void;
  onContent: (change: (content: DocumentContent) => DocumentContent) => void;
  onTitle: (value: string) => void;
  children?: ReactNode;
}) {
  const guide = DOCUMENT_GUIDES[doc.kind];
  const definitions = DOCUMENT_TEMPLATES[doc.kind].fields;
  const totals = invoiceTotals(doc.content);
  const field = (definition: DocumentField) => {
    const id = `document-field-${definition.key}`;
    const value = doc.content.fields[definition.key] || "";
    return (
      <div key={definition.key} className={styles.formField}>
        <label htmlFor={id}>
          {definition.label}
          {definition.required ? (
            <span className={styles.required}> *</span>
          ) : null}
        </label>
        {definition.key === "principal_type" ? (
          <select
            id={id}
            aria-required={definition.required || undefined}
            value={value}
            onChange={(event) => onField(definition.key, event.target.value)}
          >
            <option value="">Choose the granting party</option>
            {["Agency", "Club", "Player"].map((option) => (
              <option key={option}>{option}</option>
            ))}
            {value && !["Agency", "Club", "Player"].includes(value) ? (
              <option value={value}>{value}</option>
            ) : null}
          </select>
        ) : definition.type === "textarea" ? (
          <textarea
            id={id}
            aria-required={definition.required || undefined}
            rows={3}
            value={value}
            onChange={(event) => onField(definition.key, event.target.value)}
            placeholder={definition.placeholder}
          />
        ) : (
          <input
            id={id}
            aria-required={definition.required || undefined}
            type={definition.type || "text"}
            value={value}
            onChange={(event) => onField(definition.key, event.target.value)}
            placeholder={
              definition.placeholder ||
              (definition.key === "player_name"
                ? "Enter the player's name"
                : undefined)
            }
          />
        )}
        {definition.key === "due_date" ? (
          <div
            className={styles.quickDates}
            aria-label="Payment term shortcuts"
          >
            {[7, 14, 30].map((days) => (
              <button
                data-ui-button="secondary"
                type="button"
                key={days}
                disabled={
                  !invoiceDueDate(doc.content.fields.issue_date || "", days)
                }
                onClick={() =>
                  onField(
                    "due_date",
                    invoiceDueDate(doc.content.fields.issue_date, days),
                  )
                }
              >
                {days} days
              </button>
            ))}
            <small>From the issue date</small>
          </div>
        ) : null}
      </div>
    );
  };
  const playerField = definitions.find((item) => item.key === "player_name");
  return (
    <>
      <div className={styles.purposeNote}>
        <span className={styles.eyebrow}>{guide.purpose}</span>
        <p>{guide.recipient}</p>
      </div>
      {playerField ? (
        <section
          className={styles.playerSetup}
          aria-label="Player for this document"
        >
          {field(playerField)}
          <p className={styles.hint}>{guide.playerHint}</p>
          <p className={styles.documentOnly}>
            <ShieldCheck size={14} />
            This document does not add or change a roster player.
          </p>
          {players.length ? (
            <details className={styles.optionalImport}>
              <summary>Copy details from an existing workspace player</summary>
              <div className={styles.autofill}>
                <select
                  aria-label="Player to fill"
                  value={playerId}
                  onChange={(event) => onPlayerId(event.target.value)}
                >
                  <option value="">Choose a player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  data-ui-button="secondary"
                  type="button"
                  disabled={!playerId}
                  onClick={onImport}
                >
                  Fill player details
                  <ArrowRight size={15} />
                </button>
                <small>
                  {doc.kind === "scouting_report"
                    ? "Only the published, visibility-filtered profile is copied. Private notes are excluded. Review imported evidence for this report."
                    : "Copies details only. Check the name and the terms for this recipient."}
                </small>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      {guide.groups.map((group) => {
        const fields = group.keys.flatMap((key) => {
          const definition = definitions.find((item) => item.key === key);
          return definition ? [field(definition)] : [];
        });
        const body = (
          <>
            <p className={styles.hint}>{group.description}</p>
            {fields}
          </>
        );
        return (
          <div key={group.title}>
            {doc.kind === "invoice" && group.title === "How to pay" ? (
              <>
                {children}
                <dl
                  className={styles.invoiceEstimate}
                  aria-label="Invoice estimate"
                >
                  <div>
                    <dt>Subtotal</dt>
                    <dd>
                      {totals.valid
                        ? documentMoney(
                            totals.subtotal,
                            doc.content.fields.currency,
                          )
                        : "Check service amounts"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tax ({doc.content.fields.tax_rate || "0"}%)</dt>
                    <dd>
                      {totals.valid
                        ? documentMoney(totals.tax, doc.content.fields.currency)
                        : "Check tax"}
                    </dd>
                  </div>
                  <div>
                    <dt>Total due</dt>
                    <dd>
                      {totals.valid
                        ? documentMoney(
                            totals.total,
                            doc.content.fields.currency,
                          )
                        : "Add valid services"}
                    </dd>
                  </div>
                </dl>
              </>
            ) : null}
            {group.advanced ? (
              <details className={styles.fieldGroup}>
                <summary>{group.title}</summary>
                {body}
              </details>
            ) : (
              <section className={styles.fieldGroup} aria-label={group.title}>
                <h3>{group.title}</h3>
                {body}
              </section>
            )}
            {doc.kind === "invoice" && group.title === "How to pay" ? (
              <div className={styles.formField}>
                <label htmlFor="document-bank-details">Bank details</label>
                <textarea
                  id="document-bank-details"
                  rows={4}
                  value={doc.content.brand.bankDetails}
                  placeholder="Account name, IBAN or account number, bank and any required payment instructions"
                  onChange={(event) =>
                    onContent((c) => ({
                      ...c,
                      brand: { ...c.brand, bankDetails: event.target.value },
                    }))
                  }
                />
                <p className={styles.hint}>
                  Use your agency's receiving account. Link opens and manually
                  recorded payments appear in Activity after saving.
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
      <details className={styles.documentName}>
        <summary>Document name</summary>
        <label htmlFor="document-title">Document title</label>
        <input
          id="document-title"
          maxLength={180}
          value={doc.title}
          onChange={(event) => onTitle(event.target.value)}
        />
        <p className={styles.hint}>
          Suggested from the recipient's name. Change it for your library and
          document cover.
        </p>
      </details>
    </>
  );
}
