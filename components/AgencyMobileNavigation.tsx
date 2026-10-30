"use client";
import { lockPageScroll } from '@/lib/page-scroll-lock';
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import {
  CalendarDays,
  ChevronRight,
  Coins,
  FileText,
  Home,
  MoreHorizontal,
  PlugZap,
  Settings,
  Target,
  Users,
  X,
} from "lucide-react";
import AiLauncher from "./AiLauncher";
import WorkspaceSearch from "./WorkspaceSearch";
import {
  workspaceMobileNavigation,
  workspaceMoreLinks,
  type WorkspaceSection,
} from "@/lib/workspace-mobile-navigation";
import styles from "./AgencyMobileNavigation.module.css";

type Props = {
  basePath: string;
  workspaceSlug?: string;
  view: string;
  canSeeBusiness: boolean;
  search: ComponentProps<typeof WorkspaceSearch>;
  onNavigate: (view: WorkspaceSection, href: string) => void;
  onWarm: (view: WorkspaceSection) => void;
  onConnections: () => void;
  onCaptureCompleted: () => void;
};
export default function AgencyMobileNavigation({
  basePath,
  workspaceSlug,
  view,
  canSeeBusiness,
  search,
  onNavigate,
  onWarm,
  onConnections,
  onCaptureCompleted,
}: Props) {
  const params = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => {
      if (!media.matches) {
        sheet.current?.close();
        setMoreOpen(false);
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const releaseScroll = lockPageScroll();

    return () => {
      releaseScroll();
    };
  }, [moreOpen]);
  const destinations = workspaceMobileNavigation(
      basePath,
      view,
      params.get("tab") || undefined,
    ),
    links = workspaceMoreLinks(basePath, canSeeBusiness, workspaceSlug);
  const navigate = (
    event: MouseEvent<HTMLAnchorElement>,
    target: WorkspaceSection,
    href: string,
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
    sheet.current?.close();
    setMoreOpen(false);
    onNavigate(target, href);
  };
  return (
    <div className={styles.root} data-interface="calm" data-workspace-mobile-navigation>
      <nav className={styles.bar} aria-label="Mobile workspace">
        <Link
          href={destinations[0].href!}
          aria-current={destinations[0].active ? "page" : undefined}
          onPointerDown={() => onWarm("home")}
          onClick={(event) => navigate(event, "home", basePath)}
        >
          <Home size={21} />
          <span>Today</span>
        </Link>
        <WorkspaceSearch
          {...search}
          compact
          triggerLabel="Search"
          className={styles.search}
        />
        <AiLauncher
          navigation
          className={styles.capture}
          onCaptureCompleted={onCaptureCompleted}
        />
        <Link
          href={destinations[3].href!}
          aria-current={destinations[3].active ? "page" : undefined}
          onPointerDown={() => onWarm("players")}
          onClick={(event) => navigate(event, "players", destinations[3].href!)}
        >
          <Users size={21} />
          <span>People</span>
        </Link>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={destinations[4].active ? "page" : undefined}
          onClick={() => {
            sheet.current?.showModal();
            setMoreOpen(true);
          }}
        >
          <MoreHorizontal size={21} />
          <span>More</span>
        </button>
      </nav>
      <dialog
        ref={sheet}
        className={styles.sheet}
        aria-label="More workspace options"
        aria-modal={moreOpen ? "true" : undefined}
        onClose={() => setMoreOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            event.currentTarget.close();
        }}
      >
        <header>
          <h2>More</h2>
          <button
            type="button"
            aria-label="Close more options"
            onClick={() => sheet.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.links}>
          {links.map((item) => {
            const Icon =
              item.view === "calendar"
                ? CalendarDays
                : item.label === "Documents"
                  ? FileText
                  : item.view === "business"
                    ? Coins
                    : item.view === "opportunities"
                      ? Target
                      : Users;
            return (
              <Link
                key={item.label}
                href={item.href!}
                onPointerDown={() => {
                  if (item.view) onWarm(item.view);
                }}
                onClick={(event) => {
                  if (item.view) navigate(event, item.view, item.href!);
                  else {
                    sheet.current?.close();
                    setMoreOpen(false);
                  }
                }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                <ChevronRight size={17} />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              sheet.current?.close();
              setMoreOpen(false);
              onConnections();
            }}
          >
            <PlugZap size={20} />
            <span>Connections</span>
            <ChevronRight size={17} />
          </button>
          <Link href="/settings" onClick={() => sheet.current?.close()}>
            <Settings size={20} />
            <span>Settings</span>
            <ChevronRight size={17} />
          </Link>
        </div>
      </dialog>
    </div>
  );
}
