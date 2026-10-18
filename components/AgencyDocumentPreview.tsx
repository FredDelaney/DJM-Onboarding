import type { CSSProperties } from "react";
import {
  DOCUMENT_TEMPLATES,
  documentIssues,
  documentMoney,
  documentPrice,
  invoiceTotals,
  resolveDocumentText,
  safeDocumentUrl,
  safeDocumentLogoUrl,
  type AgencyDocument,
} from "@/lib/agency-documents";
import { readableBrandInk } from "@/lib/tenant-brand-style";
import styles from "./AgencyDocumentStudio.module.css";
export default function AgencyDocumentPreview({
  doc,
}: {
  doc: AgencyDocument;
}) {
  const { content, kind } = doc,
    { brand, fields } = content,
    totals = invoiceTotals(content),
    currency = fields.currency || "EUR";
  const logo = safeDocumentLogoUrl(brand.logoUrl);
  const render = (value: string) =>
    resolveDocumentText(value, content)
      .split(/(\[\[[\s\S]*?\]\]|\[[a-z_ ]+\])/g)
      .map((part, index) =>
        part.startsWith("[") ? <mark key={index}>{part}</mark> : part,
      );
  return (
    <article
      className={`${styles.paper} ${kind === "agency_pitch" ? styles.pitchPaper : ""}`}
      style={
        {
          "--doc-primary": readableBrandInk(brand.primary),
          "--doc-accent": /^#[\da-f]{6}$/i.test(brand.accent)
            ? brand.accent
            : "#AF9367",
        } as CSSProperties
      }
      aria-label="Document preview"
    >
      <header className={styles.paperHeader}>
        <strong>{brand.name || "Your agency"}</strong>
        {logo ? (
          <img
            src={logo}
            alt={`${brand.name} logo`}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </header>
      <div className={styles.paperBody}>
        <span className={styles.paperCategory}>
          {DOCUMENT_TEMPLATES[kind].label}
        </span>
        <h1>{doc.title || "Untitled document"}</h1>
        {documentIssues(doc).length > 0 ? (
          <span className={styles.draftStamp}>Draft for review</span>
        ) : null}
        {kind === "invoice" ? (
          <div className={styles.invoicePreview}>
            <div className={styles.invoiceMeta}>
              <div>
                <small>Bill to</small>
                <strong>{fields.recipient_name || "Recipient name"}</strong>
                <p>{fields.recipient_address || "Billing address"}</p>
              </div>
              <dl>
                <div>
                  <dt>Invoice</dt>
                  <dd>{fields.invoice_number || "Add number"}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>{fields.issue_date || "Add date"}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{fields.due_date || "Add date"}</dd>
                </div>
              </dl>
            </div>
            <div className={styles.invoiceLines}>
              {content.lines.map((line, index) => (
                <div key={line.id}>
                  <span>
                    <strong>{line.description || "Service description"}</strong>
                    <small>
                      {line.quantity || "0"} ×{" "}
                      {documentPrice(line.unitPrice, currency)}
                    </small>
                  </span>
                  <strong>
                    {totals.valid
                      ? documentMoney(totals.amounts[index], currency)
                      : "[amount]"}
                  </strong>
                </div>
              ))}
            </div>
            <dl className={styles.totals}>
              <div>
                <dt>Subtotal</dt>
                <dd>
                  {totals.valid
                    ? documentMoney(totals.subtotal, currency)
                    : "[amount]"}
                </dd>
              </div>
              <div>
                <dt>Tax ({fields.tax_rate || "0"}%)</dt>
                <dd>
                  {totals.valid
                    ? documentMoney(totals.tax, currency)
                    : "[amount]"}
                </dd>
              </div>
              <div>
                <dt>Total due</dt>
                <dd>
                  {totals.valid
                    ? documentMoney(totals.total, currency)
                    : "[complete line items]"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        {content.sections.map((section, index) => (
          <section
            key={section.id}
            className={section.pageBreak ? styles.pageBreak : undefined}
          >
            <span className={styles.sectionNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2>{render(section.title)}</h2>
            <p>{render(section.body)}</p>
          </section>
        ))}
        {kind === "invoice" && brand.bankDetails ? (
          <section>
            <h2>Bank details</h2>
            <p>{brand.bankDetails}</p>
          </section>
        ) : null}
        {kind === "invoice" && safeDocumentUrl(fields.payment_url) ? (
          <a
            className={styles.payLink}
            href={safeDocumentUrl(fields.payment_url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Pay online <span aria-hidden>↗</span>
          </a>
        ) : null}
        {content.sources.length ? (
          <section className={styles.sources}>
            <h2>Sources</h2>
            {content.sources.map((source, index) => (
              <p key={index}>
                {safeDocumentUrl(source.url) ? (
                  <a
                    href={safeDocumentUrl(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.label}
                  </a>
                ) : (
                  source.label
                )}
                <small>Added {source.capturedAt.slice(0, 10)}</small>
              </p>
            ))}
          </section>
        ) : null}
      </div>
      <footer className={styles.paperFooter}>
        <strong>{brand.legalName || brand.name}</strong>
        <p>{[brand.address, brand.registration].filter(Boolean).join(" · ")}</p>
        <p>
          {[brand.email, brand.phone, brand.website]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </footer>
    </article>
  );
}
