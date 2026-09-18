// TB-R052: live Firestore subscriptions for My Work Orders. They follow a changing key (the worker's teams),
// never fail silently, and are tried again after a failure. No Firebase import: callers pass the listener, so
// this runs in tests without a database.

// TB-R052: My Work Orders keeps its connections open for up to 24 hours after the worker leaves the screen.
export const MY_WORK_ORDERS_KEEP_SECONDS = 24 * 60 * 60;

// TB-R052: a failed connection is tried again after 15 seconds.
export const LIVE_STREAM_RETRY_MS = 15000;

// Firestore allows at most 30 values in one "in" filter.
export const FIRESTORE_IN_LIMIT = 30;

// TB-R052: the three most recently opened batches are kept live.
export const KEPT_BATCHES = 3;

// The status of a live list:
// - CONNECTING until the server has answered it;
// - LIVE while the server answers;
// - NOT_UP_TO_DATE when, after a server answer, only the phone's memory answers (Firestore cannot reach the
//   server), so the list may be out of date;
// - ERROR after a failure, until the server answers again.
export const LIVE_STREAM_STATUS = Object.freeze({
  CONNECTING: "CONNECTING",
  LIVE: "LIVE",
  NOT_UP_TO_DATE: "NOT_UP_TO_DATE",
  ERROR: "ERROR",
});

// TB-R052: the statuses that show "Not up to date — reconnecting".
export function isLiveStreamOutOfDate(status) {
  return (
    status === LIVE_STREAM_STATUS.ERROR ||
    status === LIVE_STREAM_STATUS.NOT_UP_TO_DATE
  );
}

// Whether a Firestore snapshot came from the phone's memory instead of the server.
export function readFromCache(snapshot) {
  return snapshot?.metadata?.fromCache === true;
}

// A Firestore document ID never contains "/".
export function isDocumentId(value) {
  const clean = String(value ?? "").trim();
  return Boolean(clean) && !clean.includes("/");
}

// Sorted, de-duplicated document IDs; anything that cannot be a document ID is left out.
export function uniqueCleanIds(values = []) {
  const ids = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (isDocumentId(value)) ids.add(String(value).trim());
  }
  return [...ids].sort();
}

export function chunkIds(ids = [], size = FIRESTORE_IN_LIMIT) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

// One key for a set of IDs, and back. An empty set has no key (null): nothing to listen to.
export function idsKey(values = []) {
  const ids = uniqueCleanIds(values);
  return ids.length ? ids.join("|") : null;
}

export function idsFromKey(key) {
  return key ? String(key).split("|") : [];
}

// The worst status of several live lists: ERROR, then NOT_UP_TO_DATE, then CONNECTING, else LIVE.
export function combineLiveStatuses(statuses = []) {
  for (const status of [
    LIVE_STREAM_STATUS.ERROR,
    LIVE_STREAM_STATUS.NOT_UP_TO_DATE,
    LIVE_STREAM_STATUS.CONNECTING,
  ]) {
    if (statuses.includes(status)) return status;
  }
  return LIVE_STREAM_STATUS.LIVE;
}

// TB-R052: a refetch (a mutation's tag invalidation, or a manual refetch) runs an endpoint's queryFn again and
// replaces the cached data with what it returns. A live list's queryFn answers with what its listeners last
// published, so a refetch never wipes the list. Each running list opens its key; only it may close it.
export function createLiveDataStore() {
  const entries = new Map();

  return {
    read(key, fallback) {
      return entries.has(key) ? entries.get(key).data : fallback;
    },
    open(key) {
      const owner = {};
      return {
        publish(data) {
          entries.set(key, { owner, data });
          return data;
        },
        close() {
          if (entries.get(key)?.owner === owner) entries.delete(key);
        },
      };
    },
  };
}

// Listens to one "in" query per group of 30 IDs and answers with all their documents together, once every
// group has answered. listen(ids, onDocs, onError) opens one group and returns its unsubscribe function;
// onDocs(docs, { fromCache }) answers. The combined answer is from the phone's memory when any group's is.
export function listenInChunks({ ids = [], listen, next, error, size = FIRESTORE_IN_LIMIT }) {
  const chunks = chunkIds(ids, size);
  const answers = chunks.map(() => null);
  let ended = false;

  if (!chunks.length) {
    next([], { fromCache: false });
    return () => {};
  }

  const unsubscribes = chunks.map((chunk, index) =>
    listen(
      chunk,
      (docs, meta = {}) => {
        if (ended) return;
        answers[index] = { docs: Array.isArray(docs) ? docs : [], fromCache: meta?.fromCache === true };
        if (!answers.every(Boolean)) return;
        next(
          answers.flatMap((answer) => answer.docs),
          { fromCache: answers.some((answer) => answer.fromCache) },
        );
      },
      (failure) => {
        if (ended) return;
        error(failure);
      },
    ),
  );

  return () => {
    ended = true;
    for (const unsubscribe of unsubscribes) {
      if (typeof unsubscribe === "function") unsubscribe();
    }
  };
}

// One live subscription for the current key.
// - setKey(key) replaces a subscription for another key and keeps the one for the same key; null closes it.
// - subscribe(key, { isCurrent, live, fail }) opens the listener and returns its unsubscribe function. Its
//   callbacks check isCurrent(), call live({ fromCache }) on every answer and fail(error) on a failure.
// - live() reports LIVE for a server answer. An answer from the phone's memory is CONNECTING until the server
//   has answered this key once, and NOT_UP_TO_DATE after that. live() returns whether the server has answered
//   this key.
// - A failure ends the listener, reports ERROR and subscribes again after retryMs while the key is unchanged.
// - stop() ends everything; nothing is reported after it.
export function createFollowingSubscription({
  subscribe,
  onStatus = () => {},
  retryMs = LIVE_STREAM_RETRY_MS,
  timers = { setTimeout, clearTimeout },
}) {
  let key = null;
  let unsubscribe = null;
  let retryTimer = null;
  let generation = 0;
  let stopped = false;
  let serverAnswered = false;

  const clearRetry = () => {
    if (retryTimer === null) return;
    timers.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const close = () => {
    generation += 1;
    clearRetry();
    const current = unsubscribe;
    unsubscribe = null;
    if (typeof current === "function") current();
  };

  const open = () => {
    const mine = generation;
    const isCurrent = () => !stopped && mine === generation;

    const live = (meta = {}) => {
      if (!isCurrent()) return false;
      if (meta?.fromCache === true) {
        onStatus(serverAnswered ? LIVE_STREAM_STATUS.NOT_UP_TO_DATE : LIVE_STREAM_STATUS.CONNECTING);
      } else {
        serverAnswered = true;
        onStatus(LIVE_STREAM_STATUS.LIVE);
      }
      return serverAnswered;
    };

    const fail = (failure) => {
      if (!isCurrent()) return;
      close();
      onStatus(LIVE_STREAM_STATUS.ERROR, failure);
      retryTimer = timers.setTimeout(() => {
        retryTimer = null;
        if (!stopped && key !== null) open();
      }, retryMs);
    };

    let returned = null;
    try {
      returned = subscribe(key, { isCurrent, live, fail });
    } catch (failure) {
      fail(failure);
      return;
    }

    // A listener that failed while it was being opened is already replaced by the retry.
    if (isCurrent()) unsubscribe = returned;
    else if (typeof returned === "function") returned();
  };

  return {
    get key() {
      return key;
    },
    setKey(nextKey) {
      if (stopped) return;
      const clean = nextKey ?? null;
      if (clean === key && clean !== null && (unsubscribe !== null || retryTimer !== null)) return;
      close();
      if (clean !== key) serverAnswered = false;
      key = clean;
      if (key === null) return;
      onStatus(LIVE_STREAM_STATUS.CONNECTING);
      open();
    },
    stop() {
      if (stopped) return;
      close();
      stopped = true;
      key = null;
    },
  };
}

// TB-R052: keeps the most recently opened batches live for up to 24 hours after the worker leaves them.
// - keep(id) holds a batch (hold(id) returns its release function) or, when already held, makes it the most
//   recent and starts its 24 hours again.
// - Beyond maxKept batches the least recently opened one is let go; a batch is also let go after keepMs.
// - releaseAll() lets every batch go (sign-out).
export function createBatchKeeper({
  hold,
  maxKept = KEPT_BATCHES,
  keepMs = MY_WORK_ORDERS_KEEP_SECONDS * 1000,
  timers = { setTimeout, clearTimeout },
}) {
  // In order of last use: the first entry is the least recently opened.
  const kept = new Map();

  const letGo = (id) => {
    const entry = kept.get(id);
    if (!entry) return;
    kept.delete(id);
    timers.clearTimeout(entry.timer);
    entry.release();
  };

  return {
    keep(batchId) {
      const id = String(batchId ?? "").trim();
      if (!id) return;

      const existing = kept.get(id);
      let release;
      if (existing) {
        kept.delete(id);
        timers.clearTimeout(existing.timer);
        release = existing.release;
      } else {
        const returned = hold(id);
        release = typeof returned === "function" ? returned : () => {};
      }

      kept.set(id, { release, timer: timers.setTimeout(() => letGo(id), keepMs) });
      while (kept.size > maxKept) letGo(kept.keys().next().value);
    },
    releaseAll() {
      for (const id of [...kept.keys()]) letGo(id);
    },
    get keptIds() {
      return [...kept.keys()];
    },
  };
}

// TB-R052: the worker's teams, then the documents allocated to the worker's teams or service provider (and,
// with includeUid, to the worker), read live. The documents are read again whenever the worker's teams change.
// - listenTeams(uid, onTeams, onError) and listenAllocated(ids, onDocs, onError) open listeners and return
//   their unsubscribe functions; onTeams and onDocs answer (docs, { fromCache }).
// - onChange({ docs, loaded, stream, teamIds }) reports every change. loaded is set once the server has answered
//   both the teams and the documents (the last documents stay while the list reconnects or re-reads); stream is
//   the combined status.
// Returns stop().
export function followActorAllocatedDocuments({
  uid,
  spId,
  includeUid = false,
  listenTeams,
  listenAllocated,
  onChange,
  retryMs = LIVE_STREAM_RETRY_MS,
  timers = { setTimeout, clearTimeout },
}) {
  const cleanUid = String(uid ?? "").trim();
  const cleanSpId = String(spId ?? "").trim();
  const state = {
    teamsStatus: LIVE_STREAM_STATUS.CONNECTING,
    docsStatus: LIVE_STREAM_STATUS.CONNECTING,
    teamsFromServer: false,
    // Whether the server has answered the documents for the current teams.
    docsFromServer: false,
    teamIds: [],
    docs: [],
    loaded: false,
  };

  const markLoadedWhenServerAnswered = () => {
    if (state.teamsFromServer && state.docsFromServer) state.loaded = true;
  };
  let stopped = false;

  const report = () => {
    if (stopped) return;
    onChange({
      docs: state.docs,
      loaded: state.loaded,
      stream: combineLiveStatuses([state.teamsStatus, state.docsStatus]),
      teamIds: state.teamIds,
    });
  };

  const allocated = createFollowingSubscription({
    retryMs,
    timers,
    subscribe: (key, handlers) =>
      listenInChunks({
        ids: idsFromKey(key),
        listen: listenAllocated,
        next: (docs, meta) => {
          if (!handlers.isCurrent()) return;
          const fromCache = meta?.fromCache === true;
          if (fromCache && state.loaded && !state.docsFromServer) {
            // After a team change, a list already read keeps its server-read documents until the server answers
            // for the new teams, and says it may be out of date meanwhile.
            handlers.live(meta);
            state.docsStatus = LIVE_STREAM_STATUS.NOT_UP_TO_DATE;
            report();
            return;
          }
          state.docs = docs;
          if (!fromCache) state.docsFromServer = true;
          markLoadedWhenServerAnswered();
          handlers.live(meta);
        },
        error: handlers.fail,
      }),
    onStatus: (status) => {
      state.docsStatus = status;
      report();
    },
  });

  const teams = createFollowingSubscription({
    retryMs,
    timers,
    subscribe: (key, handlers) =>
      listenTeams(
        key,
        (teamDocs, meta) => {
          if (!handlers.isCurrent()) return;
          if (meta?.fromCache !== true) state.teamsFromServer = true;
          state.teamIds = uniqueCleanIds((Array.isArray(teamDocs) ? teamDocs : []).map((team) => team?.id));
          const allocatedKey = idsKey([includeUid ? cleanUid : "", cleanSpId, ...state.teamIds]);
          if (allocatedKey === null) {
            // Nothing is allocated to a worker with no team and no service provider.
            allocated.setKey(null);
            state.docs = [];
            state.docsStatus = LIVE_STREAM_STATUS.LIVE;
            state.docsFromServer = true;
          } else {
            // Other teams are read again: the documents count as read once the server answers for them.
            if (allocatedKey !== allocated.key) state.docsFromServer = false;
            allocated.setKey(allocatedKey);
          }
          markLoadedWhenServerAnswered();
          handlers.live(meta);
        },
        handlers.fail,
      ),
    onStatus: (status) => {
      state.teamsStatus = status;
      report();
    },
  });

  if (cleanUid) {
    teams.setKey(cleanUid);
  } else {
    state.teamsStatus = LIVE_STREAM_STATUS.LIVE;
    state.docsStatus = LIVE_STREAM_STATUS.LIVE;
    state.loaded = true;
    report();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    teams.stop();
    allocated.stop();
  };
}
