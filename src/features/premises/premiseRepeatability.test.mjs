import assert from "node:assert/strict";
import test from "node:test";

import {
  REPEATABLE_PROPERTY_TYPES,
  formatRepeatablePremiseIdentity,
  getDefaultPropertyName,
  getDuplicateConfirmationMessage,
  getDuplicateInitialStatus,
  getDuplicatePropertyTypeTemplate,
  getRepeatabilityPolicy,
  isLegacyBackroomWithoutUnitNo,
  isRepeatablePropertyType,
  reconcilePropertyTypeChange,
  requiresPropertyName,
  requiresUnitNo,
  sanitizePropertyTypeForSubmission,
  supportsUnitNo,
} from "./premiseRepeatability.js";

const repeatableTypes = [
  "Flats",
  "Townhouse Complex",
  "Sectional Title",
  "Backroom",
  "Commercial",
  "Industrial",
  "Estate",
];

const nonRepeatableTypes = [
  "Residential",
  "Vacant Land",
  "Church",
  "School",
  "Government",
  "Select...",
  "",
  null,
  undefined,
];

test("defines the exact seven repeatable source Property Types", () => {
  assert.deepEqual(REPEATABLE_PROPERTY_TYPES, repeatableTypes);

  for (const type of repeatableTypes) {
    assert.equal(isRepeatablePropertyType(type), true, type);
  }

  for (const type of nonRepeatableTypes) {
    assert.equal(isRepeatablePropertyType(type), false, String(type));
  }
});

test("applies shared-development name KEEP and Unit Number CLEAR", () => {
  for (const type of [
    "Flats",
    "Townhouse Complex",
    "Sectional Title",
    "Backroom",
  ]) {
    const template = getDuplicatePropertyTypeTemplate({
      type,
      name: type === "Backroom" ? "Backroom" : "Shared Name",
      unitNo: "7",
    });

    assert.equal(template.type, type);
    assert.equal(
      template.name,
      type === "Backroom" ? "Backroom" : "Shared Name",
    );
    assert.equal(template.unitNo, "");
    assert.equal(getRepeatabilityPolicy(type)?.nameBehavior, "KEEP");
  }
});

test("applies convenience-duplication name CLEAR and Unit Number CLEAR", () => {
  for (const type of ["Commercial", "Industrial", "Estate"]) {
    const template = getDuplicatePropertyTypeTemplate({
      type,
      name: "Source Name",
      unitNo: "9",
    });

    assert.deepEqual(template, { type, name: "", unitNo: "" });
    assert.equal(getRepeatabilityPolicy(type)?.nameBehavior, "CLEAR");
  }
});

test("defaults a blank Backroom name while preserving a nonblank source name", () => {
  assert.equal(getDefaultPropertyName("Backroom"), "Backroom");
  assert.equal(getDefaultPropertyName("Flats"), "");

  assert.deepEqual(
    getDuplicatePropertyTypeTemplate({ type: "Backroom", name: "" }),
    { type: "Backroom", name: "Backroom", unitNo: "" },
  );

  assert.deepEqual(
    getDuplicatePropertyTypeTemplate({ type: "Backroom", name: "Rear Rooms" }),
    { type: "Backroom", name: "Rear Rooms", unitNo: "" },
  );
});

test("requires Unit Number for fresh Backrooms but grandfathers legacy Edit and Queue Edit", () => {
  const freshModes = ["NEW", "DUPLICATE"];
  for (const mode of freshModes) {
    assert.equal(
      requiresUnitNo("Backroom", {
        mode,
        originalType: "",
        originalUnitNo: "",
      }),
      true,
      mode,
    );
  }

  for (const mode of ["EDIT", "QUEUE_EDIT"]) {
    const context = {
      mode,
      originalType: "Backroom",
      originalUnitNo: "",
    };
    assert.equal(isLegacyBackroomWithoutUnitNo(context), true);
    assert.equal(requiresUnitNo("Backroom", context), false);
  }

  assert.equal(
    requiresUnitNo("Backroom", {
      mode: "EDIT",
      originalType: "Backroom",
      originalUnitNo: "1",
    }),
    true,
  );

  for (const type of ["Flats", "Sectional Title", "Townhouse Complex"]) {
    assert.equal(requiresUnitNo(type, { mode: "EDIT" }), true, type);
  }
});

test("supports optional Unit Number for all seven repeatable Property Types", () => {
  for (const type of repeatableTypes) {
    assert.equal(supportsUnitNo(type), true, type);
  }

  for (const type of [
    "Residential",
    "Vacant Land",
    "Church",
    "School",
    "Government",
  ]) {
    assert.equal(supportsUnitNo(type), false, type);
  }
});


test("keeps Commercial, Industrial and Estate Unit Number optional in fresh modes", () => {
  for (const type of ["Commercial", "Industrial", "Estate"]) {
    for (const mode of ["NEW", "DUPLICATE"]) {
      assert.equal(
        requiresUnitNo(type, { mode }),
        false,
        `${type} ${mode}`,
      );
    }
  }
});

test("reconciles dependent fields on Property Type change", () => {
  assert.deepEqual(reconcilePropertyTypeChange("Residential"), {
    name: "",
    unitNo: "",
  });
  assert.deepEqual(reconcilePropertyTypeChange("Backroom"), {
    name: "Backroom",
    unitNo: "",
  });
});

test("copies only currently capturable Property Status values", () => {
  for (const status of [
    "Occupied",
    "Unoccupied",
    "Vandalised",
    "Under Construction",
    "Dilapidated",
  ]) {
    assert.equal(getDuplicateInitialStatus(status), status);
  }

  for (const status of ["Accessed", "Select...", "Historic", "", null]) {
    assert.equal(getDuplicateInitialStatus(status), "Select...");
  }
});

test("sanitizes hidden name and Unit Number according to the final Property Type", () => {
  assert.deepEqual(
    sanitizePropertyTypeForSubmission({
      type: "Residential",
      name: "Block A",
      unitNo: "3",
    }),
    { type: "Residential", name: "", unitNo: "" },
  );

  assert.deepEqual(
    sanitizePropertyTypeForSubmission({
      type: "Commercial",
      name: "  Dry Cleaner  ",
      unitNo: " 99 ",
    }),
    { type: "Commercial", name: "Dry Cleaner", unitNo: "99" },
  );

  assert.deepEqual(
    sanitizePropertyTypeForSubmission({
      type: "Backroom",
      name: " Backroom ",
      unitNo: " 2 ",
    }),
    { type: "Backroom", name: "Backroom", unitNo: "2" },
  );
});


test("persists populated optional Unit Number for the complete convenience family", () => {
  for (const [type, name, unitNo] of [
    ["Commercial", "Dry Cleaner", "99"],
    ["Industrial", "Factory A", "I-4"],
    ["Estate", "Green Estate", "E-12"],
  ]) {
    assert.deepEqual(
      sanitizePropertyTypeForSubmission({
        type,
        name: `  ${name}  `,
        unitNo: `  ${unitNo}  `,
      }),
      { type, name, unitNo },
      type,
    );
  }
});

test("preserves hidden historic property sub-values on same-type Edit", () => {
  assert.deepEqual(
    sanitizePropertyTypeForSubmission(
      { type: "Residential", name: "", unitNo: "" },
      {
        mode: "EDIT",
        originalPropertyType: {
          type: "Residential",
          name: "Historic House Name",
          unitNo: "R-7",
        },
      },
    ),
    {
      type: "Residential",
      name: "Historic House Name",
      unitNo: "R-7",
    },
  );

  assert.deepEqual(
    sanitizePropertyTypeForSubmission(
      { type: "Residential", name: "Block A", unitNo: "3" },
      {
        mode: "EDIT",
        originalPropertyType: {
          type: "Flats",
          name: "Block A",
          unitNo: "3",
        },
      },
    ),
    { type: "Residential", name: "", unitNo: "" },
  );
});


test("preserves hidden historic property sub-values on same-type Queue Edit", () => {
  assert.deepEqual(
    sanitizePropertyTypeForSubmission(
      { type: "Residential", name: "", unitNo: "" },
      {
        mode: "QUEUE_EDIT",
        originalPropertyType: {
          type: "Residential",
          name: "Queued Historic Name",
          unitNo: "Q-8",
        },
      },
    ),
    {
      type: "Residential",
      name: "Queued Historic Name",
      unitNo: "Q-8",
    },
  );
});

test("preserves existing Property Name requirements", () => {
  assert.equal(requiresPropertyName("Residential"), false);
  assert.equal(requiresPropertyName("Vacant Land"), false);
  assert.equal(requiresPropertyName("Select..."), false);

  for (const type of repeatableTypes) {
    assert.equal(requiresPropertyName(type), true, type);
  }
});

test("formats repeatable card identity using available name and unit", () => {
  assert.equal(
    formatRepeatablePremiseIdentity({
      type: "Backroom",
      name: "Backroom",
      unitNo: "2",
    }),
    "Backroom | Unit 2",
  );
  assert.equal(
    formatRepeatablePremiseIdentity({
      type: "Estate",
      name: "House 6",
      unitNo: "",
    }),
    "House 6",
  );
  assert.equal(
    formatRepeatablePremiseIdentity({
      type: "Townhouse Complex",
      name: "",
      unitNo: "7",
    }),
    "Unit 7",
  );
  assert.equal(
    formatRepeatablePremiseIdentity({
      type: "Residential",
      name: "Hidden",
      unitNo: "1",
    }),
    "",
  );
});

test("confirmation copy follows the per-type name policy", () => {
  const flatMessage = getDuplicateConfirmationMessage("Flats");
  const commercialMessage = getDuplicateConfirmationMessage("Commercial");

  assert.match(flatMessage, /property\/unit name will be prefilled/i);
  assert.match(commercialMessage, /property\/unit name will start blank/i);
  assert.match(flatMessage, /remain editable/i);
  assert.match(commercialMessage, /GPS position are not copied/i);
  assert.equal(
    getDuplicateConfirmationMessage("Residential"),
    "This Premise cannot be duplicated.",
  );
});
