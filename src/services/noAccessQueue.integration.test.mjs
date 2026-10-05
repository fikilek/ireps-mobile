import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { buildNoAccessPayload } from "../features/meters/noAccessCapture.js";
import { getMediaExtension } from "../utils/getMediaExtension.js";
import { thrownSubmissionRefusal } from "../utils/submissionRefusal.js";

const require = createRequire(import.meta.url);
const types = [
  ["METER_DISCOVERY", "onMeterDiscoveryCallable"],
  ["METER_INSTALLATION", "onMeterInstallationCallable"],
  ["METER_COMMISSIONING", "onCreateMeterCommissioningCallable"],
  ...["INSPECTION", "DISCONNECTION", "RECONNECTION", "REMOVAL", "READING"].map(type => [`METER_${type}`, "onMeterLifecycleTrnCallable"]),
];
const clone = value => JSON.parse(JSON.stringify(value));
const capturedAt = "2026-10-05T13:38:43.665Z";
const photo = { tag: "noAccessPhoto", uri: "file:///durable/evidence.png", type: "image" };

function harness(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse(capturedAt) });
  const data = new Map(), uploads = [], calls = [], cleanups = [];
  const state = { online: true, uploadMode: "success", reply: { success: true, code: "NO_ACCESS_RECORDED" } };
  const overrides = {
    "react-native-mmkv": { createMMKV: () => ({ getString: key => data.get(key), set: (key, value) => data.set(key, value) }) },
    "./persistNoAccessMeterDiscoveryMedia": { cleanupNoAccessMeterDiscoveryMedia: async info => { cleanups.push(info); } },
    "../utils/persistNoAccessMeterDiscoveryMedia": { cleanupNoAccessMeterDiscoveryMedia: async info => { cleanups.push(info); } },
    "@react-native-community/netinfo": { default: { fetch: async () => ({ isConnected: state.online, isInternetReachable: state.online }) }, __esModule: true },
    "../firebase": { functions: {} },
    "../utils/getMediaExtension": { getMediaExtension },
    "../utils/submissionRefusal": { thrownSubmissionRefusal },
    "firebase/functions": { httpsCallable: (_functions, name) => async payload => {
      calls.push({ name, payload: clone(payload) });
      if (state.reply instanceof Error) throw state.reply;
      return { data: state.reply };
    } },
    "firebase/storage": {
      getStorage: () => ({}), ref: (_storage, path) => path,
      deleteObject: async () => { throw new Error("No Access evidence must survive a refusal"); },
      getDownloadURL: async path => `https://example.test/${path}`,
      uploadBytesResumable: (path, blob) => {
        uploads.push({ path, blob });
        let reject;
        const promise = state.uploadMode === "success" ? Promise.resolve() : new Promise((_resolve, fail) => { reject = fail; });
        promise.cancel = () => reject(Object.assign(new Error("User canceled the upload"), { code: "storage/canceled" }));
        return promise;
      },
    },
  };
  function load(relative) {
    const filename = fileURLToPath(new URL(relative, import.meta.url));
    const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
    });
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module, exports: module.exports, require: name => overrides[name] || require(name),
      console: { log() {}, warn() {} }, Date,
      fetch: async () => ({ blob: async () => ({ size: 44502 }) }),
      setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    }, { filename });
    return module.exports;
  }
  const queue = load("../utils/submissionQueue.js");
  overrides["../utils/submissionQueue"] = queue;
  const { processSubmissionQueue } = load("./processSubmissionQueue.js");
  return {
    state, uploads, calls, cleanups, queue,
    async save(type, returning = false) {
      const payload = buildNoAccessPayload({
        context: { trnType: type, premiseId: "P1", erfId: "E1", erfNo: "5249", lmPcode: "LM", wardPcode: "WARD" },
        trnId: `TRN_${type}_NA`, capturedAt, actor: { uid: "U1", name: "Worker" },
        value: returning ? { reasonCode: "Return visit requested", appointment: { at: "2026-10-06T10:00:00Z", madeAt: capturedAt } } : { reasonCode: "Meter Obstructed" },
        media: returning ? [] : [photo],
      });
      const saved = await queue.addSubmissionQueueItem({ formType: type, payload, context: { trnType: type } });
      assert.equal(saved.success, true);
      return saved.queueItem;
    },
    send: () => processSubmissionQueue({ agentUid: "U1", agentName: "Worker", filterMode: "AUTO_SEND", includeSyncing: true }),
  };
}

for (const [type, callable] of types) {
  test(`${type}: offline evidence survives, reconnect sends once through the correct callable`, async t => {
    const h = harness(t);
    const saved = await h.save(type);
    h.state.online = false;
    assert.equal((await h.send()).code, "DEVICE_OFFLINE");
    assert.equal(h.uploads.length, 0);
    assert.equal(h.calls.length, 0);
    h.state.online = true;
    assert.equal((await h.send()).success, true);
    assert.equal(h.uploads.length, 1);
    assert.ok(h.uploads[0].path.endsWith("_noAccessPhoto.png"));
    assert.equal(h.calls[0].name, callable);
    assert.equal(h.calls[0].payload.id, saved.payload.id);
    assert.deepEqual(h.calls[0].payload.metadata, clone(saved.payload.metadata));
    assert.equal(h.calls[0].payload.accessData.access.appointment, null);
    assert.equal(h.calls[0].payload.media[0].uri, photo.uri);
    assert.ok(h.calls[0].payload.media[0].url);
    assert.equal((await h.queue.getSubmissionQueueItemById(saved.id)).status, "SUCCESS");
    assert.equal(h.cleanups.length, 1);
    await h.send();
    assert.equal(h.calls.length, 1, "A confirmed capture is not sent again");
  });

  test(`${type}: a stalled upload reports a timeout, preserves evidence and retries the same capture`, async t => {
    const h = harness(t);
    const saved = await h.save(type);
    h.state.uploadMode = "stalled";
    const sending = h.send();
    // Flush the real queue's asynchronous local reads until it starts the upload.
    for (let step = 0; step < 30 && !h.uploads.length; step++) await Promise.resolve();
    assert.equal(h.uploads.length, 1);
    assert.equal((await h.send()).code, "QUEUE_BUSY");
    t.mock.timers.tick(60000);
    assert.equal((await sending).code, "QUEUE_PENDING");
    const pending = await h.queue.getSubmissionQueueItemById(saved.id);
    assert.equal(pending.status, "PENDING");
    assert.equal(pending.result.code, "STORAGE_UPLOAD_TIMEOUT");
    assert.doesNotMatch(pending.result.message, /user canceled/i);
    assert.deepEqual(clone(pending.payload), clone(saved.payload));
    assert.equal(h.calls.length, 0);
    assert.equal(h.cleanups.length, 0);
    h.state.uploadMode = "success";
    assert.equal((await h.send()).success, true);
    assert.equal(h.calls[0].name, callable);
    assert.equal(h.calls[0].payload.id, saved.payload.id);
    assert.equal(h.calls[0].payload.metadata.createdOnDevice, capturedAt);
  });

  test(`${type}: queued return visit keeps the agreed time without any upload`, async t => {
    const h = harness(t);
    const saved = await h.save(type, true);
    t.mock.timers.tick(2 * 86400000);
    await h.send();
    assert.equal(h.uploads.length, 0);
    assert.equal(h.calls[0].name, callable);
    assert.deepEqual(h.calls[0].payload.accessData.access.appointment, clone(saved.payload.accessData.access.appointment));
    assert.equal(h.calls[0].payload.metadata.createdOnDevice, capturedAt);
  });

  test(`${type}: returned and thrown server refusals stop retries while keeping evidence`, async t => {
    const h = harness(t);
    const saved = await h.save(type);
    h.state.reply = type === "METER_INSTALLATION"
      ? Object.assign(new Error("Appointment is invalid"), { code: "functions/failed-precondition", details: { code: "NO_ACCESS_APPOINTMENT_REQUIRED", message: "Appointment is invalid" } })
      : { success: false, code: "NO_ACCESS_APPOINTMENT_REQUIRED", message: "Appointment is invalid" };
    await h.send();
    const refused = await h.queue.getSubmissionQueueItemById(saved.id);
    assert.equal(refused.status, "CONFLICT");
    assert.equal(refused.result.code, "NO_ACCESS_APPOINTMENT_REQUIRED");
    assert.equal(h.cleanups.length, 0);
    assert.equal(refused.payload.media[0].uri, photo.uri);
    await h.send();
    assert.equal(h.calls.length, 1);
  });
}
