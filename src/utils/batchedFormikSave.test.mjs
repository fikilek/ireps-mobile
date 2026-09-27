// One tap on a form often saves several fields at once. Formik re-checks the form after
// every single save, using the values as they were before the tap, so the last check never
// saw the first change - and the field a worker had just chosen stayed red until they chose
// it a second time. This gathers the saves made in one tap and applies them together.
//
// It shipped with no tests. These are them, because the behaviour is easy to break by
// "simplifying" the promise back into a plain setFieldValue.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { makeBatchedSetFieldValue } from "./batchedFormikSave.js";

const harness = (values) => {
  const calls = [];
  const pendingRef = { current: null };
  const setFieldValue = makeBatchedSetFieldValue({
    values,
    setValues: (next, shouldValidate) => calls.push({ next, shouldValidate }),
    pendingRef,
  });
  return { setFieldValue, calls, pendingRef };
};

const settle = () => Promise.resolve().then(() => {});

test("several saves in one tap become one save, and the later ones see the earlier ones", async () => {
  const { setFieldValue, calls } = harness({
    accessData: { access: { hasAccess: "", reason: "", reasonText: "" } },
  });

  // Exactly what the Access card does: the answer, the reason and its text together.
  setFieldValue("accessData.access.hasAccess", "no");
  setFieldValue("accessData.access.reason", "Locked gate");
  setFieldValue("accessData.access.reasonText", "Dog in the yard");

  assert.equal(calls.length, 0, "nothing is written until the tap has finished");
  await settle();

  assert.equal(calls.length, 1, "one save, not three - this is the whole point");
  assert.deepEqual(calls[0].next.accessData.access, {
    hasAccess: "no",
    reason: "Locked gate",
    reasonText: "Dog in the yard",
  });
  assert.equal(calls[0].shouldValidate, true, "the form is checked once, after the change");
});

test("the form is checked against the finished values, not the values before the tap", async () => {
  // The defect itself: a check that runs on the pre-tap values cannot see the field the
  // worker just filled, so it reports it as still missing.
  const { setFieldValue, calls } = harness({ meterReading: { reading: "", photo: "" } });

  setFieldValue("meterReading.reading", "01234");
  setFieldValue("meterReading.photo", "file://reading.jpg");
  await settle();

  assert.equal(calls[0].next.meterReading.reading, "01234");
  assert.equal(calls[0].next.meterReading.photo, "file://reading.jpg");
});

test("a save given a function is handed the value as the earlier saves left it", async () => {
  const { setFieldValue, calls } = harness({ ast: { normalisation: { actionTaken: [] } } });

  setFieldValue("ast.normalisation.actionTaken", ["Disconnect meter"]);
  setFieldValue("ast.normalisation.actionTaken", (current) => [...current, "Tamper removed"]);
  await settle();

  assert.deepEqual(calls[0].next.ast.normalisation.actionTaken, [
    "Disconnect meter",
    "Tamper removed",
  ]);
});

test("taps are not merged with each other", async () => {
  const { setFieldValue, calls, pendingRef } = harness({ a: "", b: "" });

  setFieldValue("a", "1");
  await settle();
  setFieldValue("b", "2");
  await settle();

  assert.equal(calls.length, 2, "two taps, two saves");
  assert.equal(pendingRef.current, null, "nothing is left pending between taps");
  // The second tap starts from the values it was given, which is how Formik re-renders.
  assert.equal(calls[1].next.b, "2");
});

test("it does not change the values object it was given", async () => {
  const values = { accessData: { access: { hasAccess: "yes" } } };
  const { setFieldValue } = harness(values);

  setFieldValue("accessData.access.hasAccess", "no");
  await settle();

  assert.equal(values.accessData.access.hasAccess, "yes", "the original must be untouched");
});

// Every form where one tap saves several fields must be wired to this, or that form keeps
// the defect. Five are; a sixth added without wiring should fail here rather than in a
// worker's hands.
test("every meter form that saves several fields in one tap is wired to it", () => {
  const FORMS = [
    "app/(tabs)/asts/inspection.js",
    "app/(tabs)/asts/disconnection.jsx",
    "app/(tabs)/asts/removal.jsx",
    "app/(tabs)/asts/reconnection.jsx",
    "app/(tabs)/asts/meter-reading.js",
  ];

  for (const form of FORMS) {
    const source = fs.readFileSync(new URL(`../../${form}`, import.meta.url), "utf8");

    assert.match(
      source,
      /makeBatchedSetFieldValue\(\{/,
      `${form} must build its setFieldValue from the batched one`,
    );
    // Shadowing the render prop's own setFieldValue is what makes it reach the whole form,
    // including the cards it hands setFieldValue to as a prop.
    assert.match(
      source,
      /const setFieldValue = makeBatchedSetFieldValue/,
      `${form} must shadow the render prop's setFieldValue, not sit beside it`,
    );
    assert.doesNotMatch(
      source,
      /\{\(\{[^}]*\n\s*setFieldValue,/,
      `${form} must take setValues from Formik, not setFieldValue`,
    );
  }
});
