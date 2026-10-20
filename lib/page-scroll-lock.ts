type SavedProperty = { value: string; priority: string };
type ScrollLock = {
  count: number;
  axes: SavedProperty[];
  gutter: SavedProperty | null;
};
const locks = new WeakMap<HTMLElement, ScrollLock>();
const inertLocks = new WeakMap<
  HTMLElement,
  { count: number; previous: boolean }
>();
const read = (style: CSSStyleDeclaration, name: string): SavedProperty => ({
  value: style.getPropertyValue(name),
  priority: style.getPropertyPriority(name),
});
const restore = (
  style: CSSStyleDeclaration,
  name: string,
  saved: SavedProperty,
) => {
  if (saved.value) style.setProperty(name, saved.value, saved.priority);
  else style.removeProperty(name);
};

/** Each overlay owns a lease. Cleanup order cannot unlock another overlay or strand the page. */
export function lockPageScroll(owner: Document = document): () => void {
  const body = owner.body,
    root = owner.documentElement;
  let state = locks.get(body);
  if (state) state.count++;
  else {
    const hasClassicScrollbar =
      !!owner.defaultView && owner.defaultView.innerWidth > root.clientWidth;
    state = {
      count: 1,
      axes: [read(body.style, "overflow-x"), read(body.style, "overflow-y")],
      gutter: hasClassicScrollbar ? read(root.style, "scrollbar-gutter") : null,
    };
    locks.set(body, state);
    if (
      hasClassicScrollbar &&
      !owner.defaultView
        ?.getComputedStyle(root)
        .scrollbarGutter.includes("stable")
    )
      root.style.setProperty("scrollbar-gutter", "stable");
    body.style.setProperty("overflow", "hidden", "important");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count) return;
    body.style.removeProperty("overflow");
    restore(body.style, "overflow-x", state.axes[0]);
    restore(body.style, "overflow-y", state.axes[1]);
    if (state.gutter) restore(root.style, "scrollbar-gutter", state.gutter);
    locks.delete(body);
  };
}

/** Background isolation has the same ownership rule as scroll, including nested portals. */
export function isolateElements(elements: HTMLElement[]): () => void {
  const unique = [...new Set(elements)];
  for (const element of unique) {
    const state = inertLocks.get(element);
    if (state) state.count++;
    else {
      inertLocks.set(element, { count: 1, previous: element.inert });
      element.inert = true;
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of unique) {
      const state = inertLocks.get(element)!;
      if (--state.count) continue;
      element.inert = state.previous;
      inertLocks.delete(element);
    }
  };
}
