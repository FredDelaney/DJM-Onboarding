export type WorkspaceSection =
  "home" | "players" | "network" | "calendar" | "opportunities" | "business";
export type WorkspaceDestination = {
  label: string;
  href?: string;
  view?: WorkspaceSection;
  active?: boolean;
};
export function workspaceMobileNavigation(
  basePath: string,
  view: string,
  section?: string,
): WorkspaceDestination[] {
  const recruitment = view === "players" && section === "recruitment";
  return [
    { label: "Today", href: basePath, view: "home", active: view === "home" },
    { label: "Search" },
    { label: "Tell ReDream" },
    {
      label: "People",
      href: basePath + "?view=players",
      view: "players",
      active: !recruitment && ["players", "network"].includes(view),
    },
    {
      label: "More",
      active:
        recruitment ||
        ["calendar", "opportunities", "business", "settings"].includes(view),
    },
  ];
}
export function workspaceMoreLinks(
  basePath: string,
  canSeeBusiness: boolean,
  workspaceSlug?: string,
): WorkspaceDestination[] {
  return [
    { label: "Calendar", href: basePath + "?view=calendar", view: "calendar" },
    {
      label: "Recruitment",
      href: basePath + "?view=players&tab=recruitment",
      view: "players",
    },
    ...(canSeeBusiness
      ? [
          {
            label: "Opportunities",
            href: basePath + "?view=opportunities",
            view: "opportunities" as const,
          },
          {
            label: "Business",
            href: basePath + "?view=business",
            view: "business" as const,
          },
          {
            label: "Documents",
            href: workspaceSlug
              ? "/workspace/" + encodeURIComponent(workspaceSlug) + "/documents"
              : basePath + "/documents",
          },
        ]
      : []),
  ];
}
