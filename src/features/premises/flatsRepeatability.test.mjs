import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formSource = (
  await readFile(new URL("./formPremise.js", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");
const cardSource = (
  await readFile(new URL("./PremiseCard.js", import.meta.url), "utf8")
).replace(/\r\n/g, "\n");

function indexOfOrFail(source, value, label = value) {
  const index = source.indexOf(value);
  assert.notEqual(index, -1, `Missing contract: ${label}`);
  return index;
}

test("preserves strict duplicate route-mode detection", () => {
  assert.match(
    formSource,
    /const params = useLocalSearchParams\(\);[\s\S]*hasOwn\(params, "duplicateId"\)/,
  );
  assert.match(formSource, /hasOwn\(params, "premiseId"\)/);
  assert.match(formSource, /hasOwn\(params, "queueItemId"\)/);
  assert.match(
    formSource,
    /hasDuplicateIntent && \(hasPremiseIdKey \|\| hasQueueItemIdKey\)/,
  );
  assert.match(
    formSource,
    /function normalizeStrictRouteId\(value\) \{[\s\S]*typeof value !== "string"[\s\S]*value\.trim\(\)/,
  );
  assert.doesNotMatch(formSource, /const isDuplicate = !!duplicateId/);
});

test("preserves canonical source identity and same-Erf relationship checks", () => {
  const validatorStart = indexOfOrFail(
    formSource,
    "function validateCanonicalDuplicateSource(",
  );
  const validatorEnd = indexOfOrFail(
    formSource,
    "function getDuplicateIntegrityError(",
  );
  const validator = formSource.slice(validatorStart, validatorEnd);

  for (const field of [
    "source.id",
    "source.erfId",
    "source.erfNo",
    "source?.parents?.countryPcode",
    "source?.parents?.provincePcode",
    "source?.parents?.dmPcode",
    "source?.parents?.lmPcode",
    "source?.parents?.wardPcode",
  ]) {
    assert.ok(validator.includes(field), `Validator must require ${field}`);
  }

  assert.match(validator, /sourceId !== normalizedDuplicateId/);
  assert.match(validator, /sourceErfId !== normalizedRouteId/);
  assert.match(validator, /getDuplicatePropertyTypeTemplate/);
  assert.match(validator, /isRepeatablePropertyType/);
  assert.match(validator, /getDuplicateInitialStatus/);
  assert.doesNotMatch(validator, /type: "Flats"/);
  assert.doesNotMatch(validator, /\.\.\.source/);
});

test("preserves local-first resolver and keyed source latch lifecycle", () => {
  assert.match(
    formSource,
    /JSON\.stringify\(\[normalizedRouteId, normalizedDuplicateId\]\)/,
  );
  assert.match(
    formSource,
    /!localDuplicateCandidate &&\s*!hasValidCurrentDuplicateLatch/,
  );
  assert.match(
    formSource,
    /useGetPremiseByIdQuery\([\s\S]*skip: skipDuplicateResolver,[\s\S]*refetchOnMountOrArgChange: true/,
  );
  assert.match(
    formSource,
    /duplicateLatch\?\.key === duplicateRouteKey/,
  );
  assert.match(formSource, /setDuplicateLatch\(\(currentLatch\) =>/);
  assert.match(formSource, /return null;[\s\S]*setDuplicateCentroidSeed/);
});

test("preserves fail-closed states and GPS hydration", () => {
  for (const state of [
    "MODE CONFLICT",
    "INVALID ROUTE",
    "PENDING SOURCE",
    "SOURCE ERROR",
    "SOURCE MISSING",
    "INVALID SOURCE",
    "VALID DUPLICATE",
  ]) {
    assert.ok(formSource.includes(`"${state}"`), `Missing state ${state}`);
  }

  const closedStateStart = indexOfOrFail(
    formSource,
    'duplicateResolution?.state !== "VALID DUPLICATE"',
  );
  const formikStart = indexOfOrFail(formSource, "<Formik");
  assert.ok(closedStateStart < formikStart);

  assert.match(formSource, /function DuplicateGpsResetHydrator/);
  assert.match(
    formSource,
    /!isSamePoint\(currentCentroid, previousResetCentroid\)/,
  );
  assert.match(formSource, /isSamePoint\(currentCentroid, resetCentroid\)/);
  assert.match(
    formSource,
    /setFieldValue\("geometry\.centroid", \{ \.\.\.resetCentroid \}, false\)/,
  );
});

test("preserves duplicate isolation from selectedErf and Targeted Batch", () => {
  assert.match(formSource, /const targetGeo = isDuplicate\s*\? null/);
  assert.match(
    formSource,
    /const erfNo = isDuplicate\s*\? canonicalDuplicateSource\?\.erfNo/,
  );
  assert.match(formSource, /const admin = isDuplicate\s*\? null/);
  assert.match(
    formSource,
    /const selectedErfIsTownship = isDuplicate\s*\? null/,
  );
  assert.match(
    formSource,
    /if \(isDuplicate\) return null;[\s\S]*normalizeTargetedBatchContext/,
  );
});

test("preserves fresh explicit duplicate system fields", () => {
  const duplicateBranchStart = indexOfOrFail(
    formSource,
    "if (isDuplicate) {\n      return {",
    "explicit Duplicate system-field branch",
  );
  const editBranchStart = indexOfOrFail(
    formSource,
    "if (isEdit || isQueueEdit)",
  );
  const duplicateBranch = formSource.slice(
    duplicateBranchStart,
    editBranchStart,
  );

  assert.match(duplicateBranch, /id: generatedId/);
  assert.match(duplicateBranch, /schemaVersion: "1\.0\.0"/);
  assert.match(duplicateBranch, /erfId: canonicalDuplicateSource\.erfId/);
  assert.match(duplicateBranch, /erfNo: canonicalDuplicateSource\.erfNo/);
  assert.match(duplicateBranch, /electricityMeters: \[\]/);
  assert.match(duplicateBranch, /waterMeters: \[\]/);
  assert.match(duplicateBranch, /noAccessTrnIds: \[\]/);
  assert.doesNotMatch(duplicateBranch, /accountRefs|targetedBatchContext/);
});

test("keeps structural duplicate integrity guard ahead of submission side effects", () => {
  const submitStart = indexOfOrFail(
    formSource,
    "const handleSubmit = async (values, { setSubmitting }) => {",
  );
  const submitSource = formSource.slice(submitStart);
  const guardIndex = indexOfOrFail(
    submitSource,
    "getDuplicateIntegrityError({",
  );

  for (const operation of [
    "setInProgress(true)",
    "buildSystemFields()",
    "NetInfo.fetch()",
    "getStorage()",
    "addPremiseQueueItem({",
    "createPremise(finalValues)",
    "updatePremise(finalValues)",
  ]) {
    assert.ok(
      guardIndex < indexOfOrFail(submitSource, operation),
      `Integrity guard must precede ${operation}`,
    );
  }

  assert.doesNotMatch(
    formSource,
    /values\?\.propertyType\?\.type !== "Flats"/,
  );
});

test("integrates editable Property Type reconciliation and submission sanitization", () => {
  assert.match(formSource, /onValueChange=\{\(nextType\) =>/);
  assert.match(formSource, /reconcilePropertyTypeChange\(nextType\)/);
  assert.match(formSource, /setValues\(/);
  assert.match(formSource, /name: reconciled\.name/);
  assert.match(formSource, /unitNo: reconciled\.unitNo/);
  assert.match(formSource, /sanitizePropertyTypeForSubmission/);
  assert.match(formSource, /propertyType: submittedPropertyType/);
  assert.match(formSource, /supportsUnitNo\(values\?\.propertyType\?\.type\)/);
  assert.doesNotMatch(formSource, /disabled=\{isDuplicate\}/);
});

test("generalizes card eligibility, identity and confirmation copy", () => {
  assert.match(cardSource, /isRepeatablePropertyType/);
  assert.match(cardSource, /formatRepeatablePremiseIdentity/);
  assert.match(cardSource, /getDuplicateConfirmationMessage/);
  assert.ok(cardSource.includes('"Duplicate Premise"'));
  assert.match(cardSource, /\{identityLabel && \(/);
  assert.doesNotMatch(cardSource, /const isFlat =/);
  assert.doesNotMatch(cardSource, /Duplicate Flat Unit/);
  assert.doesNotMatch(cardSource, /delayLongPress|onLongPress/);
});


test("guards Government card identity against leading separators", () => {
  const governmentStart = indexOfOrFail(
    cardSource,
    'if (type === "Government") {',
  );
  const namedEntityStart = indexOfOrFail(
    cardSource,
    'if (["Church", "School", "Business"].includes(type)) {',
  );
  const governmentBranch = cardSource.slice(
    governmentStart,
    namedEntityStart,
  );

  assert.match(
    governmentBranch,
    /if \(name && unit\) return `\$\{name\} \| Unit \$\{unit\}`;/,
  );
  assert.match(governmentBranch, /if \(name\) return name;/);
  assert.match(
    governmentBranch,
    /if \(unit\) return `Unit \$\{unit\}`;/,
  );
  assert.match(governmentBranch, /return "";/);
  assert.doesNotMatch(governmentBranch, /return `\| Unit \$\{unit\}`;/);
});

test("preserves successful save navigation regression fix", () => {
  // A premise that came from a batch goes back to where it came from; anything else goes back one screen.
  // The return is made with returnAfterLifecycleWork because My Work Orders is in another tab and REPLACE
  // cannot cross tabs (2026-09-24).
  assert.match(
    formSource,
    /if \(originatedFromTargetedBatch \|\| isQueueEdit \|\| rowPremiseJoin\) \{[\s\S]{0,240}?returnAfterLifecycleWork\(router, successRoute, "\/\(tabs\)\/premises"\);\s*\} else \{\s*router\.back\(\);/,
  );
});
