"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { captureWorkspaceReturnPath } from "@/lib/capture-return-path";
import { useAiWorkspace } from "./useAiWorkspace";
import styles from "./CaptureWorkspaceHeader.module.css";
export default function CaptureWorkspaceHeader({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  const search = useSearchParams(),
    resolved = useAiWorkspace();
  const href = captureWorkspaceReturnPath(
    search.get("from"),
    workspaceSlug || resolved || "",
  );
  const name = (
    search.get("player_name") ||
    search.get("person_name") ||
    search.get("organisation_name") ||
    search.get("prospect_name") ||
    ""
  ).slice(0, 120);
  const type = search.get("context_type"),
    label =
      type === "player"
        ? "player"
        : type === "club"
          ? "club"
          : type === "contact"
            ? "contact"
            : type === "recruitment"
              ? "recruitment record"
              : type === "opportunity"
                ? "opportunity"
                : "workspace";
  return (
    <header className={styles.header} data-interface="calm">
      <Link href={href}>
        <ArrowLeft size={16} />
        Back to {label}
      </Link>
      <h1>Tell ReDream</h1>
      {name ? <p>{name}</p> : null}
    </header>
  );
}
