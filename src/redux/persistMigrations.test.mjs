import assert from "node:assert/strict";
import test from "node:test";

import {
  keepOnlyPersistedKeys,
  migrations,
  PERSIST_VERSION,
  PERSISTED_KEYS,
} from "./persistMigrations.js";

test("UI-R003 1.8.0: leftover saved data from an older build is dropped", () => {
  const saved = {
    _persist: { version: 2, rehydrated: false },
    offline: { queue: [{ id: "q1" }] },
    irepsLookupOptionsApi: { queries: {} },
  };
  const out = keepOnlyPersistedKeys(saved);
  assert.equal("irepsLookupOptionsApi" in out, false);
  assert.deepEqual(Object.keys(out).sort(), ["_persist", "offline"]);
});

test("UI-R003 1.8.0: the queue of forms waiting to send is kept exactly", () => {
  const offline = { queue: [{ id: "q1", form: "METER_DISCOVERY" }, { id: "q2" }] };
  const out = keepOnlyPersistedKeys({ _persist: { version: 2 }, offline });
  assert.equal(out.offline, offline);
});

test("UI-R003 1.8.0: nothing saved stays nothing", () => {
  assert.equal(keepOnlyPersistedKeys(undefined), undefined);
});

test("UI-R003 1.8.0: the phone saves only the queue, and the cleanup runs at the current version", () => {
  assert.deepEqual(PERSISTED_KEYS, ["offline"]);
  assert.equal(typeof migrations[PERSIST_VERSION], "function");
});
