// UI-R003 1.8.0: between starts the phone keeps only the queue of forms waiting to send.
// No redux-persist import, so this runs in tests.

export const PERSISTED_KEYS = ["offline"];

// Saved data from older builds can hold parts that no longer exist
// (e.g. irepsLookupOptionsApi, removed by UI-R003 1.4.0). Drop everything
// except the parts we still save, keeping the offline queue untouched.
export const keepOnlyPersistedKeys = (state) => {
  if (!state) return state;
  const kept = { _persist: state._persist };
  for (const key of PERSISTED_KEYS) {
    if (key in state) kept[key] = state[key];
  }
  return kept;
};

export const PERSIST_VERSION = 3;

export const migrations = {
  3: keepOnlyPersistedKeys,
};
