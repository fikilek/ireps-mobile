// MN-R001 on the phone: the finding decides what is offered, and what must be
// said when the action that follows is not taken. The back end keeps the same
// rules in ireps-web/functions/meterDiscovery/validation.js.
import test from "node:test";
import assert from "node:assert/strict";

import {
  NORMALISATION_NONE,
  getExpectedNormalisationAction,
  getNormalisationOptions,
  getNormalisationValidationError,
  isNoActionReasonRequired,
  isNormalisationRequired,
  normalisationPhotoRequired,
} from "./formOptions.js";

const values = (options) => options.map((option) => option.value);

test("Meter Ok keeps None; an abnormal finding never offers it", () => {
  assert.equal(isNormalisationRequired("Meter Ok"), false);
  assert.equal(values(getNormalisationOptions("Meter Ok"))[0], NORMALISATION_NONE);

  for (const anomaly of ["Illegally Connected", "Meter Damaged", "Meter Faulty"]) {
    assert.equal(isNormalisationRequired(anomaly), true);
    assert.equal(
      values(getNormalisationOptions(anomaly)).includes(NORMALISATION_NONE),
      false,
      `${anomaly} must not offer None`,
    );
  }
});

test("fixes on the spot are offered whatever the finding", () => {
  for (const anomaly of ["Meter Ok", "Illegally Connected"]) {
    const offered = values(getNormalisationOptions(anomaly));
    for (const fix of [
      "Tamper removed",
      "Keypad normalised",
      "Service point completed",
      "Meter registered",
    ]) {
      assert.equal(offered.includes(fix), true, `${fix} missing for ${anomaly}`);
    }
  }
});

test("the action that follows each finding", () => {
  assert.equal(
    getExpectedNormalisationAction("Illegally Connected"),
    "Disconnect meter",
  );
  assert.equal(getExpectedNormalisationAction("Meter Damaged"), "Meter replaced");
  assert.equal(getExpectedNormalisationAction("Meter Faulty"), "Meter replaced");
  assert.equal(getExpectedNormalisationAction("Meter Ok"), "");
});

test("not doing the work asks for a reason, doing it does not", () => {
  assert.equal(
    isNoActionReasonRequired({
      anomaly: "Illegally Connected",
      actionTaken: ["none"],
    }),
    true,
  );

  // An extra on its own is still not the action that follows.
  assert.equal(
    isNoActionReasonRequired({
      anomaly: "Illegally Connected",
      actionTaken: ["Tamper removed"],
    }),
    true,
  );

  assert.equal(
    isNoActionReasonRequired({
      anomaly: "Illegally Connected",
      actionTaken: ["Disconnect meter"],
    }),
    false,
  );

  assert.equal(
    isNoActionReasonRequired({ anomaly: "Meter Ok", actionTaken: ["none"] }),
    false,
  );
});

test("what the worker is told when something is missing", () => {
  assert.equal(
    getNormalisationValidationError({
      anomaly: "Illegally Connected",
      actionTaken: ["none"],
    })?.message,
    "Say why the meter was not disconnected.",
  );

  assert.equal(
    getNormalisationValidationError({
      anomaly: "Meter Damaged",
      actionTaken: ["none"],
    })?.message,
    "Say why the meter was not replaced.",
  );

  assert.equal(
    getNormalisationValidationError({
      anomaly: "Illegally Connected",
      actionTaken: ["none"],
      noActionReason: "Other",
      noActionReasonOther: "  ",
    })?.message,
    "Type the reason.",
  );

  assert.equal(
    getNormalisationValidationError({
      anomaly: "Meter Ok",
      actionTaken: ["none", "Tamper removed"],
    })?.message,
    "None cannot be used with another action.",
  );

  assert.equal(
    getNormalisationValidationError({
      anomaly: "Illegally Connected",
      actionTaken: ["Meter Disconnection"],
    })?.message,
    "This action is not on the list.",
  );
});

test("nothing is wrong when the work was done or properly explained", () => {
  assert.equal(
    getNormalisationValidationError({
      anomaly: "Illegally Connected",
      actionTaken: ["Disconnect meter"],
    }),
    null,
  );

  assert.equal(
    getNormalisationValidationError({
      anomaly: "Illegally Connected",
      actionTaken: ["none"],
      noActionReason: "Threatened or chased away",
    }),
    null,
  );

  assert.equal(
    getNormalisationValidationError({ anomaly: "Meter Ok", actionTaken: ["none"] }),
    null,
  );
});

test("a photo for work that leaves a mark, never twice for a disconnection", () => {
  assert.equal(normalisationPhotoRequired(["none"]), false);
  assert.equal(normalisationPhotoRequired(["Disconnect meter"]), false);
  assert.equal(normalisationPhotoRequired(["Meter replaced"]), true);
  assert.equal(
    normalisationPhotoRequired(["Disconnect meter", "Tamper removed"]),
    true,
  );
});
