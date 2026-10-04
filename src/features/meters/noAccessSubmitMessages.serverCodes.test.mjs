// Every refusal the server can send has words a worker can act on.
//
// The owner, 3 October 2026: "any refusal must carry a proper reason. And that reason must be
// shown to the user." On ERF 5212 the server refused his work twice with a perfectly clear
// sentence, and the phone had no entry for the code, so he was headed for "Something went
// wrong and the visit was not recorded".
//
// THIS TEST DERIVES ITS LIST FROM THE SERVER, not from memory. A hand-written list always
// drifts behind, and it drifted silently: nothing failed, nothing warned, and the gap was only
// found by an audit. Now a refusal added on the server with no worker's words fails here.
//
// It reads the sibling web repo. Where that is not checked out it SKIPS rather than passes
// quietly — a green tick for a check that did not run is how this started.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { NO_ACCESS_RESULTS } from "./noAccessSubmitMessages.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// The web repo beside this one, or a worktree of it. A stream often works in a worktree while
// the main checkout holds another chat's branch, and a check that only looks in one place is a
// check that quietly stops running.
const CANDIDATE_DIRS = ["ireps-web-inspection-na", "ireps-web", "ireps-web-na"].map((name) =>
  path.resolve(here, "../../../..", name, "functions"),
);

// The two files whose refusals are BUSINESS refusals — the ones a field worker can actually
// walk into. Payload-shape faults elsewhere are programming errors and are not in scope here.
const SOURCES = [
  "noAccess/recordNoAccess.js",
  "noAccess/recordLifecycleNoAccess.js",
  "targetedBatches/batch-work-guard.js",
];

async function readServerSources() {
  for (const dir of CANDIDATE_DIRS) {
    const parts = [];
    let found = true;

    for (const file of SOURCES) {
      try {
        parts.push(await readFile(path.join(dir, file), "utf8"));
      } catch {
        found = false;
        break;
      }
    }

    if (found) return { source: parts.join("\n"), dir };
  }

  return null;
}

test("every business refusal the server can send has worker's words", async (t) => {
  const read = await readServerSources();

  if (!read) {
    t.skip(
      `the web repo is not beside this one (looked in: ${CANDIDATE_DIRS.join(" , ")}), so the server's codes could not be read`,
    );
    return;
  }

  const codes = new Set();

  // noAccessError("CODE", …)
  for (const m of read.source.matchAll(/(?:noAccessError|fail)\(\s*"([A-Z0-9_]+)"/g))
    codes.add(m[1]);
  // export const SOMETHING = "SOMETHING" — how the batch guard names its refusal codes. The
  // name must EQUAL the value: that is what makes it a code rather than a constant that
  // happens to hold a word. Without this, NO_ACCESS_OTHER_CODE = "OTHER" is read as a refusal
  // and the test demands worker's words for a dropdown entry.
  for (const m of read.source.matchAll(
    /export const ([A-Z0-9_]+) = "([A-Z0-9_]+)"/g,
  )) {
    if (m[1] === m[2]) codes.add(m[2]);
  }

  assert.ok(
    codes.size > 3,
    "no codes were found; the patterns this test looks for have moved",
  );

  const known = new Set(NO_ACCESS_RESULTS.map((row) => row.code));
  const missing = [...codes].filter((code) => !known.has(code)).sort();

  assert.deepEqual(
    missing,
    [],
    `read from ${read.dir}\nThe server can refuse with ${missing.length} code(s) the worker has no words for, so they would be shown "Something went wrong":\n  ${missing.join("\n  ")}`,
  );
});
