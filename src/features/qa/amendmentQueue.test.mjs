import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
const require = createRequire(import.meta.url);
const filename = new URL("./amendmentQueue.js", import.meta.url);
const code = transformSync(fs.readFileSync(filename, "utf8"), { babelrc: false, configFile: false,
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] }).code;
function setup(values = new Map()) {
  const calls = [], uploads = [], copies = [], files = new Map();
  let serial = 0, failure = null, resolveCall;
  const auth = { currentUser: { uid: "worker" } };
  const modules = {
    "react-native-mmkv": { createMMKV: () => ({ getString: key => values.get(key), getAllKeys: () => [...values.keys()], set: (key, value) => values.set(key, value), remove: key => values.delete(key) }) },
    "react-native-uuid": { v4: () => `uuid-${++serial}` },
    "expo-file-system/legacy": { documentDirectory: "file:///documents/", makeDirectoryAsync: async () => {}, copyAsync: async value => copies.push(value), getInfoAsync: async () => ({ exists: true }) },
    "../../firebase": { auth, functions: {}, storage: {} },
    "firebase/functions": { httpsCallable: () => async request => { calls.push(JSON.parse(JSON.stringify(request))); if (failure) throw failure;
      if (resolveCall) await new Promise(resolve => { resolveCall = resolve; });
      return { data: { success: true, amendment: { state: "UPDATED" } } }; } },
    "firebase/storage": { ref: (_storage, path) => path, getDownloadURL: async path => { if (!files.has(path)) throw { code: "storage/object-not-found" }; return files.get(path); }, uploadBytes: async (path, _blob, metadata) => { uploads.push({ path, metadata }); files.set(path, `https://storage.invalid/${path}`); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { if (!(name in modules)) throw Error(name); return modules[name]; }, console,
    fetch: async () => ({ blob: async () => ({ close() {} }) }) });
  return { ...module.exports, auth, calls, uploads, copies, values,
    fail: value => { failure = value; }, pause: () => { resolveCall = true; }, resume: () => resolveCall(),
    draft: { requestId: "r1", context: { trnId: "t1" }, values: { media: [] }, pending: { trnId: "t1", requestId: "r1", fields: { media: [{ uri: "file:///photo.jpg", tag: "astNoPhoto" }] } } } };
}
test("durable evidence and ambiguous callable retry reuse one upload and one request", async () => {
  const q = setup();
  const media = await q.persistQaMedia("worker", "r1", q.draft.pending.fields.media);
  assert.equal(q.copies.length, 1); assert.match(media[0].uri, /documents\/ireps\/qa\/worker\/r1/);
  q.draft.pending.fields.media = media;
  q.putQaDraft("worker", "t1", q.draft);
  q.fail({ code: "functions/deadline-exceeded", message: "response lost" });
  await assert.rejects(q.sendQaDraft("worker", "t1"));
  assert.equal(q.getQaDraft("worker", "t1").sent, true);
  assert.equal(q.uploads.length, 1); assert.equal(q.getQaDraft("worker", "t1").pending.fields.media[0].uri, undefined);
  q.fail(null); await q.sendQaDraft("worker", "t1");
  assert.equal(q.uploads.length, 1); assert.deepEqual(q.calls[1], q.calls[0]);
  assert.equal(q.getQaDraft("worker", "t1"), null);
});
test("a definitive meter conflict retains the phone draft and unlocks it for acknowledgement", async () => {
  const q = setup(); q.putQaDraft("worker", "t1", q.draft);
  q.fail({ code: "functions/failed-precondition", message: "newer meter", details: { kind: "RETAIN_METER_FACTS" } });
  await assert.rejects(q.sendQaDraft("worker", "t1"));
  const draft = q.getQaDraft("worker", "t1");
  assert.equal(draft.pending, null); assert.equal(draft.sent, false); assert.equal(draft.conflict.kind, "RETAIN_METER_FACTS");
  assert.equal(draft.rejectedRequest.requestId, "r1");
});
test("two send taps share one in-flight request; another account cannot send it", async () => {
  const q = setup(); q.putQaDraft("worker", "t1", q.draft);
  const a = q.sendQaDraft("worker", "t1"), b = q.sendQaDraft("worker", "t1");
  assert.equal(a, b); await a; assert.equal(q.calls.length, 1);
  q.putQaDraft("worker", "t1", q.draft); q.auth.currentUser.uid = "other";
  await assert.rejects(q.sendQaDraft("worker", "t1"), /account/); assert.equal(q.calls.length, 1);
  assert.equal(q.listQaDrafts("other").length, 0);
});


test("restart retains an uncertain request; account switch cannot replay it; confirmed replay clears it", async () => {
  const first = setup();
  first.draft.pending.fields.media = [];
  first.putQaDraft("worker", "t1", first.draft);
  first.fail({ code: "functions/unavailable", message: "Accepted but acknowledgement lost" });
  await assert.rejects(first.sendQaDraft("worker", "t1"));
  const restarted = setup(first.values);
  assert.ok(restarted.getQaDraft("worker", "t1").pending);
  restarted.auth.currentUser.uid = "other";
  await assert.rejects(restarted.sendQaDraft("worker", "t1"), /account/);
  assert.equal(restarted.calls.length, 0);
  assert.ok(restarted.getQaDraft("worker", "t1").pending);
  restarted.auth.currentUser.uid = "worker";
  await restarted.sendQaDraft("worker", "t1");
  assert.deepEqual(restarted.calls[0], first.calls[0]);
  assert.equal(restarted.getQaDraft("worker", "t1"), null);
});
