import test from "node:test";
import assert from "node:assert/strict";
import { formatStreetAddress, streetNameCarriesType } from "./streetAddress.js";

test("the street type is not repeated when the name already carries it", () => {
  assert.equal(
    formatStreetAddress({ strNo: "26", strName: "OLDACRE ST", strType: "Street" }),
    "26 OLDACRE ST",
  );
  assert.equal(
    formatStreetAddress({ strNo: "12", strName: "Main Street", strType: "Street" }),
    "12 Main Street",
  );
  assert.equal(
    formatStreetAddress({ strNo: "4", strName: "Karel Landman", strType: "Road" }),
    "4 Karel Landman Road",
    "a name without its type still gets one",
  );
});

test("the usual short forms count as the type", () => {
  assert.equal(streetNameCarriesType("OLDACRE ST", "Street"), true);
  assert.equal(streetNameCarriesType("Church Str", "Street"), true);
  assert.equal(streetNameCarriesType("Hill Rd", "Road"), true);
  assert.equal(streetNameCarriesType("Oak Ave", "Avenue"), true);
  assert.equal(streetNameCarriesType("Long Cres.", "Crescent"), true);
  assert.equal(streetNameCarriesType("Karel Landman", "Road"), false);
  assert.equal(streetNameCarriesType("Stanger", "Street"), false, "a name that merely starts with st");
  assert.equal(streetNameCarriesType("", "Street"), false);
  assert.equal(streetNameCarriesType("Main Street", ""), false);
});

test("what is missing is simply left out", () => {
  assert.equal(formatStreetAddress({ strName: "Main", strType: "Street" }), "Main Street");
  assert.equal(formatStreetAddress({ strNo: "26", strName: "OLDACRE ST", strType: "Select..." }), "26 OLDACRE ST");
  assert.equal(formatStreetAddress({}), "");
  assert.equal(
    formatStreetAddress({ strNo: "26", strName: "OLDACRE ST", strType: "Street" }, { withNumber: false }),
    "OLDACRE ST",
  );
});
