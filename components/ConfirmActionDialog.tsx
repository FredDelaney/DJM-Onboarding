"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { isolateElements, lockPageScroll } from "@/lib/page-scroll-lock";
import { useVisualViewport } from "./useVisualViewport";
import styles from "./ConfirmActionDialog.module.css";

export default function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "warning";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const id = useId(),
    dialog = useRef<HTMLDivElement>(null),
    backdrop = useRef<HTMLDivElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  const viewport = useVisualViewport(open);
  const [theme, setTheme] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = lockPageScroll();
    const releaseBackground = isolateElements(
      [...document.body.children].filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && !node.contains(backdrop.current),
      ),
    );
    const inherited = previous ? getComputedStyle(previous) : null;
    setTheme(
      Object.fromEntries(
        ["--tenant-primary", "--tenant-on-primary"].map((key) => [
          key,
          inherited?.getPropertyValue(key).trim() || "",
        ]),
      ) as CSSProperties,
    );
    queueMicrotask(() =>
      latest.current.busy ? dialog.current?.focus() : cancel.current?.focus(),
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();
      const all = [
        ...(dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) || []),
      ];
      const first = all[0],
        last = all[all.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      releaseBackground();
      releaseScroll();
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest("[inert]"))
          previous.focus();
      });
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={backdrop}
      className={styles.backdrop}
      style={{
        ...theme,
        ...(viewport
          ? { top: viewport.top, height: viewport.height, bottom: "auto" }
          : {}),
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        className={
          tone === "warning"
            ? styles.dialog + " " + styles.warning
            : styles.dialog
        }
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={id + "-title"}
        aria-describedby={id + "-description"}
      >
        <div className={styles.icon}>
          <AlertTriangle size={23} />
        </div>
        <p className={styles.kicker}>
          {tone === "danger" ? "Please confirm" : "Unsaved changes"}
        </p>
        <h2 id={id + "-title"}>{title}</h2>
        <p id={id + "-description"}>{description}</p>
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={styles.cancel}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirm}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
