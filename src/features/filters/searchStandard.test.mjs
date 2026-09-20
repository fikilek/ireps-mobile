import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * One search for the whole app (UI-R001).
 *
 * Erfs, Premises, Trns and Asts all launch search from the same header pods
 * (TOTAL | FILTERED | <label> + magnifier) and all type into the same floating
 * bar above the keyboard. These tests fail if a screen grows its own copy.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const SEARCH_OVERLAY = "../filters/FilterSearchOverlay";
const HEADER_BASE = "../filters/FilterHeaderBase";

const searchWrappers = {
  erfs: "../erfs/ErfSearch.js",
  premises: "../premises/PremiseSearch.js",
  trns: "../trns/TrnSearch.js",
  asts: "../asts/AstSearch.js",
};

const headers = {
  erfs: { file: "../erfs/erfFilterHeader.js", base: HEADER_BASE },
  premises: { file: "../premises/PremiseHeader.js", base: HEADER_BASE },
  trns: {
    file: "../../../app/(tabs)/trns/_layout.js",
    base: "FilterHeaderBase",
  },
  asts: {
    file: "../../../app/(tabs)/asts/_layout.js",
    base: "FilterHeaderBase",
  },
};

for (const [screen, file] of Object.entries(searchWrappers)) {
  test(`${screen} search uses the shared floating search bar`, () => {
    const source = read(file);

    assert.ok(
      source.includes(SEARCH_OVERLAY),
      `${screen} must render FilterSearchOverlay, not its own search UI`,
    );

    assert.ok(
      !source.includes("<Modal"),
      `${screen} search must not be a pop-up modal`,
    );

    assert.ok(
      !source.includes("StyleSheet.create"),
      `${screen} search must not carry its own styles`,
    );
  });
}

for (const [screen, { file, base }] of Object.entries(headers)) {
  test(`${screen} header uses the shared TOTAL/FILTERED/search pods`, () => {
    const source = read(file);

    assert.ok(source.includes(base), `${screen} must render FilterHeaderBase`);

    assert.ok(
      source.includes("onSearchPress"),
      `${screen} header must carry the search button`,
    );
  });
}

test("the shared search bar closes on the Android back button", () => {
  const source = read("../filters/FilterSearchOverlay.js");

  assert.ok(
    source.includes("hardwareBackPress"),
    "back must close the search bar, not leave the screen",
  );
});

test("no screen keeps a permanently visible search box", () => {
  const screens = Object.values(searchWrappers).concat(
    "../erfs/erfsScreen.js",
    "../premises/PremiseHeader.js",
  );

  for (const file of screens) {
    assert.ok(
      !read(file).includes("<Searchbar"),
      `${file} must launch search from the header, not sit on the screen`,
    );
  }
});

/**
 * Merge guard. Branches cut before UI-R001 still carry the old search UI.
 * If one of them brings back a screen that imports the retired components,
 * this fails on the merge instead of on a worker's phone.
 */
test("no source file uses the retired search components", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

  // git grep exits 1 when it finds nothing, which is the passing case
  let hits = "";
  try {
    hits = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "-E",
        "SovereignHeader|ErfsBottomSearch",
        "--",
        "*.js",
        "*.jsx",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
  } catch (error) {
    if (error?.status !== 1) throw error;
  }

  assert.equal(
    hits,
    "",
    `retired search components are back in: ${hits}
` + "Use FilterHeaderBase and FilterSearchOverlay instead (UI-R001).",
  );
});
