import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { transformSync } = require("@babel/core");

test("shared card renders the same six tiles, metadata and actions for both adapters", async () => {
  const source = await readFile(new URL("../../components/workOrders/BatchCardPresentation.js", import.meta.url), "utf8");
  const js = transformSync(source.replace(/^import .*;\r?\n/gm, "").replace("export default function", "function"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx")],
  }).code;
  const Card = new Function("React", "Text", "View", "MaterialCommunityIcons", js + ";return BatchCardPresentation;")(
    React, "Text", "View", "Icon",
  );
  const keys = ["total", "notStarted", "inProgress", "completed", "qaPass", "qaFail"];
  const styles = new Proxy({}, { get: (_target, key) => key });
  const tiles = keys.map((key) => ({ key, summaryKey: key, label: key, color: "blue" }));
  const text = (node) => node == null ? [] : Array.isArray(node) ? node.flatMap(text) : typeof node === "object" ? text(node.props?.children) : [node];
  for (const title of ["Targeted Batch • TB_TEST", "MD_BGO_TEST_ID"]) {
    const tree = Card({ styles, icon: "map", status: "Accepted", title, subtitle: "subtitle", tiles,
      counts: { total: 3, notStarted: 1, inProgress: 1, completed: 1, qaPass: null, qaFail: null },
      metadata: React.createElement("Text", null, "Geofence"), children: React.createElement("Button", null, "VIEW ROWS"),
    });
    const labels = text(tree);
    assert.ok(labels.includes(title));
    assert.equal(labels.filter((v) => v === "NAv").length, 2);
    for (const key of keys) assert.ok(labels.includes(key));
    assert.ok(labels.includes("Geofence"));
    assert.ok(labels.includes("VIEW ROWS"));
  }
});
