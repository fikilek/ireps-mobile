// Where a worker lands when a lifecycle form is done.
//
// Disconnection, Reconnection and Removal live in the ASTs tab. When the work came from a batch they go
// back to My Work Orders, which is in the Admin tab - and a tab's own navigator cannot REPLACE a screen
// that lives in another tab. React Navigation answers "The action 'REPLACE' ... was not handled by any
// navigator", and the worker sees that in red after a submit that actually worked (owner, 2026-09-24,
// after a Meter Discovery found illegally connected and the disconnection that followed).
//
// So: replace inside the tab, where replacing is what we want - the finished form is not left behind -
// and navigate across tabs, which is the only move a tab change understands.
export const LIFECYCLE_TAB = "/(tabs)/asts";

const pathOf = (href) => {
  if (typeof href === "string") return href.trim();
  return String(href?.pathname ?? "").trim();
};

export function isSameTabRoute(href, tab = LIFECYCLE_TAB) {
  const path = pathOf(href);
  if (!path) return false;
  return path === tab || path.startsWith(`${tab}/`) || path.startsWith(`${tab}?`);
}

export function returnAfterLifecycleWork(router, href, tab = LIFECYCLE_TAB) {
  if (!pathOf(href)) return null;

  const move = isSameTabRoute(href, tab) ? "replace" : "navigate";
  router?.[move]?.(href);
  return move;
}
