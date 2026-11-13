import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { getPremiseQaBadge } from "./premiseQaBadge.js";
import * as repeatability from "./premiseRepeatability.js";

for (const [status, label, color] of [
  ["QA_FAIL", "QA FAIL", "#b91c1c"],
  ["QA_PASS", "QA PASS", "#15803d"],
  ["QA_PENDING", "QA PENDING", "#92400e"],
  ["QA FAIL", "QA FAIL", "#b91c1c"],
  [undefined, "QA NAv", "#64748b"],
  ["unrecognized", "QA NAv", "#64748b"],
]) test(`canonical ${status} displays ${label}`, () => {
  const badge = getPremiseQaBadge({ qa: { status }, occupancy: { status: "Accessed" }, qaStatus: "QA_PASS" });
  assert.equal(badge.label, label);
  assert.equal(badge.color, color);
});

test("actual shared card places live QA below its property icon and preserves operational ribbon", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { transformSync } = require("@babel/core");
  const source = await readFile(new URL("./PremiseCard.js", import.meta.url), "utf8");
  const js = transformSync(source, { babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")] }).code;
  const native = { StyleSheet: { create: x => x }, View: "View", Text: "Text", TouchableOpacity: "TouchableOpacity", Pressable: "Pressable", Alert: {} };
  const imports = {
    react: { ...React, memo: fn => fn }, "react-native": native,
    "@expo/vector-icons": { MaterialCommunityIcons: "Icon" },
    "expo-router": { useRouter: () => ({}) },
    "../../context/GeoContext": { useGeo: () => ({ geoState: {}, updateGeo() {} }) },
    "../../context/WarehouseContext": { useWarehouse: () => ({ all: { erfs: [] } }) },
    "../targetedBatches/targetedBatchContextCarry": { erfWithCarriedBatchContext: x => x },
    "../../utils/updatedAtLabel": { updatedAtLabel: () => "Updated today" },
    "./premiseRepeatability": repeatability, "./premiseQaBadge": { getPremiseQaBadge },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "React", js)(id => {
    assert.ok(imports[id], `Unexpected dependency ${id}`); return imports[id];
  }, module, module.exports, React);
  const Card = module.exports.default;
  const flatten = tree => tree == null ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : typeof tree === "object" ? [tree, ...flatten(tree.props?.children)] : [tree];
  for (const status of ["QA_FAIL", "QA_PASS", "QA_PENDING", undefined]) {
    const item = { id: "P", qa: { status }, occupancy: { status: "Pending" }, address: { strNo: "3577", strName: "Starling Street" }, propertyType: { type: "Residential" } };
    const nodes = flatten(Card({ item, wardNo: "006" }));
    const label = getPremiseQaBadge(item).label;
    const badge = nodes.find(n => n?.props?.accessibilityLabel === `Premise ${label}`);
    assert.ok(badge, `${label} renders from changed item`);
    const column = nodes.find(n => n?.props?.style?.width === 64);
    const children = column.props.children;
    assert.equal(children[0].type, "TouchableOpacity", "original property icon action remains first");
    assert.equal(children[1], badge, "QA badge is directly below the property icon");
    assert.ok(flatten(badge).includes(label));
    assert.ok(nodes.includes("PENDING"), "operational ribbon is separate from QA");
  }
});
