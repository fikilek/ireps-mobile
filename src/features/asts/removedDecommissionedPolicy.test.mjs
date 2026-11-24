import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

test("mobile AST actions and forms allow INSP and conventional MREAD across REMOVED and DECOMMISSIONED while gating DCN/RCN/REM", () => {
  const astItem = fs.readFileSync(path.join(repoRoot, "src/features/asts/astItem.js"), "utf8");
  const inspection = fs.readFileSync(path.join(repoRoot, "app/(tabs)/asts/inspection.js"), "utf8");
  const meterReading = fs.readFileSync(path.join(repoRoot, "app/(tabs)/asts/meter-reading.js"), "utf8");

  assert.match(astItem, /const canInspect = \["FIELD", "CONNECTED", "DISCONNECTED", "REMOVED", "DECOMMISSIONED"\]\.includes\(\s*meterState,\s*\);/);
  assert.match(astItem, /const canDisconnect = meterState === "CONNECTED";/);
  assert.match(astItem, /const canReconnect = meterState === "DISCONNECTED";/);
  assert.match(astItem, /const canRemove = \["FIELD", "CONNECTED", "DISCONNECTED"\]\.includes\(meterState\);/);
  assert.match(astItem, /const canMeterRead = isConventionalMeter;/);

  assert.doesNotMatch(inspection, /DECOMMISSIONED meters cannot be inspected\./);
  assert.doesNotMatch(meterReading, /Meter Reading is not allowed for DECOMMISSIONED meters\./);
});
