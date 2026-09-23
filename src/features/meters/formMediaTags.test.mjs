// A photo whose tag is missing from a form's EXECUTION_MEDIA_TAGS is thrown
// away before the form is sent: the worker takes it, the phone drops it, and
// the back end refuses the form for a photo that is right there on the screen.
// This happened on Meter Inspection (23 Sep 2026), so it is guarded here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const FORMS = [
  "app/(tabs)/asts/inspection.js",
  "app/(tabs)/asts/disconnection.jsx",
  "app/(tabs)/asts/removal.jsx",
  "app/(tabs)/asts/reconnection.jsx",
];

function listedTags(source) {
  const block = source.match(/const EXECUTION_MEDIA_TAGS = \[([\s\S]*?)\]/);
  if (!block) return null;
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// Every photo tag written into the screen, as a plain string.
function capturedTags(source) {
  const tags = new Set();
  for (const match of source.matchAll(/tag=\{?"([A-Za-z][\w-]*)"\}?/g)) {
    tags.add(match[1]);
  }
  // the three that hang off a field (cb, seal, keypad)
  const map = source.match(/MISSING_VALUE_PHOTO_TAGS = Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (map) {
    for (const match of map[1].matchAll(/"([^"]+)"/g)) tags.add(match[1]);
  }
  return [...tags];
}

for (const file of FORMS) {
  test(`${file}: every photo it takes is a photo it sends`, () => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const listed = listedTags(source);

    assert.ok(listed && listed.length, `${file} has no EXECUTION_MEDIA_TAGS`);

    for (const tag of capturedTags(source)) {
      // The read-only view of an office instruction shows its photos; it never
      // captures them.
      if (tag === "instructionMedia" && !source.includes('tag="instructionMedia"')) {
        continue;
      }

      assert.ok(
        listed.includes(tag),
        `${file}: the form captures "${tag}" but does not send it — add it to EXECUTION_MEDIA_TAGS`,
      );
    }
  });
}
