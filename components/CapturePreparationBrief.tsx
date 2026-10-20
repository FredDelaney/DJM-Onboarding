"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, RotateCcw } from "lucide-react";
import { readWithDeadline } from "@/lib/read-with-deadline";
import {
  readPreparation,
  PREPARATION_LABELS,
  type PreparationLink,
  type CapturePreparation,
} from "@/lib/capture-preparation";
import styles from "./CapturePreparationBrief.module.css";
export type PreparationBrief = { intent: CapturePreparation; notes: string };
type Reader = (capture: string, signal: AbortSignal) => Promise<any>;
/** The source stays in this private editor. Only the user can copy selected wording into a draft. */
export default function CapturePreparationBrief({
  link,
  read,
  children,
}: {
  link: PreparationLink;
  read: Reader;
  children: (brief: PreparationBrief) => React.ReactNode;
}) {
  const [brief, setBrief] = useState<PreparationBrief | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    const controller = new AbortController();
    setBrief(null);
    setError("");
    void readWithDeadline(reader.current(link.capture, controller.signal))
      .then((receipt) => {
        if (!controller.signal.aborted)
          setBrief(readPreparation(receipt, link));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "This brief could not open. Try again, or return to Tell ReDream.",
          );
      });
    return () => controller.abort();
  }, [link.capture, link.preparation, attempt]);
  return (
    <section className={styles.brief} aria-label="Tell ReDream preparation">
      <header>
        <FileText size={20} />
        <div>
          <span>FROM TELL REDREAM</span>
          <h2>
            {brief
              ? PREPARATION_LABELS[brief.intent.kind]
              : "Your preparation brief"}
          </h2>
        </div>
      </header>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            data-ui-button="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      ) : brief ? (
        children(brief)
      ) : (
        <p role="status">
          <LoaderCircle size={16} />
          Opening your private brief…
        </p>
      )}
    </section>
  );
}
export function BriefSource({ notes }: { notes: string }) {
  return (
    <details className={styles.source}>
      <summary>Original note</summary>
      <p>{notes}</p>
    </details>
  );
}
