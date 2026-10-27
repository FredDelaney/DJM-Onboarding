"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { WorkspaceSection } from "@/lib/workspace-mobile-navigation";
import styles from "./PeopleViewSwitcher.module.css";
export default function PeopleViewSwitcher({
  basePath,
  view,
  onNavigate,
}: {
  basePath: string;
  view: string;
  onNavigate: (view: WorkspaceSection, href: string) => void;
}) {
  const params = useSearchParams(),
    selected =
      view === "players"
        ? "Players"
        : params.get("network") === "people"
          ? "Contacts"
          : "Clubs";
  const items = [
    {
      label: "Players",
      view: "players" as const,
      href: basePath + "?view=players",
    },
    {
      label: "Clubs",
      view: "network" as const,
      href: basePath + "?view=network&network=clubs",
    },
    {
      label: "Contacts",
      view: "network" as const,
      href: basePath + "?view=network&network=people",
    },
  ];
  const choose = (
    event: MouseEvent<HTMLAnchorElement>,
    item: (typeof items)[number],
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onNavigate(item.view, item.href);
  };
  return (
    <nav className={styles.nav} aria-label="People categories">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={selected === item.label ? "page" : undefined}
          onClick={(event) => choose(event, item)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
