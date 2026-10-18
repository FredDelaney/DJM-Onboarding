"use client";
import { useState } from "react";
import { FileText, ArrowRight, LoaderCircle } from "lucide-react";
import { platformRpc } from "@/lib/platform-client";
import { readWithDeadline } from "@/lib/read-with-deadline";
import type { AgencyDocument } from "@/lib/agency-documents";
import AgencyDocumentPreview from "./AgencyDocumentPreview";
import DocumentExportButtons from "./DocumentExportButtons";
import styles from "./AgencyDocumentStudio.module.css";
export default function AgencyDocumentRecipient({
  workspaceSlug,
  token,
}: {
  workspaceSlug: string;
  token: string;
}) {
  const [doc, setDoc] = useState<AgencyDocument | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await readWithDeadline(
        platformRpc<AgencyDocument | null>("redream_document_open", {
          p_workspace_slug: workspaceSlug,
          p_token: token,
        }),
      );
      if (!result) {
        setError(
          "This link is unavailable or has expired. Ask the sender for a new link.",
        );
        return;
      }
      setDoc(result);
    } catch {
      setError("The document could not open. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (!doc)
    return (
      <main className={styles.state}>
        <FileText size={32} />
        <h1>A document for you</h1>
        <p>View and download the version shared by the sender.</p>
        <button
          data-ui-button="secondary"
          type="button"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy ? <LoaderCircle size={17} /> : null}
          {busy ? "Opening…" : "View document"}
          <ArrowRight size={16} />
        </button>
        <small>Opening this document is recorded by the sender.</small>
        {error ? <p role="alert">{error}</p> : null}
      </main>
    );
  return (
    <main className={`${styles.studio} ${styles.viewer}`}>
      <div className={styles.viewerTools}>
        <DocumentExportButtons doc={doc} onError={setError} />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <AgencyDocumentPreview doc={doc} />
    </main>
  );
}
