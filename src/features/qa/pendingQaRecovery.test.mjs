import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { loadEntry } from "../meters/entryTestHarness.mjs";
import { readFileSync } from "node:fs";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("pending recovery remains available after UPDATED/PASS, remount and account changes; receipt cleanup streams", async () => {
  const drafts = new Map([["worker/trn", { pending: { requestId: "original" } }]]), listeners = new Set();
  const usePending = loadEntry("src/features/qa/usePendingQaRecovery.js", {
    "./src/features/qa/amendmentQueue.js": { getQaDraft: (uid, id) => drafts.get(`${uid}/${id}`),
      subscribeQaDrafts: fn => { listeners.add(fn); return () => listeners.delete(fn); } },
  }, { exportName: "usePendingQaRecovery" });
  function Card({ uid, state }) { return React.createElement("card", { recover: usePending(uid, "trn"), state }); }
  let tree;
  await act(() => { tree = create(React.createElement(Card, { uid: "worker", state: "QA UPDATED" })); });
  assert.equal(tree.root.findByType("card").props.recover, true);
  await act(() => tree.unmount());
  assert.equal(listeners.size, 0);
  await act(() => { tree = create(React.createElement(Card, { uid: "worker", state: "QA PASS" })); });
  assert.equal(tree.root.findByType("card").props.recover, true);
  await act(() => tree.update(React.createElement(Card, { uid: "other", state: "QA PASS" })));
  assert.equal(tree.root.findByType("card").props.recover, false);
  await act(() => tree.update(React.createElement(Card, { uid: "worker", state: "QA PASS" })));
  await act(() => { drafts.clear(); listeners.forEach(fn => fn()); });
  assert.equal(tree.root.findByType("card").props.recover, false);
  await act(() => tree.unmount());
  assert.equal(listeners.size, 0);
});
test("recovery uses existing immutable pending-request route, not fresh PASS editing", () => {
  const source = readFileSync(new URL("../../../app/(tabs)/trns/correct.js", import.meta.url), "utf8");
  assert.match(source, /cached\?\.pending[\s\S]*retryOnly: true/);
  assert.match(source, /sendQaDraft\(uid, trnId\)/);
  const work = readFileSync(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  assert.match(work, /RESOLVE SUBMISSION/);
  assert.match(work, /getQaDraft\(actorUid, item.id\)\?\.pending/);
});
