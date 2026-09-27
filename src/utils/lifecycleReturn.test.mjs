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
    dismissAll: () => moves.push(["dismissAll"]),
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
  // Emptying the tab being left is not a move; the moves themselves must all be navigate.
  const moves = router.moves.map(([move]) => move).filter((move) => move !== "dismissAll");
  assert.deepEqual(moves, ["navigate", "navigate", "navigate"]);
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

test("crossing tabs empties the tab being left, so no finished form is waiting there", () => {
  // The owner, 27 September: New Premise would not close. Back went to ERFs, clearing that and
  // returning to Premises met the same form again. navigate is the only move that crosses tabs,
  // and unlike replace it leaves the screen standing.
  const router = fakeRouter();

  returnAfterLifecycleWork(router, "/(tabs)/admin/operations/my-workorders", "/(tabs)/premises");

  assert.deepEqual(router.moves, [
    ["dismissAll"],
    ["navigate", "/(tabs)/admin/operations/my-workorders"],
  ], "the tab must be emptied before the move, not after it");
});

test("staying in the tab does not empty it, because replace already did", () => {
  const router = fakeRouter();

  returnAfterLifecycleWork(router, "/(tabs)/asts/removal");

  assert.deepEqual(router.moves, [["replace", "/(tabs)/asts/removal"]]);
});

test("a router too old to empty a tab still moves the worker", () => {
  const router = fakeRouter();
  delete router.dismissAll;

  assert.equal(
    returnAfterLifecycleWork(router, "/(tabs)/admin/operations/my-workorders", "/(tabs)/premises"),
    "navigate",
  );
});
