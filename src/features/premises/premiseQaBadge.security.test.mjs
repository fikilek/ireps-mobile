import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { getPremiseQaBadge } from "./premiseQaBadge.js";

test("exact ward premise stream delivers initial QA and later review/correction changes; denied clients stay denied", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.GCLOUD_PROJECT || "", /^demo-/);
  const require = createRequire("C:/dev/ireps-web/package.json");
  const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
  const api = require("firebase/firestore");
  const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT,
    firestore: { host: "127.0.0.1", port: 8087, rules: await readFile("C:/dev/ireps-web/firestore.rules", "utf8") } });
  let stop;
  t.after(async () => { stop?.(); await env.cleanup(); });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    await api.setDoc(api.doc(c.firestore(), "users/card-worker"), { accountStatus: "ACTIVE", employment: { role: "FWR" } });
    await api.setDoc(api.doc(c.firestore(), "users/card-disabled"), { accountStatus: "DISABLED", employment: { role: "FWR" } });
    await api.setDoc(api.doc(c.firestore(), "premises/card-premise"), { parents: { lmPcode: "ZA5241", wardPcode: "ZA5241006" }, metadata: { updatedAt: "2026-11-13T08:00:00Z" }, qa: { status: "QA_PENDING" } });
  });
  const source = await readFile(new URL("../../redux/premisesApi.js", import.meta.url), "utf8");
  const queryCode = source.slice(source.indexOf("function buildWardPremisesQuery("), source.indexOf("function sortPremisesByUpdatedAt("));
  const build = db => new Function("db", "query", "collection", "where", "orderBy", queryCode + ";return buildWardPremisesQuery;")(db, api.query, api.collection, api.where, api.orderBy)("ZA5241", "ZA5241006");
  const db = env.authenticatedContext("card-worker", { role: "FWR" }).firestore();
  let pending;
  const next = expected => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`No streamed ${expected}`)), 5000);
    pending = badge => { if(badge.label === expected){ clearTimeout(timer); resolve(badge); } };
  });
  const first = next("QA PENDING");
  const labels = [];
  stop = api.onSnapshot(build(db), snap => {
    const badge = getPremiseQaBadge(snap.docs[0]?.data());
    labels.push(badge.label); pending?.(badge);
  });
  await first;
  for (const state of ["QA_FAIL", "QA_PASS", "QA_PENDING"]) {
    const received = next(state.replaceAll("_", " "));
    await env.withSecurityRulesDisabled(c => api.updateDoc(api.doc(c.firestore(), "premises/card-premise"), { "qa.status": state }));
    await received;
  }
  assert.deepEqual(labels, ["QA PENDING", "QA FAIL", "QA PASS", "QA PENDING"]);
  await assertFails(api.getDocs(build(env.unauthenticatedContext().firestore())));
  await assertFails(api.getDocs(build(env.authenticatedContext("card-disabled").firestore())));
});
