// UI-R003: every dropdown on a field form is a list on the phone, so a worker
// who is offline still gets every list.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getLocalSelectLookup,
  getManufacturerListName,
} from "./formOptions.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const FIELD_FORMS = [
  "src/features/meters/FormMeterDiscovery.js",
  "src/features/meters/FormMeterIstallation.js",
  "app/(tabs)/asts/inspection.js",
  "app/(tabs)/asts/disconnection.jsx",
  "app/(tabs)/asts/reconnection.jsx",
  "app/(tabs)/asts/removal.jsx",
  "app/(tabs)/asts/meter-reading.js",
  "components/forms/ElectricitySections.js",
  "components/forms/WaterSections.js",
  "components/forms/AnomalySection.js",
];

test("no field form reads a dropdown from the server", () => {
  for (const file of FIELD_FORMS) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const serverList of [
      "useIrepsLookupOptions",
      "useMeterFormLookupOptions",
      "irepsSelectLookupsApi",
      "irepsLookupOptionsApi",
    ]) {
      assert.equal(source.includes(serverList), false, `${file} uses ${serverList}`);
    }
  }
});

test("every list is there at once, with nothing to load", () => {
  for (const name of [
    "no_reading_reasons",
    "removal_instructions",
    "meter_reading_instructions",
    "placements",
    "meter_phases",
    "meter_statuses",
    "meter_lifecycle_states",
    "elec_manufacturers",
    "water_manufacturers",
  ]) {
    const lookup = getLocalSelectLookup(name);
    assert.ok(lookup.options.length > 0, name);
    assert.equal(lookup.isLoading || lookup.isFetching || lookup.loading, false, name);
    for (const option of lookup.options) {
      assert.ok(option.code && option.label, `${name}: ${JSON.stringify(option)}`);
    }
  }
});

test("the select adds Other itself, so a list never carries it twice", () => {
  for (const name of ["placements", "elec_manufacturers", "water_manufacturers"]) {
    const labels = getLocalSelectLookup(name).options.map((o) => o.label);
    assert.equal(labels.includes("Other"), false, name);
  }
});

test("the lists that came from the server keep the server's words and codes", () => {
  assert.deepEqual(
    getLocalSelectLookup("no_reading_reasons").options.map((o) => o.code),
    [
      "CUSTOMER_REFUSED_ACCESS",
      "DISPLAY_BLANK",
      "DISPLAY_DAMAGED",
      "DISPLAY_NOT_WORKING",
      "METER_BOX_LOCKED",
      "METER_NOT_ACCESABLE",
      "METER_REMOVED_OR_MISSING",
      "NO_ACCESS_TO_PREMISES",
    ],
  );
  assert.deepEqual(getLocalSelectLookup("removal_instructions").options, [
    { code: "METER_REMOVE_DECOMMISION", label: "Meter remove decommission" },
  ]);
  assert.equal(getLocalSelectLookup("meter_reading_instructions").options.length, 6);
});

test("a worker chooses Connected or Disconnected; the record may hold any state", () => {
  assert.deepEqual(
    getLocalSelectLookup("meter_statuses").options.map((o) => o.code),
    ["CONNECTED", "DISCONNECTED"],
  );
  assert.deepEqual(
    getLocalSelectLookup("meter_lifecycle_states").options.map((o) => o.code),
    ["FIELD", "CONNECTED", "DISCONNECTED", "REMOVED", "DECOMMISSIONED"],
  );
});

test("manufacturers follow the meter type, as on Meter Discovery", () => {
  assert.equal(getManufacturerListName("water"), "water_manufacturers");
  assert.equal(getManufacturerListName("Water"), "water_manufacturers");
  assert.equal(getManufacturerListName("electricity"), "elec_manufacturers");
  assert.equal(getManufacturerListName("NAv"), "elec_manufacturers");
});
