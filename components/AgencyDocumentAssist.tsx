import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import {
  DOCUMENT_TEMPLATES,
  resolveDocumentText,
  type AgencyDocument,
} from "@/lib/agency-documents";
import { prepareDocumentAssist } from "@/lib/document-assist";
import {
  validateDocumentSuggestions,
  type DocumentSuggestions,
} from "@/supabase/functions/_shared/document-assist";
import type { DocumentRequest } from "./AgencyDocumentStudio";
import styles from "./AgencyDocumentStudio.module.css";

const briefHints = {
  player_contract:
    "The player's full name and DOB, licensed agent, agreed start/end dates and fees. Only include terms you have agreed.",
  mandate:
    "Who is granting authority, the player, permitted clubs or countries, dates and the agreed fee split.",
  agency_pitch:
    "Who the player is, what matters to them, your actual services and people, and the next conversation you would like to have.",
  invoice:
    "The club's billing entity, invoice number, issue and due dates, currency and agreed tax rate. Bank details and payment links stay manual.",
  scouting_report:
    "The player, receiving club, match or video watched, date, role, specific observations, evidence and questions for a further viewing.",
};
type Capture = { id: string; summary?: string; created_at?: string };
export default function AgencyDocumentAssist({
  doc,
  request,
  onApply,
  disabled, initialNotes,
}: {
  initialNotes?: string;
  doc: AgencyDocument;
  request: DocumentRequest;
  onApply: (suggestions: DocumentSuggestions, fingerprint: string) => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes || ""),
    [sectionId, setSectionId] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [captures, setCaptures] = useState<Capture[] | null>(null),
    [result, setResult] = useState<{
      suggestions: DocumentSuggestions;
      fingerprint: string;
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    live = useRef(doc);
  live.current = doc;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const start = (operation: string) => {
    if (controller.current || disabled) return null;
    const next = new AbortController();
    controller.current = next;
    setBusy(operation);
    setError("");
    setNotice("");
    return next;
  };
  const finish = (active: AbortController) => {
    active.abort();
    if (controller.current === active) controller.current = null;
    if (mounted.current) setBusy("");
  };
  const recent = async () => {
    const active = start("notes");
    if (!active) return;
    try {
      const items = await request<Capture[]>(
        "capture_list",
        doc,
        {},
        active.signal,
      );
      if (mounted.current && !active.signal.aborted) setCaptures(items);
    } catch {
      if (mounted.current)
        setError(
          "Tell ReDream notes could not load. Try again, or paste your brief.",
        );
    } finally {
      finish(active);
    }
  };
  const useCapture = async (capture: Capture) => {
    const active = start(capture.id);
    if (!active) return;
    try {
      const receipt = await request<{
        capture?: { id: string; transcript_text?: string };
      }>("capture_read", doc, { capture_id: capture.id }, active.signal);
      const text = receipt.capture?.transcript_text?.trim();
      if (!text || receipt.capture?.id !== capture.id)
        throw new Error("Transcript not available");
      if (mounted.current && !active.signal.aborted) {
        setNotes(text.slice(0, 8000));
        setResult(null);
        setCaptures(null);
        setNotice(
          text.length > 8000
            ? "The first 8,000 characters were copied. Review the brief before preparing suggestions."
            : "Note copied. Keep only the details intended for this document.",
        );
      }
    } catch {
      if (mounted.current)
        setError(
          "This note's transcript is not available. Try another note or paste your brief.",
        );
    } finally {
      finish(active);
    }
  };
  const generate = async () => {
    const active = start("generate");
    if (!active) return;
    setResult(null);
    const fingerprint = JSON.stringify(doc);
    try {
      const input = prepareDocumentAssist(doc, notes, sectionId);
      const response = await request<{ suggestions: DocumentSuggestions }>(
        "assist",
        doc,
        input,
        active.signal,
      );
      if (!mounted.current || active.signal.aborted) return;
      if (JSON.stringify(live.current) !== fingerprint)
        throw new Error(
          "The document changed. Prepare suggestions again for the current draft.",
        );
      let suggestions: DocumentSuggestions;
      try {
        suggestions = validateDocumentSuggestions(response.suggestions, input);
      } catch {
        throw new Error("Some suggestions are not supported by your brief. Your draft is unchanged. Check the brief and try again.");
      }
      setResult({ suggestions, fingerprint });
      setSelected([
        ...suggestions.fields
          .filter((field) => !doc.content.fields[field.key])
          .map((field) => "field:" + field.key),
        ...suggestions.sections
          .filter((section) =>
            doc.content.sections
              .find((item) => item.id === section.id)
              ?.body.includes("[["),
          )
          .map((section) => "section:" + section.id),
      ]);
    } catch (err) {
      if (mounted.current && !active.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Suggestions could not load. Please try again.",
        );
    } finally {
      finish(active);
    }
  };
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const stale = !!result && result.fingerprint !== JSON.stringify(doc);
  const narrative =
    doc.kind === "agency_pitch" || doc.kind === "scouting_report";
  const suggestedContent = {
    ...doc.content,
    fields: {
      ...doc.content.fields,
      ...Object.fromEntries(
        (result?.suggestions.fields || [])
          .filter((field) => selected.includes("field:" + field.key))
          .map((field) => [field.key, field.value]),
      ),
    },
  };
  return (
    <details className={styles.assist} open={initialNotes ? true : undefined}>
      <summary>
        <Sparkles size={17} />
        <span>
          <strong>Prepare with ReDream</strong>
          <small>Turn your brief into editable suggestions.</small>
        </span>
        <ArrowRight size={16} />
      </summary>
      <div className={styles.assistBody}>
        <p>{briefHints[doc.kind]}</p>
        <fieldset disabled={disabled || !!busy} className={styles.assistFields}>
          <label htmlFor="document-assist-brief">Your brief</label>
          <textarea
            id="document-assist-brief"
            rows={5}
            maxLength={8000}
            placeholder="Write naturally, or bring in a Tell ReDream note…"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setResult(null);
              setNotice("");
            }}
          />
          <small>
            Uses this brief and document only. Links are not researched. Keep
            private information out of recipient-facing wording.
          </small>
          <button
            type="button"
            data-ui-button="tertiary"
            className={styles.assistNoteButton}
            onClick={() => void recent()}
          >
            <MessageSquareText size={15} />
            Use a Tell ReDream note
          </button>
          {captures ? (
            <div className={styles.assistNotes} aria-label="Tell ReDream notes">
              <span>Choosing a note replaces the brief above.</span>
              {captures.length ? (
                captures.map((capture) => (
                  <button
                    type="button"
                    data-ui-button="tertiary"
                    key={capture.id}
                    onClick={() => void useCapture(capture)}
                  >
                    {capture.summary || "Saved voice or text note"}
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <p>No recent notes. You can write your brief above.</p>
              )}
            </div>
          ) : null}
          {narrative ? (
            <label className={styles.assistScope}>
              Help with
              <select
                aria-label="Suggestion scope"
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setResult(null);
                }}
              >
                <option value="">Details and all chapters</option>
                {doc.content.sections.map((section) => (
                  <option value={section.id} key={section.id}>
                    {resolveDocumentText(section.title, doc.content)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <small>
              Approved clauses and invoice amounts stay under your control.
            </small>
          )}
          <button
            type="button"
            data-ui-button="primary"
            className={styles.assistGenerate}
            disabled={notes.trim().length < 10}
            onClick={() => void generate()}
          >
            <Sparkles size={16} />
            {error ? "Try preparing again" : "Prepare suggestions"}
          </button>
        </fieldset>
        {busy ? (
          <p role="status">
            <LoaderCircle size={15} />
            {busy === "generate"
              ? "Preparing your suggestions…"
              : "Opening Tell ReDream notes…"}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={styles.assistError}>
            {error}
          </p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {result ? (
          <div
            className={styles.assistSuggestions}
            aria-label="Review ReDream suggestions"
          >
            <h3>Choose what to use</h3>
            <p>Nothing is saved or shared until you decide.</p>
            {stale ? (
              <p role="status">
                The document has changed. Prepare suggestions again before
                applying them.
              </p>
            ) : null}
            <fieldset
              disabled={disabled || !!busy || stale}
              className={styles.assistFields}
            >
              {result.suggestions.fields.map((field) => (
                <label className={styles.assistSuggestion} key={field.key}>
                  <input
                    type="checkbox"
                    checked={selected.includes("field:" + field.key)}
                    onChange={() => toggle("field:" + field.key)}
                  />
                  <span>
                    <strong>
                      {DOCUMENT_TEMPLATES[doc.kind].fields.find(
                        (item) => item.key === field.key,
                      )?.label || field.key}
                    </strong>
                    {doc.content.fields[field.key] ? (
                      <small>Replaces: {doc.content.fields[field.key]}</small>
                    ) : null}
                    <span>{field.value}</span>
                    <q>{field.quote}</q>
                  </span>
                </label>
              ))}
              {result.suggestions.sections.map((section) => (
                <label className={styles.assistSuggestion} key={section.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes("section:" + section.id)}
                    onChange={() => toggle("section:" + section.id)}
                  />
                  <span>
                    <strong>
                      {resolveDocumentText(
                        doc.content.sections.find(
                          (item) => item.id === section.id,
                        )?.title || "Document wording",
                        suggestedContent,
                      )}
                    </strong>
                    <span>{section.body}</span>
                    <small>
                      Check every factual claim before using this wording.
                    </small>
                  </span>
                </label>
              ))}
              {result.suggestions.questions.length ? (
                <div className={styles.assistQuestions}>
                  <h4>Still worth adding</h4>
                  <ul>
                    {result.suggestions.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!result.suggestions.fields.length &&
              !result.suggestions.sections.length ? (
                <p>Add more specific details to the brief and try again.</p>
              ) : null}
              <button
                type="button"
                data-ui-button="primary"
                disabled={!selected.length}
                onClick={() => {
                  onApply(
                    {
                      fields: result.suggestions.fields.filter((field) =>
                        selected.includes("field:" + field.key),
                      ),
                      sections: result.suggestions.sections.filter((section) =>
                        selected.includes("section:" + section.id),
                      ),
                      questions: [],
                    },
                    result.fingerprint,
                  );
                  setResult(null);
                  setNotice(
                    "Suggestions added to your editable draft. Review them before saving or sharing.",
                  );
                }}
              >
                <Check size={16} />
                Apply selected suggestions
              </button>
            </fieldset>
          </div>
        ) : null}
      </div>
    </details>
  );
}
