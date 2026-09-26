// The result window must say what actually happened.
//
// Both meter forms showed the same green "MISSION SUCCESS / Trn saved successfully" panel
// whether the capture reached the office or only reached the phone. A worker read the green
// tick, the screen closed itself, and they walked to the next house believing it was sent.
// If it was later refused, the queue card said "Draft saved locally" and retried silently,
// so they were never told otherwise.
//
// These are source assertions, in the style of the other UI tests here, because the panel
// cannot be rendered without the whole form. They are worth having anyway: what they guard
// is that nobody re-points the queued path at the success panel.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const FORMS = [
  ["Meter Discovery", "src/features/meters/FormMeterDiscovery.js"],
  ["Meter Installation", "src/features/meters/FormMeterIstallation.js"],
];

const read = (path) => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

for (const [name, path] of FORMS) {
  const source = read(path);

  test(`${name}: a capture saved only on the phone does not say MISSION SUCCESS`, () => {
    // The title is chosen by the notice, never hard-coded on its own line.
    assert.match(
      source,
      /queuedNotice \? "SAVED ON THIS PHONE" : "MISSION SUCCESS"/,
      "the panel title must branch on queuedNotice",
    );

    // And the worker is told plainly, not left to infer it from a colour.
    assert.match(
      source,
      /NOT SENT TO THE OFFICE YET/,
      "the queued panel must say the office does not have it",
    );
  });

  test(`${name}: the queued path sets the notice instead of raising a second message`, () => {
    assert.match(
      source,
      /setQueuedNotice\(\{\s*title: messageTitle,\s*body: messageBody\s*\}\)/,
      "the caller's words must go into the result window",
    );

    // The bug itself, exactly: an alert raising the same words the panel is about to
    // show, so a worker got two messages in one step - one true, one not. Other
    // Alert.alert calls in these forms are real and different (a draft that failed to
    // save, a server error), so only this duplicate is forbidden.
    assert.doesNotMatch(
      source,
      /Alert\.alert\(\s*messageTitle,\s*messageBody\s*\)/,
      "the result window must not be duplicated by an alert of the same message",
    );
  });

  test(`${name}: a real server acceptance clears the notice first`, () => {
    // Otherwise a queued capture followed by an accepted one would keep the amber panel.
    const clears = source.match(/setQueuedNotice\(null\);\s*\n\s*setShowSuccess\(true\)/g);
    assert.ok(
      clears && clears.length >= 1,
      "every path that really reached the server must clear queuedNotice before showing the panel",
    );
  });
}

test("the two forms word it identically", () => {
  // A field worker moves between these forms in one job - a replacement opens an
  // installation straight after a discovery. Two different sentences for the same state
  // would read as two different states.
  const [discovery, installation] = FORMS.map(([, path]) => read(path));
  for (const phrase of [
    "SAVED ON THIS PHONE",
    "NOT SENT TO THE OFFICE YET",
    'name={queuedNotice ? "smartphone" : "check"}',
  ]) {
    assert.ok(discovery.includes(phrase), `Meter Discovery is missing: ${phrase}`);
    assert.ok(installation.includes(phrase), `Meter Installation is missing: ${phrase}`);
  }
});
