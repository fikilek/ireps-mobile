import test from "node:test";
import assert from "node:assert/strict";
import { isSameTabRoute, returnAfterLifecycleWork } from "./lifecycleReturn.js";

const fakeRouter = () => {
  const moves = [];
  return {
    moves,
    replace: (href) => moves.push(["replace", href]),
    navigate: (href) => moves.push(["navigate", href]),
    push: (href) => moves.push(["push", href]),
  };
};

test("a route in the same tab is replaced, so the finished form is not left behind", () => {
  const router = fakeRouter();
  assert.equal(returnAfterLifecycleWork(router, "/(tabs)/asts"), "replace");
  assert.equal(returnAfterLifecycleWork(router, "/(tabs)/asts/inspection"), "replace");
  assert.deepEqual(router.moves.map(([move]) => move), ["replace", "replace"]);
});

test("a route in another tab is navigated to: REPLACE cannot cross tabs", () => {
  const router = fakeRouter();
  assert.equal(returnAfterLifecycleWork(router, "/(tabs)/admin/operations/my-workorders"), "navigate");
  assert.equal(returnAfterLifecycleWork(router, "/(tabs)/premises"), "navigate");
  assert.equal(returnAfterLifecycleWork(router, "/(tabs)/admin/storage/forms-submission-queue"), "navigate");
  assert.deepEqual(router.moves.map(([move]) => move), ["navigate", "navigate", "navigate"]);
});

test("a route given as an object is read the same way", () => {
  const router = fakeRouter();
  assert.equal(returnAfterLifecycleWork(router, { pathname: "/(tabs)/asts", params: { id: "1" } }), "replace");
  assert.equal(returnAfterLifecycleWork(router, { pathname: "/(tabs)/admin/operations/my-workorders" }), "navigate");
});

test("nothing at all moves nobody", () => {
  const router = fakeRouter();
  assert.equal(returnAfterLifecycleWork(router, ""), null);
  assert.equal(returnAfterLifecycleWork(router, null), null);
  assert.equal(returnAfterLifecycleWork(router, { pathname: "  " }), null);
  assert.deepEqual(router.moves, []);
});

test("a tab is not matched by a route that merely starts with its letters", () => {
  assert.equal(isSameTabRoute("/(tabs)/astsomething"), false);
  assert.equal(isSameTabRoute("/(tabs)/asts/removal"), true);
});
