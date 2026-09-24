import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRowPremiseChoices,
  choiceStatusText,
  premiseNameLabel,
  premiseTitle,
  rowPremiseChoiceNeeded,
} from "./rowPremiseChoice.js";

// TB-R067 (1.3.73): ERF 689, one address, thirteen businesses, thirteen rows.
const premises = [
  { id: "P1", erfId: "E689", propertyType: { type: "Commercial", name: "Kwik Fit", unitNo: "1" } },
  { id: "P2", erfId: "E689", propertyType: { type: "Commercial", name: "TFS Wholesalers", unitNo: "2" } },
  { id: "P3", erfId: "E689", propertyType: { type: "Industrial", name: "P J Motors", unitNo: "3" } },
  { id: "P9", erfId: "E700", propertyType: { type: "Flats", name: "Block A", unitNo: "5" } },
];

const rows = [
  { id: "R1", refs: { premiseId: "P1" }, meterNo: "04297698179" },
  { id: "R2", refs: {} },
  { id: "R3", refs: { premiseId: "P3" }, meterNo: "04297699854" },
];

test("only the premises on the row's own ERF are offered", () => {
  const choices = buildRowPremiseChoices({ premises, rows, currentRowId: "R2", erfId: "E689" });
  assert.deepEqual(choices.map((choice) => choice.premiseId), ["P1", "P3", "P2"]);
});

test("a premise on another row is listed but cannot be picked (TB-R067 5)", () => {
  const choices = buildRowPremiseChoices({ premises, rows, currentRowId: "R2", erfId: "E689" });
  const byId = Object.fromEntries(choices.map((choice) => [choice.premiseId, choice]));

  assert.equal(byId.P1.selectable, false);
  assert.equal(choiceStatusText(byId.P1), "Joined to meter 04297698179");
  assert.equal(byId.P2.selectable, true, "a premise nobody has joined is free");
  assert.equal(choiceStatusText(byId.P2), "Not joined");
});

test("the row's own premise is named as its own and stays open to it", () => {
  const choices = buildRowPremiseChoices({ premises, rows, currentRowId: "R1", erfId: "E689" });
  const own = choices.find((choice) => choice.premiseId === "P1");

  assert.equal(own.isOwnRow, true);
  assert.equal(own.selectable, true);
  assert.equal(choiceStatusText(own), "This row's premise");
});

test("a business is asked for its business name, a flat for its unit name (TB-R067 8)", () => {
  assert.equal(premiseNameLabel("Commercial"), "Business Name");
  assert.equal(premiseNameLabel("industrial"), "Business Name");
  assert.equal(premiseNameLabel("Flats"), "Unit Name");
  assert.equal(premiseNameLabel("Townhouse Complex"), "Unit Name");
  assert.equal(premiseNameLabel("Sectional Title"), "Unit Name");
  assert.equal(premiseNameLabel("Backroom"), "Unit Name");
  assert.equal(premiseNameLabel(""), "Unit Name");
});

test("a premise is shown by what it knows about itself, never by a meter", () => {
  assert.equal(premiseTitle(premises[0]), "Kwik Fit · No 1");
  assert.equal(premiseTitle({ id: "P4", propertyType: { type: "Commercial", name: "Veg Shop" } }), "Veg Shop");
  assert.equal(premiseTitle({ id: "P5", propertyType: { type: "Flats", unitNo: "12" } }), "No 12");
  assert.equal(premiseTitle({ id: "P6" }), "P6", "with nothing filled in, its own id");
});

test("an ERF with no premises asks nothing: the New premise form opens (TB-R067 1)", () => {
  assert.equal(rowPremiseChoiceNeeded(buildRowPremiseChoices({ premises: [], rows, erfId: "E689" })), false);
  assert.equal(rowPremiseChoiceNeeded(buildRowPremiseChoices({ premises, rows, erfId: "E999" })), false);
  assert.equal(rowPremiseChoiceNeeded(buildRowPremiseChoices({ premises, rows, erfId: "E689" })), true);
});

test("a premise with no id is never offered", () => {
  const choices = buildRowPremiseChoices({
    premises: [...premises, { erfId: "E689", propertyType: { type: "Commercial", name: "Nameless" } }],
    rows,
    erfId: "E689",
  });
  assert.equal(choices.length, 3);
});
