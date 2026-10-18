"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  LayoutTemplate,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { platformRpc, friendlyError } from "@/lib/platform-client";
import { supabase } from "@/lib/supabase";
import { readWithDeadline } from "@/lib/read-with-deadline";
import { tenantBrandCssVariables } from "@/lib/tenant-brand-style";
import {
  DOCUMENT_KINDS,
  DOCUMENT_TEMPLATES,
  documentBrand,
  copyAgencyDocument,
  documentIssues,
  fillDocumentPlayer,
  newAgencyDocument,
  type AgencyDocument,
  type DocumentBrand,
  type DocumentContent,
  type DocumentKind,
  type DocumentPlayer,
  type DocumentSettings,
} from "@/lib/agency-documents";
import AgencyDocumentPreview from "./AgencyDocumentPreview";
import DocumentExportButtons from "./DocumentExportButtons";
import styles from "./AgencyDocumentStudio.module.css";
export type DocumentStudioData = {
  tenant_id: string;
  brand: Record<string, any>;
  documents: AgencyDocument[];
  players: DocumentPlayer[];
  settings?: DocumentSettings;
};
export type DocumentRequest = <T = any>(
  action: string,
  doc?: AgencyDocument,
  payload?: Record<string, unknown>,
) => Promise<T>;
type Activity = {
  kind: string;
  created_at: string;
  note?: string;
  document_revision?: number;
};
const eventLabels: Record<string, string> = {
  created: "Draft created",
  saved: "Changes saved",
  link_created: "Review link created",
  link_revoked: "Review links revoked",
  opened: "Document link opened",
  sent_manually: "Sent (manually recorded)",
  paid_manually: "Payment (manually recorded)",
};

export default function AgencyDocumentStudio({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const [data, setData] = useState<DocumentStudioData | null>(null),
    [error, setError] = useState(""),
    [identity, setIdentity] = useState(""),
    [signedOut, setSignedOut] = useState(false),
    [attempt, setAttempt] = useState(0);
  const request = useCallback<DocumentRequest>(
    (action, doc, payload = {}) =>
      readWithDeadline(
        platformRpc(
          "redream_documents",
          {
            p_workspace_slug: workspaceSlug,
            p_action: action,
            p_id: doc?.id || null,
            p_revision: doc?.revision ?? null,
            p_payload: payload,
          },
          workspaceSlug,
        ),
      ),
    [workspaceSlug],
  );
  useEffect(() => {
    let alive = true,
      known: string | undefined;
    let sequence = 0,
      authEvents = 0;
    setData(null);
    setError("");
    setSignedOut(false);
    const accept = (user: string | null) => {
      if (!alive || known === (user || "")) return;
      known = user || "";
      const current = ++sequence;
      setData(null);
      setError("");
      setIdentity(user || "");
      setSignedOut(!user);
      if (!user) return;
      void request<DocumentStudioData>("list")
        .then((result) => {
          if (alive && sequence === current) setData(result);
        })
        .catch((err) => {
          if (alive && sequence === current) setError(friendlyError(err));
        });
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvents++;
      queueMicrotask(() => accept(session?.user.id || null));
    });
    void readWithDeadline(supabase.auth.getSession())
      .then(({ data: session, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (!authEvents) accept(session.session?.user.id || null);
      })
      .catch((err) => {
        if (alive && known === undefined) setError(friendlyError(err));
      });
    return () => {
      alive = false;
      sequence++;
      subscription.unsubscribe();
    };
  }, [request, attempt]);
  if (signedOut)
    return (
      <main className={styles.state}>
        <FileText size={32} />
        <h1>Your agency documents</h1>
        <p>Sign in to open your workspace documents.</p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/workspace/${workspaceSlug}/documents`)}`}
        >
          Sign in
        </Link>
      </main>
    );
  if (error && !data)
    return (
      <main className={styles.state} role="alert">
        <h1>Documents could not open</h1>
        <p>{error}</p>
        <button
          data-ui-button="secondary"
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </button>
        <Link href={`/workspace/${workspaceSlug}`}>Back to workspace</Link>
      </main>
    );
  if (!data)
    return (
      <main className={styles.state} role="status">
        <LoaderCircle size={28} />
        <p>Opening documents…</p>
      </main>
    );
  return (
    <DocumentStudioEditor
      key={`${data.tenant_id}:${identity}`}
      workspaceSlug={workspaceSlug}
      initialData={data}
      request={request}
    />
  );
}

export function DocumentStudioEditor({
  workspaceSlug,
  initialData,
  request,
}: {
  workspaceSlug: string;
  initialData: DocumentStudioData;
  request: DocumentRequest;
}) {
  const [library, setLibrary] = useState(initialData.documents),
    [doc, setDoc] = useState<AgencyDocument | null>(null),
    [baseline, setBaseline] = useState(""),
    [tab, setTab] = useState("details"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(false),
    [playerId, setPlayerId] = useState(""),
    [activity, setActivity] = useState<Activity[]>([]),
    [shareUrl, setShareUrl] = useState(""),
    [note, setNote] = useState(""),
    [dialogMode, setDialogMode] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<(() => void) | null>(null),
    mounted = useRef(true),
    dirty = !!doc && JSON.stringify(doc) !== baseline;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const brand = documentBrand(initialData.brand),
    theme = tenantBrandCssVariables({
      primary: brand.primary,
      accent: brand.accent,
    });
  const openDialog = (mode: string) => {
    setDialogMode(mode);
    setError("");
    setNote("");
    setShareUrl("");
    dialog.current?.showModal();
  };
  const select = (next: AgencyDocument | null) => {
    setDoc(next ? structuredClone(next) : null);
    setBaseline(next ? JSON.stringify(next) : "");
    setPlayerId("");
    setTab("details");
    setPreview(false);
    setError("");
    setNotice("");
    setActivity([]);
  };
  const navigate = (action: () => void) => {
    if (busy) return;
    if (dirty) {
      pending.current = action;
      openDialog("discard");
    } else action();
  };
  const edit = (change: (current: AgencyDocument) => AgencyDocument) =>
    setDoc((current) =>
      current ? { ...change(current), status: "draft" } : current,
    );
  const content = (change: (current: DocumentContent) => DocumentContent) =>
    edit((current) => ({
      ...current,
      content: { ...change(current.content), reviewed: false },
    }));
  const setField = (key: string, value: string) =>
    content((current) => ({
      ...current,
      fields: { ...current.fields, [key]: value },
    }));
  const refresh = async () => {
    const latest = await request<DocumentStudioData>("list");
    if (mounted.current) setLibrary(latest.documents);
    return latest;
  };
  const save = async () => {
    if (!doc || busy || doc.paid_at) return;
    setBusy("save");
    setError("");
    setNotice("");
    const draft = doc;
    try {
      const saved = await request<AgencyDocument>("save", draft, {
        title: draft.title,
        kind: draft.kind,
        is_template: draft.is_template,
        content: draft.content,
      });
      if (!mounted.current) return;
      setDoc(saved);
      setBaseline(JSON.stringify(saved));
      setLibrary((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setNotice(saved.is_template ? "Agency template saved" : "Draft saved");
    } catch (err) {
      if (mounted.current) setError(friendlyError(err));
      if ((err as { code?: string })?.code === "40001") {
        try {
          await refresh();
        } catch {
          /* Keep the unsaved draft and original error. */
        }
      }
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const action = async (kind: string) => {
    if (!doc || busy) return;
    setBusy(kind);
    setError("");
    try {
      const result = await request(kind, doc, { note });
      if (!mounted.current) return;
      if (kind === "share") {
        setShareUrl(
          `${window.location.origin}/workspace/${encodeURIComponent(workspaceSlug)}/documents/view/${result.token}`,
        );
        setNotice("A review link was created. It expires in 14 days.");
      } else {
        dialog.current?.close();
        setNotice(
          kind === "paid"
            ? "Payment recorded manually"
            : kind === "sent"
              ? "Sent status recorded manually"
              : kind === "revoke"
                ? "All review links revoked"
                : "Document archived",
        );
      }
      const latest = await refresh();
      if (!mounted.current) return;
      const saved = latest.documents.find((item) => item.id === doc.id);
      if (kind === "archive") select(null);
      else if (saved) {
        setDoc(saved);
        setBaseline(JSON.stringify(saved));
      }
      if (kind === "paid" || kind === "sent")
        setActivity(await request<Activity[]>("events", saved || doc));
    } catch (err) {
      if (mounted.current) setError(friendlyError(err));
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Link copied");
    } catch {
      setNotice("Select and copy the link below.");
    }
  };
  const create = (kind: DocumentKind) =>
    navigate(() =>
      select(newAgencyDocument(kind, brand, new Date(), initialData.settings)),
    );
  const useTemplate = (template: AgencyDocument) =>
    navigate(() => {
      select(
        copyAgencyDocument(template, "from_template", initialData.settings),
      );
    });
  const asTemplate = () => {
    if (!doc) return;
    navigate(() => select(copyAgencyDocument(doc, "template")));
  };
  const duplicate = () => {
    if (!doc) return;
    navigate(() => select(copyAgencyDocument(doc, "duplicate")));
  };
  const issues = doc ? documentIssues(doc) : [];
  const loadActivity = async () => {
    if (!doc || busy) return;
    setTab("activity");
    setBusy("activity");
    setError("");
    try {
      const events = await request<Activity[]>("events", doc);
      if (mounted.current) setActivity(events);
    } catch (err) {
      if (mounted.current) setError(friendlyError(err));
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const sectionMove = (index: number, delta: number) =>
    content((current) => {
      const sections = [...current.sections];
      [sections[index], sections[index + delta]] = [
        sections[index + delta],
        sections[index],
      ];
      return { ...current, sections };
    });
  const brandField = (
    key: keyof DocumentBrand,
    label: string,
    multiline = false,
  ) => (
    <label key={key}>
      {label}
      {multiline ? (
        <textarea
          value={doc!.content.brand[key]}
          onChange={(event) =>
            content((c) => ({
              ...c,
              brand: { ...c.brand, [key]: event.target.value },
            }))
          }
          rows={3}
        />
      ) : (
        <input
          type={key === "primary" || key === "accent" ? "color" : "text"}
          value={doc!.content.brand[key]}
          onChange={(event) =>
            content((c) => ({
              ...c,
              brand: { ...c.brand, [key]: event.target.value },
            }))
          }
        />
      )}
    </label>
  );
  return (
    <main className={styles.studio} style={theme} data-interface="calm">
      <header className={styles.topbar}>
        <Link
          href={`/workspace/${workspaceSlug}`}
          onClick={(event) => {
            if (dirty) {
              event.preventDefault();
              navigate(() =>
                window.location.assign(`/workspace/${workspaceSlug}`),
              );
            }
          }}
        >
          <ArrowLeft size={16} />
          <span>{brand.name || "Workspace"}</span>
        </Link>
        <span className={styles.topbarLabel}>
          <FileText size={16} /> Documents
        </span>
        <span className={styles.privateLabel}>
          <ShieldCheck size={14} />
          Private workspace
        </span>
      </header>
      {!doc ? (
        <div className={styles.library}>
          <div className={styles.libraryHeading}>
            <div>
              <span className={styles.eyebrow}>YOUR AGENCY, ON EVERY PAGE</span>
              <h1>
                Good work deserves
                <br />
                <em>a better document.</em>
              </h1>
              <p>
                From a first conversation to a signed agreement.
                <br />
                Create it once. Make it yours.
              </p>
            </div>
            <div className={styles.libraryArtwork} aria-hidden>
              <div>
                <span>{brand.name || "YOUR AGENCY"}</span>
                <strong>
                  The next
                  <br />
                  chapter.
                </strong>
                <i />
                <small>PERSONAL. CONSIDERED. YOURS.</small>
              </div>
            </div>
          </div>
          <div className={styles.sectionHead}>
            <h2>Start with a purpose</h2>
            <span>Five starting points. Every word editable.</span>
          </div>
          <div className={styles.templateGrid}>
            {DOCUMENT_KINDS.map((kind, index) => (
              <button
                data-ui-button="secondary"
                type="button"
                key={kind}
                onClick={() => create(kind)}
                className={styles.templateTile}
              >
                <span className={styles.templateNumber}>
                  0{index + 1}
                  <FileText size={19} />
                </span>
                <small>{DOCUMENT_TEMPLATES[kind].category}</small>
                <strong>{DOCUMENT_TEMPLATES[kind].label}</strong>
                <p>{DOCUMENT_TEMPLATES[kind].description}</p>
                <span className={styles.templateStart}>
                  Create document
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
          {library.some((item) => item.is_template) ? (
            <section className={styles.savedTemplates}>
              <h2>Your agency templates</h2>
              {library
                .filter((item) => item.is_template)
                .map((item) => (
                  <div key={item.id}>
                    <LayoutTemplate size={20} />
                    <strong>{item.title}</strong>
                    <button
                      data-ui-button="secondary"
                      type="button"
                      onClick={() => useTemplate(item)}
                    >
                      Use template
                      <ArrowRight size={15} />
                    </button>
                    <button
                      data-ui-button="secondary"
                      type="button"
                      onClick={() => select(item)}
                    >
                      Edit
                    </button>
                  </div>
                ))}
            </section>
          ) : null}
          <section className={styles.documents}>
            <div className={styles.sectionHead}>
              <h2>Your documents</h2>
              <label className={styles.search}>
                <Search size={17} />
                <input
                  aria-label="Search documents"
                  placeholder="Find a document"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            {!library.some((item) => !item.is_template) ? (
              <div className={styles.empty}>
                <FileText size={26} />
                <h3>Your first document starts above</h3>
                <p>
                  Saved drafts, shared versions and invoice activity will appear
                  here.
                </p>
              </div>
            ) : (
              <div className={styles.documentRows}>
                {library
                  .filter(
                    (item) =>
                      !item.is_template &&
                      `${item.title} ${item.content.fields.player_name || ""} ${item.content.fields.recipient_name || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      data-ui-button="secondary"
                      type="button"
                      key={item.id}
                      onClick={() => select(item)}
                    >
                      <FileText size={21} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {DOCUMENT_TEMPLATES[item.kind].label} ·{" "}
                          {item.content.fields.player_name ||
                            item.content.fields.recipient_name ||
                            "Draft"}
                        </small>
                      </span>
                      <span className={styles.rowStatus}>
                        {item.paid_at
                          ? "Payment recorded"
                          : item.opened_at
                            ? "Link opened"
                            : item.sent_at
                              ? "Sent · manual"
                              : item.active_links
                                ? "Link ready"
                                : "Draft"}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                {search &&
                !library.some(
                  (item) =>
                    !item.is_template &&
                    `${item.title} ${item.content.fields.player_name || ""} ${item.content.fields.recipient_name || ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ) ? (
                  <p>No documents match “{search}”.</p>
                ) : null}
              </div>
            )}
            <small className={styles.libraryLimit}>
              The most recent 100 saved documents and templates.
            </small>
          </section>
        </div>
      ) : (
        <>
          <div className={styles.editorBar}>
            <button
              data-ui-button="secondary"
              type="button"
              onClick={() => navigate(() => select(null))}
              disabled={!!busy}
            >
              <ArrowLeft size={16} />
              Library
            </button>
            <div className={styles.editorTitle}>
              <strong>{doc.title}</strong>
              <small>
                {doc.is_template
                  ? "Agency template"
                  : DOCUMENT_TEMPLATES[doc.kind].label}{" "}
                ·{" "}
                {dirty
                  ? "Unsaved changes"
                  : doc.revision
                    ? "Saved draft"
                    : "New draft"}
              </small>
            </div>
            <div className={styles.editorActions}>
              <button
                data-ui-button="secondary"
                type="button"
                className={styles.previewToggle}
                onClick={() => setPreview(!preview)}
              >
                {preview ? "Edit" : "Preview"}
              </button>
              <button
                data-ui-button="primary"
                type="button"
                onClick={() => void save()}
                disabled={
                  !!busy || !!doc.paid_at || (!dirty && doc.revision > 0)
                }
                className={styles.primary}
              >
                {busy === "save" ? (
                  <LoaderCircle size={16} />
                ) : (
                  <Check size={16} />
                )}
                Save draft
              </button>
            </div>
          </div>
          <div className={styles.feedback} aria-live="polite">
            {notice ? (
              <p role="status">
                <CheckCircle2 size={16} />
                {notice}
              </p>
            ) : null}
            {error && !dialog.current?.open ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
          </div>
          <div
            className={`${styles.editorLayout} ${preview ? styles.showPreview : ""}`}
          >
            <aside className={styles.controls}>
              <nav className={styles.tabs} aria-label="Document editor">
                {[
                  "details",
                  "content",
                  "brand",
                  ...(doc.revision ? ["activity"] : []),
                ].map((value) => (
                  <button
                    data-ui-button="nav"
                    type="button"
                    key={value}
                    aria-current={tab === value ? "page" : undefined}
                    onClick={() =>
                      value === "activity" ? void loadActivity() : setTab(value)
                    }
                  >
                    {value === "brand"
                      ? "Branding"
                      : value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </nav>
              <div className={styles.fieldScroller}>
                <fieldset
                  disabled={!!busy || (!!doc.paid_at && tab !== "activity")}
                  className={styles.editorFields}
                >
                  {tab === "details" ? (
                    <>
                      <label>
                        Document title
                        <input
                          maxLength={180}
                          value={doc.title}
                          onChange={(event) =>
                            edit((current) => ({
                              ...current,
                              title: event.target.value,
                              content: { ...current.content, reviewed: false },
                            }))
                          }
                        />
                      </label>
                      {doc.kind !== "invoice" ? (
                        <div className={styles.autofill}>
                          <span>
                            <ShieldCheck size={16} />
                            Start with saved player information
                          </span>
                          <select
                            aria-label="Player to fill"
                            value={playerId}
                            onChange={(event) =>
                              setPlayerId(event.target.value)
                            }
                          >
                            <option value="">Choose a player</option>
                            {initialData.players.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.name}
                              </option>
                            ))}
                          </select>
                          <button
                            data-ui-button="secondary"
                            type="button"
                            disabled={!playerId}
                            onClick={() => {
                              const player = initialData.players.find(
                                (item) => item.id === playerId,
                              );
                              if (player) {
                                edit((current) =>
                                  fillDocumentPlayer(current, player),
                                );
                                setNotice(
                                  doc.kind === "scouting_report"
                                    ? "Approved profile details added. Review the report before sharing."
                                    : "Player details filled. Review the terms for this player.",
                                );
                              }
                            }}
                          >
                            Fill player details
                            <ArrowRight size={15} />
                          </button>
                          <small>
                            {doc.kind === "scouting_report"
                              ? "Uses the approved public profile. Private player notes are excluded."
                              : "You can change every field below."}
                          </small>
                        </div>
                      ) : null}
                      {DOCUMENT_TEMPLATES[doc.kind].fields.map((field) => (
                        <label key={field.key}>
                          {field.label}
                          {field.required ? (
                            <span className={styles.required}> *</span>
                          ) : null}
                          {field.type === "textarea" ? (
                            <textarea
                              rows={3}
                              value={doc.content.fields[field.key] || ""}
                              onChange={(event) =>
                                setField(field.key, event.target.value)
                              }
                              placeholder={field.placeholder}
                            />
                          ) : (
                            <input
                              type={field.type || "text"}
                              value={doc.content.fields[field.key] || ""}
                              onChange={(event) =>
                                setField(field.key, event.target.value)
                              }
                              placeholder={field.placeholder}
                            />
                          )}
                        </label>
                      ))}
                      {doc.kind === "invoice" ? (
                        <section className={styles.lineEditor}>
                          <h3>Services</h3>
                          {doc.content.lines.map((line, index) => (
                            <div key={line.id}>
                              <label>
                                Service {index + 1}
                                <textarea
                                  rows={2}
                                  value={line.description}
                                  onChange={(event) =>
                                    content((c) => ({
                                      ...c,
                                      lines: c.lines.map((item) =>
                                        item.id === line.id
                                          ? {
                                              ...item,
                                              description: event.target.value,
                                            }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                              <div className={styles.twoColumns}>
                                {(["quantity", "unitPrice"] as const).map(
                                  (key) => (
                                    <label key={key}>
                                      {key === "quantity"
                                        ? "Quantity"
                                        : "Unit price"}
                                      <input
                                        inputMode="decimal"
                                        value={line[key]}
                                        onChange={(event) =>
                                          content((c) => ({
                                            ...c,
                                            lines: c.lines.map((item) =>
                                              item.id === line.id
                                                ? {
                                                    ...item,
                                                    [key]: event.target.value,
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                    </label>
                                  ),
                                )}
                              </div>
                              <button
                                data-ui-button="tertiary"
                                type="button"
                                className={styles.textButton}
                                disabled={doc.content.lines.length === 1}
                                onClick={() =>
                                  content((c) => ({
                                    ...c,
                                    lines: c.lines.filter(
                                      (item) => item.id !== line.id,
                                    ),
                                  }))
                                }
                              >
                                <Trash2 size={14} />
                                Remove service
                              </button>
                            </div>
                          ))}
                          <button
                            data-ui-button="secondary"
                            type="button"
                            disabled={doc.content.lines.length >= 30}
                            onClick={() =>
                              content((c) => ({
                                ...c,
                                lines: [
                                  ...c.lines,
                                  {
                                    id: crypto.randomUUID(),
                                    description: "",
                                    quantity: "1",
                                    unitPrice: "",
                                  },
                                ],
                              }))
                            }
                          >
                            <Plus size={16} />
                            Add service
                          </button>
                        </section>
                      ) : null}
                      <label className={styles.reviewCheck}>
                        <input
                          type="checkbox"
                          checked={doc.content.reviewed}
                          onChange={(event) =>
                            edit((current) => ({
                              ...current,
                              content: {
                                ...current.content,
                                reviewed: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>
                          {["player_contract", "mandate"].includes(doc.kind)
                            ? "The wording and terms have been reviewed for this agreement."
                            : "I have reviewed the content and sources for this recipient."}
                        </span>
                      </label>
                      {issues.length ? (
                        <details className={styles.checklist}>
                          <summary>
                            {issues.length} things to check before sharing
                          </summary>
                          <ul>
                            {issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <p className={styles.ready}>
                          <CheckCircle2 size={17} />
                          Ready for your recipient
                        </p>
                      )}
                    </>
                  ) : null}
                  {tab === "content" ? (
                    <>
                      <p className={styles.hint}>
                        Edit the wording and order. Variables such as{" "}
                        {"{{player_name}}"} update from Details.
                      </p>
                      {doc.content.sections.map((section, index) => (
                        <div className={styles.sectionEditor} key={section.id}>
                          <div className={styles.sectionEditorHead}>
                            <span>Section {index + 1}</span>
                            <button
                              data-ui-button="icon"
                              type="button"
                              aria-label={`Move section ${index + 1} up`}
                              disabled={index === 0}
                              onClick={() => sectionMove(index, -1)}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              data-ui-button="icon"
                              type="button"
                              aria-label={`Move section ${index + 1} down`}
                              disabled={
                                index === doc.content.sections.length - 1
                              }
                              onClick={() => sectionMove(index, 1)}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              data-ui-button="icon"
                              type="button"
                              aria-label={`Remove section ${index + 1}`}
                              onClick={() =>
                                content((c) => ({
                                  ...c,
                                  sections: c.sections.filter(
                                    (item) => item.id !== section.id,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <label>
                            Heading
                            <input
                              aria-label={`Section ${index + 1} heading`}
                              value={section.title}
                              maxLength={200}
                              onChange={(event) =>
                                content((c) => ({
                                  ...c,
                                  sections: c.sections.map((item) =>
                                    item.id === section.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label>
                            Wording
                            <textarea
                              aria-label={`Section ${index + 1} wording`}
                              rows={7}
                              value={section.body}
                              maxLength={20000}
                              onChange={(event) =>
                                content((c) => ({
                                  ...c,
                                  sections: c.sections.map((item) =>
                                    item.id === section.id
                                      ? { ...item, body: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label className={styles.checkbox}>
                            <input
                              type="checkbox"
                              checked={!!section.pageBreak}
                              onChange={(event) =>
                                content((c) => ({
                                  ...c,
                                  sections: c.sections.map((item) =>
                                    item.id === section.id
                                      ? {
                                          ...item,
                                          pageBreak: event.target.checked,
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            Start on a new page
                          </label>
                        </div>
                      ))}
                      <button
                        data-ui-button="secondary"
                        type="button"
                        disabled={doc.content.sections.length >= 30}
                        onClick={() =>
                          content((c) => ({
                            ...c,
                            sections: [
                              ...c.sections,
                              {
                                id: crypto.randomUUID(),
                                title: "New section",
                                body: "",
                              },
                            ],
                          }))
                        }
                      >
                        <Plus size={16} />
                        Add section
                      </button>
                      <details className={styles.variableHelp}>
                        <summary>Available variables</summary>
                        <p>
                          {[
                            ...DOCUMENT_TEMPLATES[doc.kind].fields.map(
                              (field) => field.key,
                            ),
                            "agency_name",
                            "agency_legal_name",
                            "agency_email",
                            "agency_phone",
                          ].map((key) => (
                            <code key={key}>{"{{" + key + "}}"}</code>
                          ))}
                        </p>
                      </details>
                      <h3>Sources</h3>
                      <p className={styles.hint}>
                        Add the evidence behind a report or claim.
                      </p>
                      {doc.content.sources.map((source, index) => (
                        <div key={index} className={styles.sourceEditor}>
                          <label>
                            Source description
                            <input
                              value={source.label}
                              onChange={(event) =>
                                content((c) => ({
                                  ...c,
                                  sources: c.sources.map((item, i) =>
                                    i === index
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label>
                            HTTPS source URL
                            <input
                              type="url"
                              value={source.url}
                              onChange={(event) =>
                                content((c) => ({
                                  ...c,
                                  sources: c.sources.map((item, i) =>
                                    i === index
                                      ? { ...item, url: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <button
                            data-ui-button="secondary"
                            type="button"
                            onClick={() =>
                              content((c) => ({
                                ...c,
                                sources: c.sources.filter(
                                  (_, i) => i !== index,
                                ),
                              }))
                            }
                          >
                            Remove source
                          </button>
                        </div>
                      ))}
                      <button
                        data-ui-button="secondary"
                        type="button"
                        disabled={doc.content.sources.length >= 30}
                        onClick={() =>
                          content((c) => ({
                            ...c,
                            sources: [
                              ...c.sources,
                              {
                                label: "",
                                url: "",
                                capturedAt: new Date().toISOString(),
                              },
                            ],
                          }))
                        }
                      >
                        <Plus size={16} />
                        Add source
                      </button>
                    </>
                  ) : null}
                  {tab === "brand" ? (
                    <>
                      <h3>Your agency, your document</h3>
                      <p className={styles.hint}>
                        Starts with your workspace branding. Save as an agency
                        template to reuse these choices.
                      </p>
                      {brandField("name", "Agency display name")}
                      {brandField("legalName", "Legal entity name")}
                      {brandField("logoUrl", "Logo URL")}
                      <div className={styles.twoColumns}>
                        {brandField("primary", "Primary colour")}
                        {brandField("accent", "Accent colour")}
                      </div>
                      {brandField("email", "Contact email")}
                      {brandField("phone", "Contact phone")}
                      {brandField("website", "Website")}
                      {brandField("address", "Agency address", true)}
                      {brandField("registration", "Registration / tax details")}
                      {doc.kind === "invoice"
                        ? brandField("bankDetails", "Bank details", true)
                        : null}
                    </>
                  ) : null}
                  {tab === "activity" ? (
                    <>
                      <h3>Document activity</h3>
                      {busy === "activity" ? (
                        <p role="status">Loading activity…</p>
                      ) : (
                        activity.map((event, index) => (
                          <div className={styles.event} key={index}>
                            <span />
                            <div>
                              <strong>
                                {eventLabels[event.kind] || event.kind}
                              </strong>
                              <small>
                                {new Date(event.created_at).toLocaleString(
                                  "en-GB",
                                )}
                                {event.document_revision
                                  ? ` · Version ${event.document_revision}`
                                  : ""}
                              </small>
                              {event.note ? <p>{event.note}</p> : null}
                            </div>
                          </div>
                        ))
                      )}
                      {doc.kind === "invoice" ? (
                        <>
                          <p className={styles.hint}>
                            Link opens are tracked when the recipient chooses to
                            view. Delivery and payment settlement need a
                            connected provider; you can record them manually.
                          </p>
                          <button
                            data-ui-button="secondary"
                            type="button"
                            disabled={dirty || issues.length > 0}
                            onClick={() => openDialog("sent")}
                          >
                            Record sent
                          </button>
                          <button
                            data-ui-button="secondary"
                            type="button"
                            disabled={
                              dirty || !!doc.paid_at || issues.length > 0
                            }
                            onClick={() => openDialog("paid")}
                          >
                            Record payment
                          </button>
                        </>
                      ) : null}
                      <button
                        data-ui-button="secondary"
                        type="button"
                        disabled={dirty || !doc.active_links}
                        onClick={() => openDialog("revoke")}
                      >
                        Revoke all review links
                      </button>
                      <button
                        data-ui-button="tertiary"
                        type="button"
                        className={styles.textButton}
                        onClick={() => openDialog("archive")}
                      >
                        <Trash2 size={15} />
                        Archive {doc.is_template ? "template" : "document"}
                      </button>
                    </>
                  ) : null}
                </fieldset>
              </div>
              <div className={styles.controlFooter}>
                <DocumentExportButtons doc={doc} onError={setError} />
                <button
                  data-ui-button="secondary"
                  type="button"
                  disabled={
                    !!busy ||
                    dirty ||
                    !doc.revision ||
                    doc.is_template ||
                    issues.length > 0
                  }
                  onClick={() => openDialog("share")}
                  title={
                    dirty
                      ? "Save changes before sharing"
                      : issues.length
                        ? "Complete the review checklist first"
                        : undefined
                  }
                >
                  <Link2 size={16} />
                  Share
                </button>
                <button
                  data-ui-button="secondary"
                  type="button"
                  disabled={!!busy || dirty || !doc.revision}
                  onClick={asTemplate}
                >
                  <LayoutTemplate size={15} />
                  Save as template
                </button>
                {doc.revision ? (
                  <button
                    data-ui-button="secondary"
                    type="button"
                    disabled={!!busy}
                    onClick={duplicate}
                  >
                    <Copy size={15} />
                    Duplicate document
                  </button>
                ) : null}
                <small>
                  {doc.paid_at
                    ? "Payment recorded. Duplicate this invoice to create a revision."
                    : "Word stays editable. Edit here and regenerate PDF anytime."}
                </small>
              </div>
            </aside>
            <div className={styles.preview}>
              <span className={styles.previewLabel}>
                LIVE PREVIEW{" "}
                <span>
                  {doc.kind === "agency_pitch"
                    ? "Landscape deck"
                    : "A4 document"}
                </span>
              </span>
              <AgencyDocumentPreview doc={doc} />
            </div>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={
          dialogMode === "discard"
            ? "Unsaved document changes"
            : dialogMode === "share"
              ? "Share document"
              : "Document action"
        }
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <header>
          <h2>
            {dialogMode === "discard"
              ? "Keep your changes?"
              : dialogMode === "share"
                ? "Share a considered version"
                : dialogMode === "paid"
                  ? "Record a payment"
                  : dialogMode === "sent"
                    ? "Record that it was sent"
                    : dialogMode === "revoke"
                      ? "Revoke review links?"
                      : "Archive this document?"}
          </h2>
          <button
            data-ui-button="icon"
            type="button"
            disabled={!!busy}
            aria-label="Close document dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        {dialogMode === "discard" ? (
          <>
            <p>You have unsaved changes to this document.</p>
            <div className={styles.dialogActions}>
              <button
                data-ui-button="secondary"
                type="button"
                onClick={() => dialog.current?.close()}
              >
                Keep editing
              </button>
              <button
                data-ui-button="secondary"
                type="button"
                onClick={() => {
                  dialog.current?.close();
                  pending.current?.();
                  pending.current = null;
                }}
              >
                Discard changes
              </button>
            </div>
          </>
        ) : dialogMode === "share" ? (
          <>
            <p>
              Anyone with this link can view and download this approved version.
              The link expires after 14 days. Later draft edits will not change
              it.
            </p>
            {shareUrl ? (
              <>
                <label>
                  Document link
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
                <button
                  data-ui-button="secondary"
                  type="button"
                  onClick={() => void copy()}
                >
                  <Copy size={16} />
                  Copy link
                </button>
              </>
            ) : (
              <button
                data-ui-button="primary"
                type="button"
                className={styles.primary}
                disabled={!!busy}
                onClick={() => void action("share")}
              >
                {busy ? "Creating…" : "Create review link"}
                <ArrowRight size={16} />
              </button>
            )}
          </>
        ) : dialogMode === "sent" || dialogMode === "paid" ? (
          <>
            <p>
              {dialogMode === "paid"
                ? "This records a payment manually. It does not verify a bank transfer or payment-provider settlement."
                : "This records that you sent the invoice outside this workspace. It does not confirm delivery."}
            </p>
            <label>
              {dialogMode === "paid"
                ? "Payment date and reference"
                : "Delivery method and reference"}
              <textarea
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
              />
            </label>
            <button
              data-ui-button="secondary"
              type="button"
              disabled={!!busy || !note.trim()}
              onClick={() => void action(dialogMode)}
            >
              {busy ? "Recording…" : "Confirm manual record"}
            </button>
          </>
        ) : (
          <>
            <p>
              {dialogMode === "revoke"
                ? "Existing recipient links will stop opening. Saved documents and recorded activity remain available."
                : "This hides the document from the library and revokes its recipient links."}
            </p>
            <button
              data-ui-button="secondary"
              type="button"
              disabled={!!busy}
              onClick={() => void action(dialogMode)}
            >
              {busy
                ? "Updating…"
                : dialogMode === "revoke"
                  ? "Revoke links"
                  : "Archive document"}
            </button>
          </>
        )}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {notice && shareUrl ? <p role="status">{notice}</p> : null}
      </dialog>
    </main>
  );
}
