import test from "node:test";
import assert from "node:assert/strict";

import {
  REMAINING_CREDIT_PATTERN,
  canonicalizeRemainingCredit,
  getRemainingCreditValidationError,
  hasRemainingCredit,
  hasUsableRemainingCreditPhoto,
  hydrateRemainingCreditMeter,
  removeRemainingCreditPhoto,
} from "./remainingCreditContract.js";

const reasons = [
  "Display blank / no reading",
  "Display damaged",
  "Display unreadable",
  "Unable to obtain balance",
  "Meter not responding",
  "Other",
];

const photo = { tag: "remainingCreditPhoto", uri: "file:///credit.jpg" };
const otherPhoto = { tag: "astNoPhoto", uri: "file:///meter.jpg" };

for (const value of ["0", "12", "+12", "-12", "12.50", "-3.25"]) {
  test(`remaining credit grammar accepts ${value}`, () => {
    assert.equal(REMAINING_CREDIT_PATTERN.test(value), true);
  });
}

for (const value of ["-", ".", "12.", ".5", "1..5", "1e3", "NaN", "Infinity", "abc"]) {
  test(`remaining credit grammar rejects ${value}`, () => {
    assert.equal(REMAINING_CREDIT_PATTERN.test(value), false);
  });
}

test("zero is present and legacy numeric zero hydrates safely", () => {
  assert.equal(hasRemainingCredit("0"), true);
  assert.deepEqual(hydrateRemainingCreditMeter({ remainingCredit: 0 }), {
    remainingCredit: "0",
    remainingCreditComment: "",
    remainingCreditCommentOther: "",
  });
});

test("conventional hydration clears stale prepaid-only values", () => {
  assert.deepEqual(
    hydrateRemainingCreditMeter({
      type: "conventional",
      remainingCredit: "99",
      remainingCreditComment: "Other: Display cannot be reached",
    }),
    {
      type: "conventional",
      remainingCredit: "",
      remainingCreditComment: "",
      remainingCreditCommentOther: "",
    },
  );
});

test("usable remaining credit photo requires tag and uri/url", () => {
  assert.equal(hasUsableRemainingCreditPhoto([photo]), true);
  assert.equal(
    hasUsableRemainingCreditPhoto([{ tag: "remainingCreditPhoto" }]),
    false,
  );
  assert.equal(hasUsableRemainingCreditPhoto([otherPhoto]), false);
});

test("prepaid captured credit keeps photo and clears reason", () => {
  const result = canonicalizeRemainingCredit({
    meter: {
      type: "prepaid",
      remainingCredit: " 12.50 ",
      remainingCreditComment: "Display unreadable",
      remainingCreditCommentOther: "stale helper",
    },
    media: [photo, otherPhoto],
    isDiscovery: true,
  });

  assert.equal(result.meter.remainingCredit, "12.50");
  assert.equal(result.meter.remainingCreditComment, "");
  assert.equal("remainingCreditCommentOther" in result.meter, false);
  assert.deepEqual(result.media, [photo, otherPhoto]);
});

test("prepaid blank credit requires reason and removes stale photo", () => {
  const result = canonicalizeRemainingCredit({
    meter: {
      type: "prepaid",
      remainingCredit: "",
      remainingCreditComment: " Display unreadable ",
    },
    media: [photo, otherPhoto],
    isDiscovery: true,
  });

  assert.equal(result.meter.remainingCredit, "");
  assert.equal(result.meter.remainingCreditComment, "Display unreadable");
  assert.deepEqual(result.media, [otherPhoto]);
});

test("conventional canonical state removes prepaid-only values and photo", () => {
  const result = canonicalizeRemainingCredit({
    meter: {
      type: "conventional",
      remainingCredit: "10",
      remainingCreditComment: "Other",
    },
    media: [photo, otherPhoto],
    isDiscovery: true,
  });

  assert.equal("remainingCredit" in result.meter, false);
  assert.equal("remainingCreditComment" in result.meter, false);
  assert.equal("remainingCreditCommentOther" in result.meter, false);
  assert.deepEqual(result.media, [otherPhoto]);
});

test("removing remaining credit photo preserves all other media", () => {
  assert.deepEqual(removeRemainingCreditPhoto([photo, otherPhoto]), [otherPhoto]);
});

test("captured zero requires a usable photo", () => {
  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: { type: "prepaid", remainingCredit: "0", remainingCreditComment: "" },
      media: [],
      approvedReasons: reasons,
    })?.path,
    "media",
  );

  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: { type: "prepaid", remainingCredit: "0", remainingCreditComment: "" },
      media: [photo],
      approvedReasons: reasons,
    }),
    null,
  );
});

test("blank prepaid credit requires an approved reason", () => {
  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: { type: "prepaid", remainingCredit: "", remainingCreditComment: "" },
      media: [],
      approvedReasons: reasons,
    })?.path,
    "ast.astData.meter.remainingCreditComment",
  );

  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: { type: "prepaid", remainingCredit: "", remainingCreditComment: "Display unreadable" },
      media: [],
      approvedReasons: reasons,
    }),
    null,
  );
});


test("Other reason requires free-text detail and canonicalizes into one persisted field", () => {
  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: {
        type: "prepaid",
        remainingCredit: "",
        remainingCreditComment: "Other",
        remainingCreditCommentOther: "",
      },
      media: [],
      approvedReasons: reasons,
    })?.path,
    "ast.astData.meter.remainingCreditCommentOther",
  );

  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: {
        type: "prepaid",
        remainingCredit: "",
        remainingCreditComment: "Other",
        remainingCreditCommentOther: "Display is inside locked enclosure",
      },
      media: [],
      approvedReasons: reasons,
    }),
    null,
  );

  const canonical = canonicalizeRemainingCredit({
    meter: {
      type: "prepaid",
      remainingCredit: "",
      remainingCreditComment: "Other",
      remainingCreditCommentOther: " Display is inside locked enclosure ",
    },
    media: [photo, otherPhoto],
    isDiscovery: true,
  });

  assert.equal(
    canonical.meter.remainingCreditComment,
    "Other: Display is inside locked enclosure",
  );
  assert.equal("remainingCreditCommentOther" in canonical.meter, false);
  assert.deepEqual(canonical.media, [otherPhoto]);
});

test("canonical Other reason hydrates back into dropdown plus helper text", () => {
  assert.deepEqual(
    hydrateRemainingCreditMeter({
      type: "prepaid",
      remainingCredit: "",
      remainingCreditComment: "Other: Meter room key unavailable",
    }),
    {
      type: "prepaid",
      remainingCredit: "",
      remainingCreditComment: "Other",
      remainingCreditCommentOther: "Meter room key unavailable",
    },
  );
});

test("captured credit rejects stale reason", () => {
  assert.equal(
    getRemainingCreditValidationError({
      isDiscovery: true,
      meter: { type: "prepaid", remainingCredit: "3", remainingCreditComment: "Other" },
      media: [photo],
      approvedReasons: reasons,
    })?.path,
    "ast.astData.meter.remainingCreditComment",
  );
});
