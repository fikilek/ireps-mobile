import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { transformSync } = require("@babel/core");
const source = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("function BucketTypeLanding("), source.indexOf("function BucketTypeCard("));
const js = transformSync(code, { babelrc: false, configFile: false, plugins: [require.resolve("@babel/plugin-transform-react-jsx")] }).code;
const Landing = new Function("React", "ScrollView", "Text", "View", "BucketTypeCard", "styles", js + ";return BucketTypeLanding;")(React, "ScrollView", "Text", "View", "BucketTypeCard", {});
const nodes = tree => tree == null ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
test("actual landing cards use audit names and preserve counts and open actions", () => {
  let opened;
  const cards = nodes(Landing({ targetedCount: 3, bgoCount: 1, onOpen: value => { opened = value; } })).filter(n => n.type === "BucketTypeCard");
  const targeted = cards.find(c => c.props.title === "Targeted Audit Batches");
  const sweep = cards.find(c => c.props.title === "Sweep Audit Batches");
  assert.equal(targeted.props.count, 3); assert.equal(sweep.props.count, 1);
  targeted.props.onPress(); assert.equal(opened, "TBB");
  sweep.props.onPress(); assert.equal(opened, "BGOB");
  const individual = cards.find(c => c.props.title === "Adhoc Trns (Individual)");
  assert.ok(individual); individual.props.onPress(); assert.equal(opened, "INDVG");
});
test("batch-list headings match their landing card audit names", () => {
  assert.match(source, /styles.sectionTitle}>Targeted Audit Batches<\/Text>/);
  assert.match(source, /styles.sectionTitle}>Sweep Audit Batches<\/Text>/);
});
