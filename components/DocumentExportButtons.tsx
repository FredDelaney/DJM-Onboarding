"use client";
import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import {
  documentIssues,
  exportDocumentName,
  type AgencyDocument,
} from "@/lib/agency-documents";
import { documentLogo } from "@/lib/document-logo";
export default function DocumentExportButtons({
  doc,
  onError,
}: {
  doc: AgencyDocument;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const download = async (format: "docx" | "pdf") => {
    if (busy) return;
    setBusy(format);
    onError("");
    try {
      const output = {
        ...doc,
        content: { ...doc.content, reviewed: documentIssues(doc).length === 0 },
      };
      const logo = await documentLogo(doc.content.brand.logoUrl);
      if (doc.content.brand.logoUrl && !logo)
        onError(
          "The logo could not be loaded. This export uses your agency name. Check the logo URL before exporting again.",
        );
      let blob: Blob;
      if (format === "docx") {
        const { createDocumentWord } = await import("@/lib/document-docx");
        const bytes = logo
          ? Uint8Array.from(atob(logo.dataUrl.split(",")[1]), (c) =>
              c.charCodeAt(0),
            )
          : undefined;
        blob = await createDocumentWord(
          output,
          bytes && logo
            ? { bytes, width: logo.width, height: logo.height }
            : undefined,
        );
      } else {
        const [{ pdf }, { default: Pdf }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("./AgencyDocumentPdf"),
        ]);
        blob = await pdf(<Pdf doc={output} logo={logo?.dataUrl} />).toBlob();
      }
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportDocumentName(doc, format);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The document could not be exported. Try again.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <button
        data-ui-button="secondary"
        type="button"
        onClick={() => void download("docx")}
        disabled={!!busy}
      >
        {busy === "docx" ? <LoaderCircle size={16} /> : <Download size={16} />}
        Word
      </button>
      <button
        data-ui-button="secondary"
        type="button"
        onClick={() => void download("pdf")}
        disabled={!!busy}
      >
        {busy === "pdf" ? <LoaderCircle size={16} /> : <Download size={16} />}
        PDF
      </button>
    </>
  );
}
