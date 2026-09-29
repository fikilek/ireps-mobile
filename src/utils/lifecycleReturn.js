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

/**
 * Empty the stack a worker is leaving — but only when there is one to empty.
 *
 * `dismissAll()` with nothing behind it makes React Navigation report "The action 'POP_TO_TOP' was not
 * handled by any navigator" — and it does that by logging an error, which paints a red box across the
 * worker's screen after a submit that worked (owner's phone, 2026-09-29). A try/catch does not help,
 * because nothing is thrown. Asking first does. The No Access screen has asked first since 27 September;
 * this is the same question, in one place, for every form that leaves a stack behind.
 */
export function dismissFormStack(router) {
  try {
    // Only a definite "there is nothing behind you" stops the dismiss. Where the router cannot answer
    // the question at all, the old behaviour stands: emptying the stack is what the worker needs, and a
    // warning is better than a form left open behind them.
    if (typeof router?.canDismiss === "function" && !router.canDismiss()) return false;

    router?.dismissAll?.();
    return true;
  } catch {
    return false;
  }
}

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

  // Crossing tabs, navigate is the only move that works - but unlike replace it leaves the
  // finished form standing in the tab being left. The worker came back to Premises later and
  // found New Premise still open, could not get out of it, and cleared it only to meet it
  // again (owner, 2026-09-27). So the tab being left is emptied first.
  if (move === "navigate") dismissFormStack(router);

  router?.[move]?.(href);
  return move;
}
